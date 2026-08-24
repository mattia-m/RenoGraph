# ADR 005: Keep JSON Persistence For The Contest MVP

## Context

The contest evaluates Wavebinder integration, technical quality, UX and
originality. A database does not improve the core dependency demonstration.

## Decision

Use a restart-safe canonical JSON snapshot for the single Casa Rossi project.
Keep persistence isolated in `RenovationStore` so a PostgreSQL repository can be
added later without changing graph analysis.

## Consequences

The demo has zero database setup and is easy for judges to run. Multi-user
concurrency and PostgreSQL durability are explicitly outside contest scope.
