# ADR 001: Place Wavebinder In The Application Runtime

## Context

Renograph needs reactive dependency propagation while keeping scheduling and
critical-path algorithms domain-owned.

## Decision

The API process constructs a Wavebinder runtime from the canonical renovation
graph. The frontend receives stable graph JSON and never receives internal
Wavebinder objects.

## Consequences

Wavebinder is easy to test and inspect at the application boundary. The license
stays server-side. The UI remains framework-agnostic with respect to graph
state, while Renograph analysis remains explicit and deterministic.
