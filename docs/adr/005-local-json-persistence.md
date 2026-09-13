# ADR 005: Local JSON Persistence

## Context

Renograph needs to preserve projects across restarts and support local use
without requiring a separate database service.

## Decision

Store canonical project snapshots as JSON, using atomic file replacement for
writes. Include Casa Rossi as sample data and keep separate state for projects
created through the portfolio. Isolate persistence in `RenovationStore` so a
database repository can be introduced without changing graph analysis.

## Consequences

Setup requires no database administration. Mutations are serialized within a
single application process. Files do not provide database transactions across
multiple server processes; a shared deployment would need a database-backed
repository and an appropriate concurrency model.
