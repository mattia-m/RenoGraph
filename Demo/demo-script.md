# Renograph Demo Script

This is the deterministic contest demo. Start from a clean baseline before
each run:

```bash
export WAVEBINDER_LICENSE='<license JSON>'
npm run dev
```

Open `http://localhost:5173`.

## Recorded Walkthrough

The repository includes a
[95-second narrated contest demo](renograph-contest-demo.mp4) captured from the
runnable Casa Rossi application.

| Time | Scene |
| --- | --- |
| 0:00 | Product overview, progress, cost, projected completion and critical path |
| 0:10 | Live Wavebinder graph and runtime counters |
| 0:20 | Bathroom tiling blockers, reactive inputs and structured task state |
| 0:30 | Bathroom tile `MULTI` options and live data pool |
| 0:41 | Isolated material delivery-delay scenario setup |
| 0:48 | Completion, cost and affected-chain impact |
| 0:57 | Baseline-versus-scenario graph comparison |
| 1:04 | Bathroom `LIST` → `COMPLEX` material bundle |
| 1:14 | Professionals, resource conflicts, purchases and documents |
| 1:25 | Architecture summary |

## Full Interactive Judge Flow

1. Open Casa Rossi.
2. Inspect the graph, relationships and Wavebinder telemetry. Select a task to
   expand the focused live data-pool/dependency inspector.
3. Select `Bathroom plumbing`; verify it is `READY`.
4. Start the task.
5. Complete the task.
6. Verify a downstream task is re-derived by the runtime.
7. Select `Waterproofing` or `Bathroom tiling`.
8. Inspect its direct blockers and root blocker chain.
9. Enable critical-path highlighting.
10. Verify critical nodes, edges and projected completion are visible.
11. Select a task and open `Simulate change`.
12. Simulate a duration delay.
13. Verify the result shows baseline versus scenario completion, cost, delay,
    critical-path change and affected nodes.
14. Toggle between `Baseline` and `Scenario` views.
15. Close/reset the scenario and verify baseline state is unchanged.
16. Select `Bathroom tiles` and simulate a delivery delay.
17. Verify material delivery time shifts dependent task starts and completion.
18. Select a material option and verify the `MULTI` choice changes cost,
    availability, delivery constraint and dependent state.
19. Select a room and inspect real `LIST` → `COMPLEX` material values.
20. Enter **Edit mode** and add or remove a dependency visually.
21. Verify runtime rebuild telemetry increments and derived state is stable.
22. Complete a running task with an actual duration different from its plan;
    inspect the variance and downstream forecast.
23. Introduce a manual blocker, undo it, then use `Reset demo` to restore the
    canonical dataset.
24. Create another renovation with **New project**, switch projects and verify
    their graphs and histories remain isolated.
25. Show a professional conflict and inspect a linked purchase, document or
    contractor workflow.

## Strong Judge Moments

### Multi-input readiness

Show that one completed prerequisite is not enough. Tiling remains blocked until
both waterproofing and the selected material availability are satisfied.

### Non-critical delay

Select a task on the shorter parallel branch and simulate a one-day delay. The
task schedule changes while the project completion date remains unchanged.

### Runtime evidence

Point out the live runtime counters and propagation timeline:

```text
COMPLEX task states
MULTI material choices
LIST room bundles
derived readiness nodes
subscriptions
recent propagation events
```

### Architecture explanation

> Wavebinder owns the live dependency graph, structured state and propagation.
> Renograph owns renovation semantics, CPM scheduling, costs and scenario
> comparison.

## Re-recording Checklist

Before recording, repeat the full interactive flow in Chrome and Firefox. If
available, repeat it in Safari.
Check page reload, graph pan/zoom, scenario reset, material selection and the
mobile layout. Record any browser-specific issue before recording the final
video.
