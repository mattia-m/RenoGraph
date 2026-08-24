# Renograph

Renograph turns a renovation into a living dependency graph. It shows what is
ready, what is blocked and why, which activities determine the finish date, and
what happens when a task changes.

The contest MVP is a complete runnable application around the canonical Casa
Rossi renovation. It uses Wavebinder as the live reactive dependency runtime,
while renovation-specific scheduling, critical-path analysis, costing and
scenario comparison remain explicit Renograph domain logic.

## Quick Start

Requirements: Node.js 20+ and a valid Wavebinder license.

```bash
git clone https://github.com/mattia-m/RenoGraph.git
cd RenoGraph
npm install
export WAVEBINDER_LICENSE='<license JSON on one line>'
npm run dev
```

Open `http://localhost:5173`.

The API runs on `http://localhost:3001`. The frontend proxies `/api` to it.
The supplied license must not be committed; use an environment variable or a
local ignored `.env` file.

Production build:

```bash
npm run build
WAVEBINDER_LICENSE='<license JSON>' npm start
```

Docker Compose:

```bash
export WAVEBINDER_LICENSE='<license JSON>'
docker compose up --build
```

## Demo Script

1. Open Casa Rossi and inspect the full dependency graph.
2. Select `Bathroom plumbing`; it is `READY` because demolition is complete.
3. Start it, then mark it complete. Wavebinder updates downstream facts and Renograph derives the next readiness state.
4. Select `Bathroom tiling` or `Install fixtures` to inspect direct dependencies and root blocker chains.
5. Highlight the critical path to see the CPM result on the graph.
6. Select a task and run a what-if delay. The result shows completion, cost, critical-path and affected-node deltas without mutating baseline state.
7. Select a material and mark it delivered to release its dependent work.

The complete repeatable runbook is in [`DEMO.md`](DEMO.md).

## Demo In 60 Seconds

1. Select `Bathroom plumbing` and complete it.
2. Watch downstream readiness update.
3. Select a blocked task and inspect its root blocker.
4. Highlight critical tasks.
5. Simulate `Bathroom tiles +14 days`.
6. Compare completion, cost and affected tasks.
7. Open the runtime telemetry and show `COMPLEX`, `MULTI`, `LIST`, derived
   nodes, subscriptions and propagation events.

## Architecture

```text
React + React Flow
        |
        | HTTP
        v
Express API
        |
        +-- RenovationStore / JSON persistence
        +-- Wavebinder runtime graph
        +-- Ready and blocker derivation
        +-- Scheduling and CPM
        +-- Scenario simulation
```

The application is one deployable process. The browser receives graph-friendly
JSON and never sees internal Wavebinder objects.

```text
Canonical Renograph Model
tasks / materials / relationships
              |
              v
       Wavebinder Mapper
          /          \
         v            v
 Baseline Runtime  Scenario Runtime
 COMPLEX/MULTI/LIST  isolated changes
 derived state       reactive events
 subscriptions       nukeNodes teardown
          \          /
           v        v
      Renograph Analysis
       CPM / cost / impact
              |
              v
          React UI
```

## Why Wavebinder?

| Renograph concern | Wavebinder responsibility |
| --- | --- |
| Task and material facts | Declarative Wavebinder nodes |
| Task dependencies | `dep` relationships with `onUpdate: true` |
| Derived readiness | `CUSTOM_FUNCTION` nodes depending on all prerequisites |
| Material availability | Material fact nodes feeding task readiness |
| Material variants | `MULTI` choices with reactive availability |
| Room material bundles | `LIST` nodes reconstructed from room requirements |
| Structured task state | `COMPLEX` nodes with status, duration and cost fields |
| Runtime propagation | RxJS node subscriptions and `.next()` updates |
| Independent runtime | A separate `WaveBinder` instance per graph runtime |
| Runtime teardown | `nukeNodes()` during lifecycle cleanup |

| Renograph concern | Renograph responsibility |
| --- | --- |
| Renovation semantics | `NodeType`, statuses and relationship rules |
| Cycle validation | Domain graph validation before topology changes |
| Schedule | Topological earliest/latest pass |
| Critical path | CPM slack calculation |
| Cost | Domain aggregation and scenario deltas |
| Scenario comparison | Clone, change, recalculate and compare |
| Persistence | Canonical JSON snapshot; derived values are rebuilt |

Wavebinder is not falsely credited with CPM or renovation semantics. It owns
the reactive graph state; Renograph owns renovation intelligence.

## Domain Model

Initial node types are `ROOM`, `TASK` and `MATERIAL`. Relationships are
`DEPENDS_ON`, `LOCATED_IN` and `REQUIRES_MATERIAL`. Persisted status is kept for
facts such as completion and work in progress. For ordinary tasks, `READY` and
`BLOCKED` are derived from Wavebinder dependency state during runtime rebuild.

The demo contains 33 nodes and more than 50 meaningful relationships across
bathroom, kitchen, living room and whole-apartment work.

It includes chains, fan-in, fan-out, diamond-shaped dependencies, material
requirements and alternative material choices.

## API

Implemented endpoints include:

```text
GET  /api/health
GET  /api/renovations/:id
GET  /api/renovations/:id/graph
GET  /api/renovations/:id/summary
GET  /api/renovations/:id/ready
GET  /api/renovations/:id/blocked
GET  /api/renovations/:id/critical-path
GET  /api/renovations/:id/nodes/:nodeId
GET  /api/renovations/:id/nodes/:nodeId/blockers
PATCH /api/renovations/:id/nodes/:nodeId
POST /api/renovations/:id/nodes/:nodeId/start
POST /api/renovations/:id/nodes/:nodeId/complete
POST /api/renovations/:id/nodes/:nodeId/block
POST /api/renovations/:id/scenarios
POST /api/renovations/:id/relationships
DELETE /api/renovations/:id/relationships/:relationshipId
GET  /api/renovations/:id/runtime/events
POST /api/renovations/:id/nodes/:nodeId/select-option
```

## Testing

```bash
npm run typecheck
npm test
npm run build
npm run benchmark
```

The tests cover chains, diamonds, parallel slack, blocker roots, cycle
rejection, critical delays, critical-path changes, non-critical delays, seed
graph shape and baseline immutability. Licensed integration tests cover the
real Wavebinder runtime when `WAVEBINDER_LICENSE` is configured. The executable
Wavebinder spikes are in `spike/`.

The benchmark reports median and p95 timings for scheduling. With a license it
also measures Wavebinder runtime construction and isolated scenario analysis.
It reports the environment and never invents performance numbers.

## Technical Decisions

- JSON persistence keeps the contest demo zero-setup and restart-safe.
- PostgreSQL is intentionally not required for the MVP; the persistence seam is
  isolated in `RenovationStore` for a later repository implementation.
- Wavebinder is initialized only after a license is supplied and the API fails
  loudly if its runtime is unavailable.
- Scenario state is created through `structuredClone`, never by mutating the
  baseline object.
- Every schedule treats calendar days as working days for determinism.
- Relationship topology changes rebuild the affected runtime because the public
  Wavebinder API does not expose dynamic dependency mutation.

Architecture decisions are recorded in [`docs/adr/`](docs/adr/).

## Known Limitations

- HTTP loading actions are not used yet; material options are deterministic
  custom-function data so the demo remains offline-stable.
- The single-project persistence layer is JSON rather than PostgreSQL.
- Browser automation, hosted deployment, screenshots and the final video are
  submission tasks rather than repository behavior.

