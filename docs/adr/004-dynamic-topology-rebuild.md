# ADR 004: Rebuild Runtime After Topology Changes

## Context

The public Wavebinder API does not expose dynamic dependency add/remove
operations. Renovation relationships can still change through the API.

## Decision

All mutations are serialized per renovation. Topology changes validate endpoint
types and cycles against an isolated candidate snapshot. A replacement runtime
is initialized and its forecast checked while readers continue using the old
snapshot and runtime. Persistence writes a temporary file and atomically renames
it before the in-memory data/runtime swap. Only then is the old runtime disposed.

Failed candidates are disposed without changing committed data, history or
rebuild counts. Undo removes its history entry only after a successful commit;
reset uses the same replacement path. Ordinary edits keep the runtime instance
and publish only changed fact values.

## Consequences

Topology changes are deterministic and observable through rebuild counters. The
tradeoff is a short rebuild instead of in-place dependency mutation.
