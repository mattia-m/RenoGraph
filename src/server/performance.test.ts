import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";
import { schedule } from "./graph.js";
import type { RenovationData } from "../shared/types.js";

test("100-node, 200-edge schedule remains immediate", () => {
  const nodes = Array.from({ length: 100 }, (_, index) => ({ id: `task-${index}`, renovationId: "perf", type: "TASK" as const, name: `Task ${index}`, status: "PLANNED" as const, durationDays: (index % 5) + 1 }));
  const relationships = Array.from({ length: 200 }, (_, index) => {
    const from = (index % 99) + 1;
    const to = Math.max(0, from - ((index % 4) + 1));
    return { id: `edge-${index}`, renovationId: "perf", fromNodeId: `task-${from}`, toNodeId: `task-${to}`, type: "DEPENDS_ON" as const };
  });
  const data: RenovationData = { renovation: { id: "perf", name: "Performance", startDate: "2026-01-01", status: "PLANNING" }, nodes, relationships };
  const start = performance.now();
  const result = schedule(data);
  const elapsed = performance.now() - start;
  assert.equal(result.length, 100);
  assert.ok(elapsed < 250, `schedule took ${elapsed.toFixed(1)}ms`);
});
