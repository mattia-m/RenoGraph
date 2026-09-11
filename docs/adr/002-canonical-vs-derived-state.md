# ADR 002: Keep Facts Canonical And Derive Readiness

## Context

Completion, progress and selected material facts must survive a restart. Ready,
blocked and structured task state can be reconstructed from dependencies.

## Decision

JSON persistence stores the renovation model and facts. Wavebinder reconstructs
derived readiness, material availability and task `COMPLEX` state at startup.
Room `LIST` values depend on material projections. The project forecast depends
on task/material projections and explicit project/resource facts; its pure
scheduling algorithm remains domain-owned.

Node patches, transition actions and scenarios share command validation. Derived
READY/BLOCKED values are reconstructed, and blocker explanations apply the same
material availability and manual-blocker rules.

## Consequences

There is no stale authoritative `READY` flag. A dependency change produces a new
derived result. The local JSON portfolio is intentionally smaller than a
production database.
