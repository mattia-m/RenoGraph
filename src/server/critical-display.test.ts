import assert from "node:assert/strict";
import test from "node:test";
import { createDemoData } from "./seed.js";
import { graphResponse } from "./analysis.js";
import { buildFlowEdges } from "../../web/src/graphPresentation.js";

test("delivered tiles separate completed path work from remaining critical work", () => {
  const data = createDemoData();
  data.nodes.find((node) => node.id === "bathroom-tiles")!.status = "COMPLETED";
  const graph = graphResponse(data);
  assert.equal(
    graph.nodes.find((node) => node.id === "bathroom-demolition")
      ?.criticalState,
    "HISTORICAL",
  );
  assert.equal(
    graph.nodes.find((node) => node.id === "bathroom-plumbing")?.criticalState,
    "ACTIVE",
  );
  assert.equal(
    graph.nodes.find((node) => node.id === "bathroom-tiling")?.criticalState,
    "NONE",
  );
  assert.deepEqual(graph.analysis.historicalCriticalPath, [
    "bathroom-demolition",
  ]);
  assert.ok(!graph.analysis.activeCriticalPath.includes("bathroom-demolition"));
  assert.equal(graph.analysis.durationDays, 22);
  const crew = graph.resourceEdges.find(
    (edge) => edge.professionalId === "pro-marco",
  )!;
  assert.equal(crew.source, "bathroom-plumbing");
  assert.equal(crew.target, "kitchen-plumbing");
  assert.equal(crew.professionalName, "Marco Bianchi");
  assert.equal(crew.criticalState, "ACTIVE");
  assert.ok(
    !graph.edges.some((edge) => edge.id === crew.id),
    "crew hand-offs are not editable domain dependencies",
  );
});

test("crew connections disappear when assignments are removed and retain noncritical hand-offs", () => {
  const data = createDemoData();
  const before = graphResponse(data);
  assert.equal(before.resourceEdges.length, 2);
  assert.equal(
    before.resourceEdges.find((edge) => edge.professionalId === "pro-marco")
      ?.criticalState,
    "NONE",
  );
  data.assignments = data.assignments!.filter(
    (assignment) => assignment.professionalId !== "pro-marco",
  );
  const after = graphResponse(data);
  assert.ok(
    !after.resourceEdges.some((edge) => edge.professionalId === "pro-marco"),
  );
  assert.equal(after.resourceEdges[0].professionalName, "Elena Verdi");
});

test("a shortcut between critical nodes is not highlighted unless it drives the schedule", () => {
  const data = createDemoData();
  data.nodes.find((node) => node.id === "bathroom-tiles")!.status = "COMPLETED";
  data.relationships.push({
    id: "shortcut",
    renovationId: data.renovation.id,
    fromNodeId: "kitchen-installation",
    toNodeId: "bathroom-demolition",
    type: "DEPENDS_ON",
  });
  const edge = graphResponse(data).edges.find(
    (edge) => edge.id === "shortcut",
  )!;
  assert.equal(edge.critical, false);
  assert.equal(edge.criticalState, "NONE");
});

test("completed crew hand-offs are historical, never animated, and filters hide dangling edges", () => {
  const data = createDemoData();
  for (const node of data.nodes)
    if (node.type === "TASK" || node.type === "MATERIAL")
      node.status = "COMPLETED";
  const graph = graphResponse(data);
  assert.deepEqual(graph.analysis.activeCriticalPath, []);
  const visible = new Set(graph.nodes.map((node) => node.id));
  const flow = buildFlowEdges(graph, visible, true);
  assert.ok(flow.every((edge) => !edge.animated));
  const plumber = flow.find((edge) =>
    edge.id.startsWith("resource:pro-marco:"),
  )!;
  assert.match(String(plumber.label), /Marco Bianchi/);
  assert.match(plumber.className!, /resource-historical/);
  assert.equal(plumber.sourceHandle, "crew-out");
  assert.ok(plumber.markerEnd);
  visible.delete("kitchen-plumbing");
  assert.ok(
    !buildFlowEdges(graph, visible, true).some(
      (edge) => edge.id === plumber.id,
    ),
  );
});
