import assert from "node:assert/strict";
import test from "node:test";
import { analyze, simulatePure } from "./analysis.js";
import { blockers, schedule, topologicalTasks, validateNoCycle } from "./graph.js";
import { createDemoData } from "./seed.js";
import type { RenovationData } from "../shared/types.js";

function graph(edges: Array<[string, string]>, durations: Record<string, number>, statuses: Record<string, "PLANNED" | "COMPLETED"> = {}): RenovationData {
  const ids = [...new Set(edges.flat())];
  return {
    renovation: { id: "test", name: "Test", startDate: "2026-01-01", status: "IN_PROGRESS" },
    nodes: ids.map((id) => ({ id, renovationId: "test", type: "TASK", name: id, status: statuses[id] ?? "PLANNED", durationDays: durations[id] ?? 1 })),
    relationships: edges.map(([fromNodeId, toNodeId], index) => ({ id: `e-${index}`, renovationId: "test", fromNodeId, toNodeId, type: "DEPENDS_ON" })),
  };
}

test("topological order handles a chain and diamond", () => {
  const data = graph([["B", "A"], ["C", "A"], ["D", "B"], ["D", "C"]], { A: 2, B: 4, C: 2, D: 1 });
  assert.deepEqual(topologicalTasks(data).map((node) => node.id), ["A", "B", "C", "D"]);
  assert.equal(analyze(data).durationDays, 7);
});

test("critical path leaves slack on the shorter parallel branch", () => {
  const data = graph([["B", "A"], ["C", "A"], ["D", "B"], ["D", "C"]], { A: 2, B: 4, C: 2, D: 1 });
  const result = schedule(data);
  assert.equal(result.find((entry) => entry.nodeId === "B")?.critical, true);
  assert.equal(result.find((entry) => entry.nodeId === "C")?.critical, false);
  assert.equal(result.find((entry) => entry.nodeId === "C")?.slack, 2);
});

test("blocked explanations expose direct and root blockers", () => {
  const data = graph([["B", "A"], ["C", "B"]], { A: 1, B: 1, C: 1 });
  assert.deepEqual(blockers(data, "C"), { nodeId: "C", status: "BLOCKED", blockedBy: ["B"], rootBlockers: ["A"] });
});

test("cycles and self dependencies are rejected", () => {
  const data = graph([["B", "A"], ["C", "B"]], { A: 1, B: 1, C: 1 });
  assert.deepEqual(validateNoCycle(data, "A", "C"), ["A", "C", "B", "A"]);
  assert.deepEqual(validateNoCycle(data, "A", "A"), ["A", "A"]);
});

test("scenario changes do not mutate baseline and respect slack", () => {
  const data = graph([["B", "A"], ["C", "A"], ["D", "B"], ["D", "C"]], { A: 2, B: 4, C: 2, D: 1 });
  const result = simulatePure(data, "short branch delayed", [{ nodeId: "C", durationDeltaDays: 1 }]);
  assert.equal(result.impact.delayDays, 0);
  assert.equal(data.nodes.find((node) => node.id === "C")?.durationDays, 2);
  assert.equal(result.scenarioResult.estimatedCost, result.baseline.estimatedCost);
});

test("critical delay moves project completion", () => {
  const data = graph([["B", "A"], ["C", "B"]], { A: 2, B: 4, C: 1 });
  const result = simulatePure(data, "critical delay", [{ nodeId: "B", durationDeltaDays: 7 }]);
  assert.equal(result.impact.delayDays, 7);
  assert.equal(result.affectedNodes.length, 2);
});

test("a non-critical delay can leave project completion unchanged", () => {
  const data = graph([["B", "A"], ["C", "A"], ["D", "B"], ["D", "C"]], { A: 2, B: 4, C: 2, D: 1 });
  const result = simulatePure(data, "slack delay", [{ nodeId: "C", durationDeltaDays: 1 }]);
  assert.equal(result.impact.delayDays, 0);
  assert.equal(result.scenarioResult.completionDate, result.baseline.completionDate);
});

test("a delayed parallel branch can become critical", () => {
  const data = graph([["B", "A"], ["C", "A"], ["D", "B"], ["D", "C"]], { A: 2, B: 4, C: 2, D: 1 });
  const result = simulatePure(data, "critical path switch", [{ nodeId: "C", durationDeltaDays: 3 }]);
  assert.equal(result.impact.criticalPathChanged, true);
  assert.deepEqual(result.graph.analysis.criticalPath, ["A", "C", "D"]);
});

test("Casa Rossi seed contains the intended graph shapes", () => {
  const data = createDemoData();
  const dependencies = data.relationships.filter((relationship) => relationship.type === "DEPENDS_ON");
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  for (const edge of dependencies) {
    incoming.set(edge.fromNodeId, (incoming.get(edge.fromNodeId) ?? 0) + 1);
    outgoing.set(edge.toNodeId, (outgoing.get(edge.toNodeId) ?? 0) + 1);
  }
  assert.equal(data.nodes.length, 33);
  assert.ok(dependencies.length >= 20);
  assert.ok([...incoming.values()].some((count) => count >= 2), "expected fan-in");
  assert.ok([...outgoing.values()].some((count) => count >= 2), "expected fan-out");
  assert.ok(data.relationships.some((edge) => edge.type === "REQUIRES_MATERIAL"));
});
