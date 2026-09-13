# Renograph

Renograph turns a renovation into a living dependency graph. It shows what is
ready, what is blocked and why, which activities determine the finish date, and
what happens when a task changes.

Renograph supports renovation projects with linked tasks, materials, purchases
and shared professionals. Casa Rossi is the included sample project.
It uses Wavebinder as the live reactive dependency runtime,
while renovation-specific scheduling, critical-path analysis, costing and
scenario comparison remain explicit Renograph domain logic.

## Demo

- [Watch the 95-second product tour](Demo/renograph-contest-demo.mp4)
- [Follow the guided product walkthrough](Demo/demo-script.md)

The video is captured from the runnable Casa Rossi application. It demonstrates
the live Wavebinder graph, critical-path highlighting, blocker explanations,
material choices, an isolated delivery-delay scenario, structured room material
lists and the operational workflow.

## Visual Tour

![Renograph dashboard showing the Casa Rossi dependency graph, project forecast, critical path, ready work and live Wavebinder runtime metrics](docs/media/renograph-dashboard.jpg)

The main workspace combines the renovation graph with projected completion,
cost, critical-path signals, blockers and live Wavebinder runtime telemetry.

| Reactive dependency inspection | Resource and operational workflows |
| --- | --- |
| ![A critical bathroom tiling task selected with blockers, dependency inputs and its structured Wavebinder data-pool state](docs/media/renograph-wavebinder-inspector.jpg) | ![The project operations workspace showing professional availability, crew conflicts, contractors, purchases and document tracking](docs/media/renograph-operations.jpg) |
| Select any task to inspect its direct/root blockers and live `COMPLEX` forecast inputs. | Shared professionals constrain the schedule while purchasing and paperwork remain editable in the local project workflow. |

Every value shown here comes from the runnable local application rather than a
design mock-up. The repeatable interaction sequence is documented below and in
the [`Demo/` package](Demo/).

## Quick Start

Requirements: Node.js 22.15+ and a valid Wavebinder license.

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
local ignored `.env` file. Node 22.15+ is required; API, tests and benchmark load `.env` from the working directory without replacing exported variables.

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

## Demo Flow

1. Read the project forecast and inspect the live Wavebinder runtime counters.
2. Highlight the critical path and select `Bathroom tiling`.
3. Inspect its direct dependencies, root blockers and structured live task state.
4. Select `Bathroom tiles` to compare its `MULTI` delivery and cost choices.
5. Simulate a 14-day delivery delay and €350 cost increase in an isolated runtime.
6. Compare baseline and scenario completion, cost and affected tasks.
7. Select the bathroom to inspect its `LIST` → `COMPLEX` material bundle.
8. Open the operations workspace to inspect resource conflicts, purchases and documents.

The [narrated video](Demo/renograph-contest-demo.mp4) follows this sequence. The
[demo script](Demo/demo-script.md) also contains the longer interactive flow for
hands-on exploration.

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
| Room material bundles | Reactive `LIST` nodes derive `COMPLEX` requirements from material-state dependencies, including receipt, options, delivery times and costs |
| Structured task state | `COMPLEX` nodes with status, duration and cost fields |
| Reactive task forecast | `COMPLEX` + `CUSTOM_FUNCTION` projection of plan, actual duration, delay, variance, manual blocker and effective duration |
| Project forecast | A `CUSTOM_FUNCTION` node consumes typed task/material projections and resource facts, then invokes the pure scheduling and cost functions |
| Runtime propagation | RxJS node subscriptions and `.next()` updates for changed facts only |
| Independent runtime | A separate `WaveBinder` instance per graph runtime |
| Runtime teardown | `nukeNodes()` during lifecycle cleanup |

| Renograph concern | Renograph responsibility |
| --- | --- |
| Renovation semantics | `NodeType`, statuses and relationship rules |
| Cycle validation | Domain graph validation before topology changes |
| Schedule | Topological earliest/latest pass with selected material delivery constraints |
| Critical path | CPM slack calculation |
| Cost | Domain aggregation and scenario deltas |
| Scenario comparison | Clone, change, recalculate and compare |
| Persistence | Canonical JSON snapshot; derived values are rebuilt |
| Resource-aware scheduling | Professional availability and shared-crew assignments level overlapping work and expose the resulting delay |
| Operations workflows | Contractors, purchases, document references and undoable local changes |
| Project portfolio | Create, persist and switch between isolated renovation graphs |

Wavebinder is not falsely credited with CPM or renovation semantics. It owns
the reactive graph state; Renograph owns renovation intelligence.

### Reactive task forecast

Every task exposes a structured Wavebinder `COMPLEX` forecast generated by a
`CUSTOM_FUNCTION`. Its reactive dependency inputs combine:

- planned duration;
- actual duration captured when work is completed;
- a directly applied manual delay;
- effective duration used by the schedule;
- duration variance against the original plan;
- manual blocker state;
- derived readiness;
- progress and completion state; and
- estimated cost.

Changing one of these facts propagates through Wavebinder immediately. The
`__project_forecast` node invokes Renograph’s pure scheduling and cost functions
using the reactive task/material projections. API graph and summary responses
consume that forecast. Blocker explanations share the material-satisfaction and
manual-blocker rules used by the runtime. The original planned duration remains visible, while the measured actual
duration becomes the effective duration for completed work. A task estimated at
10 days and completed in 3 or 20 days therefore reforecasts dependent work using
3 or 20 days without erasing the initial estimate.

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

The REST API supports project creation and discovery; graph, schedule, blocker,
critical-path and runtime inspection; node and relationship mutation;
professional, contractor, purchase and document workflows; isolated scenarios;
and undo/reset. Renovation operations are scoped below
`/api/renovations/:id`, keeping project graphs isolated.

## Testing

Run `npm run verify` with a valid license exported or in `.env` for type checks, the complete test suite and a licensed benchmark. Verification fails immediately without a license so integration tests cannot silently be skipped. Run `npm run build` to produce the frontend bundle.

Individual checks:

```bash
npm run typecheck
npm test
npm run build
npm run benchmark
```

The tests cover mutation serialization, failed rebuild/persistence rollback,
undo/reset failure recovery, shared transition validation, projected forecast
inputs, chains, diamonds, parallel slack, blocker roots, cycle
rejection, critical delays, critical-path changes, non-critical delays,
material delivery constraints, structured room bundles, seed graph shape and
baseline immutability. Licensed integration tests cover the real Wavebinder
runtime, material-receipt propagation, edits to an already-selected option,
changed-fact emission, populated `LIST`/`COMPLEX` values, store commands, undo,
and material scenarios when
`WAVEBINDER_LICENSE` is configured. The executable Wavebinder spikes are in
`spike/`.

The benchmark reports median and p95 timings for scheduling. With a license it
also measures runtime construction, fact propagation and isolated scenario analysis.
The dataset contains 100 tasks and 200 unique dependency pairs. Each measurement
warms up before sampling, and the report includes the execution environment.

## Technical Decisions

- JSON persistence provides local storage without a separate database service.
- PostgreSQL is not required for local use; the persistence seam is
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

- Supplier quotes use a deterministic local HTTP fixture, not a commercial supplier. Wavebinder 0.0.2 does not expose request cancellation: disposable GET runtimes and revision checks prevent stale application writes; an underlying HTTP request can still finish after disposal.
- The local multi-project persistence layer is JSON rather than PostgreSQL.
- Project runtimes are currently created eagerly at startup. A lazy or bounded
  runtime cache is not implemented; startup resource usage grows with the number
  of saved projects.
- A hosted deployment is not included; the repository provides the narrated
  demo video alongside local and Docker workflows.


## Working with a project

### Supplier quotes

Select a material and choose **Update quote** to update its selected option's price, delivery time and availability. The included demo supplier returns a fixed quote: **€1,250, 3 days, available**. The panel labels this source as **Demo data**.

Wavebinder loads the quote over HTTP. Applying it saves the selected option and recalculates room material lists, task readiness, estimated costs and the forecast. Other open tabs receive the update. **Undo** restores the previous state. Updating a quote does not place an order or mark a material delivered.

**Test outage** simulates a supplier failure without changing project data; **Retry quote** requests the quote again. A pending quote is rejected if the project changes while it loads, so it cannot overwrite a newer selection or edit.

### Purchases and delivery

In **People & workflows → Purchases**, link an order to a material. Marking the order **RECEIVED** records the complete material delivery and updates readiness and the forecast in one saved transaction. Partial shipments are not supported. Use **Undo** to reverse a receipt; receipt does not overwrite estimated or actual costs.

### Scenarios and live updates

Scenarios compare proposed changes with the current project, including readiness changes, completion dates and costs. Each scenario applies changes to an initialized, independent Wavebinder runtime and captures the result before disposing it. The inspector labels this a **scenario snapshot**.

The live workspace receives committed changes through server-sent events and reloads a consistent project snapshot on reconnect. Switching projects discards old requests. A baseline change clears an outdated scenario comparison.

### Runtime diagnostics

Propagation entries include the change source, mutation ID, fact or derived value, and before/after values. Initialization and rollback are labelled separately. Counters are cumulative per runtime; the log retains the latest 100 events. Topology changes create a new runtime and reset its counters. Intermediate derived emissions are diagnostics; the workspace displays committed snapshots.

Health checks return 503 when runtimes are unavailable. Shutdown closes clients and disposes subscriptions and pending quote consumers. Partial startup failures also clean up initialized runtimes.

See the [project walkthrough](docs/project-walkthrough.md) for a guided example. The recorded tour shows an earlier version; the written walkthrough covers the current workflows.
