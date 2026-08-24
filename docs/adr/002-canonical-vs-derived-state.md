# ADR 002: Keep Facts Canonical And Derive Readiness

## Context

Completion, progress and selected material facts must survive a restart. Ready,
blocked and structured task state can be reconstructed from dependencies.

## Decision

JSON persistence stores the renovation model and facts. Wavebinder reconstructs
derived readiness, material availability and task `COMPLEX` state at startup.

## Consequences

There is no stale authoritative `READY` flag. A dependency change produces a new
derived result. The current single-project JSON store is intentionally smaller
than a production database.
