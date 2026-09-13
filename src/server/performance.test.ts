import { benchmarkData } from "./benchmarkData.js";
import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";
import { schedule } from "./graph.js";
import type { RenovationData } from "../shared/types.js";

test("100-node, 200-edge schedule remains immediate", () => {
  const data = benchmarkData();
  assert.equal(new Set(data.relationships.map((edge) => `${edge.fromNodeId}:${edge.toNodeId}`)).size, 200);
  const start = performance.now();
  const result = schedule(data);
  const elapsed = performance.now() - start;
  assert.equal(result.length, 100);
  assert.ok(elapsed < 250, `schedule took ${elapsed.toFixed(1)}ms`);
});
