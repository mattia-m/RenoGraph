# ADR 004: Rebuild Runtime After Topology Changes

## Context

The public Wavebinder API does not expose dynamic dependency add/remove
operations. Renovation relationships can still change through the API.

## Decision

Renograph validates a new dependency for cycles, changes the canonical graph,
constructs a fresh Wavebinder runtime and re-derives state. Failed rebuilds
roll back the relationship.

## Consequences

Topology changes are deterministic and observable through rebuild counters. The
tradeoff is a short rebuild instead of in-place dependency mutation.
