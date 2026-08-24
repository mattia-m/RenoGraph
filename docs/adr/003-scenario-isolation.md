# ADR 003: Rebuild Scenarios In Independent Runtimes

## Context

A what-if delay must never mutate the baseline renovation.

## Decision

Scenario data is cloned, mapped into a new `RenovationRuntime`, recalculated and
disposed with `nukeNodes()` after comparison.

## Consequences

Baseline and scenario Wavebinder instances are independent. Scenario creation
has the cost of runtime construction, which is acceptable at contest scale and
provides a clear isolation guarantee.
