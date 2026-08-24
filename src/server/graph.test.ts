import assert from "node:assert/strict";
import test from "node:test";
import { analyze, simulatePure } from "./analysis.js";
import { blockers, roomMaterialRequirements, schedule, topologicalTasks, validateNoCycle } from "./graph.js";
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

test("Casa Rossi work packages follow realistic trade sequencing", () => {
  const data = createDemoData();
  const dependencies = new Set(data.relationships
    .filter((relationship) => relationship.type === "DEPENDS_ON")
    .map((relationship) => `${relationship.fromNodeId}->${relationship.toNodeId}`));
  const expectDependency = (task: string, prerequisite: string) => {
    assert.ok(dependencies.has(`${task}->${prerequisite}`), `${task} should depend on ${prerequisite}`);
  };

  expectDependency("bathroom-waterproofing", "bathroom-plumbing");
  expectDependency("bathroom-waterproofing", "bathroom-electrical");
  expectDependency("kitchen-painting", "kitchen-plumbing");
  expectDependency("kitchen-painting", "kitchen-electrical");
  expectDependency("kitchen-flooring", "kitchen-painting");
  expectDependency("kitchen-installation", "kitchen-flooring");
  expectDependency("living-painting", "living-plastering");
  expectDependency("living-flooring", "living-painting");
  expectDependency("final-painting", "bathroom-fixtures");
  expectDependency("final-painting", "kitchen-installation");
  expectDependency("final-painting", "living-flooring");
  expectDependency("final-painting", "windows");
  expectDependency("final-painting", "heating");
  expectDependency("final-inspection", "final-painting");
});

test("kitchen flooring remains blocked while plumbing is unfinished", () => {
  const data = createDemoData();
  data.nodes.find((node) => node.id === "kitchen-demolition")!.status = "COMPLETED";
  data.nodes.find((node) => node.id === "kitchen-electrical")!.status = "COMPLETED";
  data.nodes.find((node) => node.id === "kitchen-plumbing")!.status = "IN_PROGRESS";

  const explanation = blockers(data, "kitchen-flooring");
  assert.equal(explanation.status, "BLOCKED");
  assert.ok(explanation.rootBlockers.includes("kitchen-plumbing"));
});

test("selected material delivery constrains task scheduling", () => {
  const data = createDemoData();
  const material = data.nodes.find((node) => node.id === "bathroom-tiles")!;
  material.selectedOptionId = "standard";
  const tiling = schedule(data).find((entry) => entry.nodeId === "bathroom-tiling")!;
  assert.equal(tiling.materialReadyDay, 14);
  assert.deepEqual(tiling.materialConstraints, [{ materialId: "bathroom-tiles", deliveryDays: 14 }]);
  material.status = "COMPLETED";
  assert.equal(schedule(data).find((entry) => entry.nodeId === "bathroom-tiling")?.materialReadyDay, 0);
});

test("material delivery scenarios move dependent work without mutating baseline", () => {
  const data = createDemoData();
  const result = simulatePure(data, "tiles delayed", [{ nodeId: "bathroom-tiles", deliveryDeltaDays: 14, estimatedCostDelta: 350 }]);
  assert.equal(result.impact.delayDays, 14);
  assert.equal(result.impact.additionalCost, 350);
  assert.ok(result.affectedNodes.some((node) => node.id === "bathroom-tiles" && node.scheduleDeltaDays === 14));
  assert.ok(result.affectedNodes.some((node) => node.id === "bathroom-tiling"));
  assert.equal(data.nodes.find((node) => node.id === "bathroom-tiles")?.options?.[0].deliveryDays, 14);
});

test("room material requirements contain structured selected-option values", () => {
  const data = createDemoData();
  const bathroom = roomMaterialRequirements(data, "bathroom");
  assert.equal(bathroom.length, 2);
  assert.deepEqual(bathroom.find((item) => item.materialId === "bathroom-tiles"), {
    materialId: "bathroom-tiles",
    materialName: "Bathroom tiles",
    selectedOptionId: "standard",
    selectedOptionLabel: "Standard",
    available: false,
    delivered: false,
    deliveryDays: 14,
    estimatedCost: 500,
    requiredByTaskIds: ["bathroom-tiling"],
  });
});
