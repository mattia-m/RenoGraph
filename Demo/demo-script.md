# RenoGraph — demo walkthrough

[Watch the video](renograph-contest-demo.mp4) · [English captions](renograph-contest-demo.srt)

Follow the Casa Rossi renovation as material choices, deliveries and completed work change the project’s forecast.

## Chapters

| Start | Workflow | Wavebinder connection |
| --- | --- | --- |
| 0:00 | From decisions to consequences | SINGLE facts → CUSTOM_FUNCTION readiness → COMPLEX state |
| 0:18 | Compare material choices | MULTI selection → availability, cost and forecast |
| 0:33 | Bring supplier data into the graph | Native HTTP GET → validated material-option facts |
| 0:51 | Turn a receipt into project state | Delivered fact → material state → room LIST |
| 1:11 | Record reality and explain the schedule | Actual duration → forecast · shared-crew dependencies |
| 1:30 | Explore a decision before committing | Independent runtime → propagated scenario → snapshot |
| 1:49 | Grow the live dependency graph | New topology → replacement runtime → derived readiness |
| 2:06 | Keep workspaces synchronized | Committed revision → server-sent event → workspace snapshot |
| 2:22 | Trace every consequence | Source + mutation ID + before-and-after state |

## Narration

### 0:00 — From decisions to consequences

RenoGraph connects renovation tasks, materials and rooms in a live dependency graph. Select a blocked task to see what is stopping it. Wavebinder single nodes hold facts; custom functions combine prerequisites and manual clearance, while complex nodes expose the resulting task state.

### 0:18 — Compare material choices

Switching bathroom tiles to express delivery changes the forecast from October second to September thirtieth. Wavebinder multi nodes hold the choices. The selected option feeds availability, lead time and cost into dependent state and the project forecast.

### 0:33 — Bring supplier data into the graph

Update quote runs a native Wavebinder HTTP GET. This demo supplier returns three-day delivery at twelve hundred fifty euros. Watch the option update. An outage preserves the project, and retry recovers. Revision checks also prevent an outdated response from overwriting newer edits.

### 0:51 — Turn a receipt into project state

Receiving the linked tile order marks the material delivered. Wavebinder propagates that fact into readiness, the forecast, and the room's material list. Each list contains complex material records, keeping delivery and price consistent. Professionals, purchases and supporting documents share the same workspace.

### 1:11 — Record reality and explain the schedule

Start bathroom plumbing, then complete it with six actual days instead of four. Its state propagates the variance into the forecast. Completed critical work becomes history. The dashed plumber connection explains why kitchen work must wait: RenoGraph calculates resource scheduling, and Wavebinder propagates the changed inputs.

### 1:30 — Explore a decision before committing

A scenario adds fourteen days and three hundred fifty euros to kitchen plumbing. Completion moves from October second to October sixteenth, affecting six tasks. Changes propagate through an independently initialized Wavebinder runtime. The labelled snapshot lets us compare results without changing the baseline.

### 1:49 — Grow the live dependency graph

Add bathroom snagging, then make it depend on fixture installation. The new task becomes blocked, with its root cause visible. Structural changes build a replacement Wavebinder runtime; ordinary fact edits reuse the existing one. Each project keeps independent state.

### 2:06 — Keep workspaces synchronized

In a second tab, change snagging from one day to two. Return to the original tab: it has updated without a refresh. RenoGraph broadcasts committed revisions through server-sent events, then reloads one consistent workspace snapshot of the propagated state.

### 2:22 — Trace every consequence

A manual inspection hold changes the task state. Diagnostics show the mutation source and before-and-after values, making propagation inspectable. Wavebinder supplies reactive state; RenoGraph supplies renovation rules. Together, they turn a project plan into an explanation of what happens next.
