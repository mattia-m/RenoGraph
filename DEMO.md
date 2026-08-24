# Renograph Demo Runbook

This is the deterministic contest demo. Start from a clean baseline before
each run:

```bash
export WAVEBINDER_LICENSE='<license JSON>'
npm run dev
```

Open `http://localhost:5173`.

## Core Flow

1. Open Casa Rossi.
2. Inspect the graph, relationships and Wavebinder telemetry.
3. Select `Bathroom plumbing`; verify it is `READY`.
4. Start the task.
5. Complete the task.
6. Verify a downstream task is re-derived by the runtime.
7. Select `Waterproofing` or `Bathroom tiling`.
8. Inspect its direct blockers and root blocker chain.
9. Enable critical-path highlighting.
10. Verify critical nodes, edges and projected completion are visible.
11. Select a task and open `Simulate change`.
12. Simulate a delay.
13. Verify the result shows baseline versus scenario completion, cost, delay,
    critical-path change and affected nodes.
14. Toggle between `Baseline` and `Scenario` views.
15. Close/reset the scenario and verify baseline state is unchanged.
16. Select a material node.
17. Switch between material options.
18. Verify the `MULTI` choice changes cost, availability and dependent state.
19. Add or remove a relationship through the API if demonstrating topology:

```bash
curl -X POST http://localhost:3001/api/renovations/casa-rossi/relationships \
  -H 'Content-Type: application/json' \
  -d '{"fromNodeId":"bathroom-fixtures","toNodeId":"bathroom-tiling","type":"DEPENDS_ON"}'
```

20. Verify runtime rebuild telemetry increments and derived state is stable.
21. Use `Reset demo` to restore the canonical dataset.

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

## Browser Pass

Repeat the core flow in Chrome and Firefox. If available, repeat it in Safari.
Check page reload, graph pan/zoom, scenario reset, material selection and the
mobile layout. Record any browser-specific issue before recording the final
video.
