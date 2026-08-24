# Wavebinder Spike

This spike proves the first Renograph integration boundary with the published
`wave-binder@0.0.2` package.

## Run

```bash
npm install
npm run spike
```

The published package validates a license during startup. To execute the
propagation assertions, provide the contest-issued JSON license:

```bash
WAVEBINDER_LICENSE='{"payload":{},"payloadRaw":"...","signature":"..."}' npm run spike
```

Without a valid license the command exits cleanly with a diagnostic instead
of pretending that a non-functional runtime is a passing spike.

The executable models two renovation facts, `demolitionCompleted` and
`plumbingCompleted`, and a derived `waterproofingReady` node. The derived node
uses a Wavebinder custom function and declares both upstream nodes in `dep`.
Changing either upstream value emits through the RxJS subscription; the value
becomes ready only after both facts are complete.

## Findings

| Question | Finding |
| --- | --- |
| How are nodes defined? | Declarative proto-node objects with `name`, `type`, `path`, loading action (`la`), optional `defaultValue`, and `dep`. |
| How are dependencies defined? | Each `dep` item names an upstream node and parameter. `onUpdate: true` enables propagation when that node changes. |
| How are derived values implemented? | Use `CUSTOM_FUNCTION` loading actions registered as trusted function references in the constructor. |
| How are subscriptions handled? | Nodes expose RxJS-compatible `subscribe`; updates are emitted after `.next(value)`. |
| Can nodes depend on multiple nodes? | Yes. The spike has two dependencies feeding one derived node. |
| Are async dependencies supported? | Yes at the loading-action layer through `GET`, `POST`, and related HTTP actions. Renograph will keep scheduling calculations synchronous and domain-owned. |
| How are errors propagated? | The library represents loading failures as node state/value outcomes. Renograph must add domain-level validation and HTTP error mapping around it. |
| What does the backend provide? | `wavebinder-autodb-back` generates CRUD REST APIs from configuration. It is not a substitute for Renograph scheduling or analysis logic. |
| What does AutoDB provide? | Database-backed CRUD generation and Swagger support. It can be evaluated for persistence, but the first Renograph version should keep application intelligence explicit. |
| Can separate graph instances exist? | Yes: each `new WaveBinder(...)` creates an independent runtime. This is suitable for isolated scenario graphs. |
| Can graph state be cloned? | No dedicated clone API was found in the public API. Renograph should reconstruct a scenario binder from an immutable canonical snapshot. |
| Can dependencies be added or removed dynamically? | No public dynamic dependency mutation API was found. Renograph should validate and rebuild a binder when graph topology changes. |
| What cycle protections exist? | The public documentation does not promise cycle detection. Renograph must validate cycles before constructing or rebuilding a scheduling graph. |
| How is teardown handled? | `nukeNodes()` tears down nodes and stops periodic license checks. Services must call it for scenario and application lifecycle cleanup. |

## Architecture decision

Wavebinder will be the live reactive graph runtime for renovation facts and
derived readiness/blocker state. Renograph remains responsible for renovation
semantics, topological scheduling, CPM, cost aggregation, cycle validation,
scenario comparison, and persistence mapping. A scenario creates a fresh
Wavebinder instance from the baseline facts plus temporary changes, so the
baseline runtime is never mutated.

The package performs an asynchronous license/readiness bootstrap. The app must
surface `isReady()` before allowing graph mutations and handle unavailable
runtime state as an application error.

The additional `node-types-spike.ts` executable verifies meaningful use of
`MULTI` choices and `COMPLEX` fields. Renograph uses those same capabilities for
material variants and structured task state.
