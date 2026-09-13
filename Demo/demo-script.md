# RenoGraph — narrated walkthrough

[Watch the video](renograph-contest-demo.mp4) · [English captions](renograph-contest-demo.srt)

Follow the Casa Rossi renovation to see how Wavebinder connects tasks, materials and decisions to the project’s cost and completion date.

## Chapters

| Start | Workflow | Wavebinder connection |
| --- | --- | --- |
| 0:00 | A renovation, with consequences | Purpose |
| 0:12 | Why can’t this task start? | SINGLE → CUSTOM_FUNCTION → COMPLEX |
| 0:26 | Replace estimates with reality | Actual duration → project forecast |
| 0:39 | Compare material choices | MULTI → material state |
| 0:50 | Bring supplier data into the graph | Native GET → validated option facts |
| 1:05 | Turn receipt into readiness | Purchase → delivered fact → propagation |
| 1:17 | Make shared-resource delays visible | Project facts → resource-aware forecast |
| 1:30 | Inspect the room as a whole | LIST → COMPLEX children |
| 1:42 | Ask what if, without changing the plan | Initialize → apply commands → snapshot |
| 1:56 | Build beyond the sample project | Project isolation + topology rebuilds |
| 2:09 | Keep every workspace consistent | Committed revision → SSE → snapshot |
| 2:21 | Show the cause, not just the result | Mutation ID + before/after values |
| 2:36 | A practical use of Wavebinder | Reactive engine + explicit domain rules |

## How the integration works

- Wavebinder owns dependency state, SINGLE facts, MULTI selections, COMPLEX projections, LIST bundles and reactive propagation.
- Native GET loading runs in a disposable supplier runtime. Its validated response updates the persistent project's material-option facts. The supplier is explicitly a local demo fixture; no commercial order is placed.
- RenoGraph supplies readiness rules, resource-aware scheduling, critical-path analysis and costs. The project forecast is invoked through Wavebinder dependencies.
- SSE and atomic revision snapshots are RenoGraph's transport and transaction layer. They are not claimed as native Wavebinder features.
- Professional assignments and linked purchase receipts feed forecast facts. Contractor and document records support operations without being presented as reactive calculation nodes.
- Scenarios are initialized before changes are applied; their captured results are labelled as snapshots and their runtimes disposed.
- The displayed verification result is 44 passing tests with no skips. The approximately 24 ms median propagation measurement came from the local Apple M1 / Node 26.7.0 verification run, using 100 tasks, 200 unique dependency pairs, one warm-up and three measured samples. It includes diagnostic telemetry overhead.

## Reproduce the workflows

Set a valid `WAVEBINDER_LICENSE` in an ignored `.env` file or environment variable. Use a separate `RENOGRAPH_DATA` path and `RENOGRAPH_PROJECTS_DIR` when demonstrating destructive or reversible changes to the sample. Run `npm run verify` and `npm run build`, then launch the app.

1. Inspect Bathroom tiling's blockers and runtime inputs.
2. Compare material options, exercise Update quote and Test outage, and retry. Watch the selected option and forecast update; pending quotes are rejected after intervening revisions.
3. Receive the seeded linked bathroom-tile order. Inspect delivery in the room list and the shared-plumber critical connection. Undo reverses the saved receipt transaction.
4. Start Bathroom plumbing, then complete it with six actual days against four planned. Inspect its historical critical-path status and the reforecast.
5. Run a fourteen-day, €350 Kitchen plumbing scenario. Compare its October 16 completion against the October 2 baseline and its six affected tasks. The scenario is isolated.
6. Create a work package in another tab and observe it arrive in the first. Use edit mode for manual constraints and dependency changes; inspect mutation sources and before/after values.
7. Show separate project creation, people, purchases and supporting records. End by explaining the engine/domain boundary and the measured verification results.

## Narration transcript

### 0:00 — A renovation, with consequences

Renograph connects renovation decisions to their consequences. Tasks, materials and rooms form a living dependency graph, showing what can start, why work is blocked, and how changes affect cost and completion.

### 0:12 — Why can’t this task start?

Task facts use Wavebinder single nodes. Custom functions combine prerequisites, material availability and manual clearance into readiness. A complex node collects status, duration and cost. The inspector exposes inputs and root blockers.

### 0:26 — Replace estimates with reality

Completing plumbing records six actual days against four planned. Its complex state propagates the variance into the forecast. Completed critical work stays visible as history, distinct from unfinished work needing attention.

### 0:39 — Compare material choices

Material choices use Wavebinder multi nodes. Selecting express delivery updates availability, lead time and cost. Dependent state and the forecast react, making the consequences of each option visible.

### 0:50 — Bring supplier data into the graph

Update quote uses a native Wavebinder HTTP GET. The labelled demo supplier returns three days and twelve hundred fifty euros. Validated results update option facts. Loading, outage and retry are visible; revision checks reject stale responses.

### 1:05 — Turn receipt into readiness

Receiving a linked purchase sets the delivery fact. Wavebinder updates availability, room lists, readiness and the forecast in one saved transaction. Undo restores it. Updating a quote does not place an order.

### 1:17 — Make shared-resource delays visible

The dashed plumber link explains why kitchen work waits for bathroom plumbing. Assignments feed project facts into the reactive forecast. RenoGraph calculates resource sequencing and critical paths; Wavebinder propagates changed inputs.

### 1:30 — Inspect the room as a whole

Rooms expose Wavebinder lists of complex material records. Delivery, option, availability and cost stay synchronized with their source materials: a practical room checklist backed by inspectable dependencies.

### 1:42 — Ask what if, without changing the plan

Scenarios initialize an independent runtime before applying changes. Here, a kitchen delay adds fourteen days and three hundred fifty euros. Readiness changes are included. The captured snapshot stays separate from baseline; its runtime is disposed.

### 1:56 — Build beyond the sample project

Each project has independent state. New tasks and dependencies build a replacement runtime; ordinary fact edits reuse it. Professionals and purchases affect forecasts. Contractors and documents remain supporting records.

### 2:09 — Keep every workspace consistent

A task added in one tab reaches another through server-sent events. One committed snapshot keeps the workspace consistent. Reconnect reloads current state; old requests and obsolete scenario comparisons are discarded.

### 2:21 — Show the cause, not just the result

Telemetry links mutation identifiers to sources, before-and-after values and derived emissions. Initialization is labelled separately. Health checks and idempotent cleanup protect runtime lifecycle. Forty-four tests passed, with no licensed tests skipped.

### 2:36 — A practical use of Wavebinder

Actual fact propagation measured around twenty-four milliseconds median here. Wavebinder owns reactive state and propagation; RenoGraph owns scheduling and costing. Together, they make renovation decisions explainable and useful.
