# ADR 003: Rebuild Scenarios In Independent Runtimes

## Context

A what-if delay must never mutate the baseline renovation.

## Decision

Scenario data is cloned, mapped into a new `RenovationRuntime`, recalculated and
disposed with `nukeNodes()` after comparison.

## Consequences

Baseline and scenario Wavebinder instances are independent. Scenario creation
includes runtime construction cost in exchange for isolation. The benchmark
measures this overhead separately from changes to an existing runtime.
