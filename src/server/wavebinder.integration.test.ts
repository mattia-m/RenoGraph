import assert from "node:assert/strict";
import test from "node:test";
import { simulate } from "./analysis.js";
import { RenovationRuntime } from "./graph.js";
import { createDemoData } from "./seed.js";

const licensed = Boolean(process.env.WAVEBINDER_LICENSE);

test("licensed Wavebinder runtime propagates multi-source renovation readiness", { skip: !licensed }, async (t) => {
  const data = createDemoData();
  const runtime = new RenovationRuntime(data);
  t.after(() => runtime.dispose());
  await runtime.ready();
  runtime.refresh();
  const info = runtime.runtimeInfo();
  assert.ok(info.complexNodeCount > 0);
  assert.ok(info.multiNodeCount > 0);
  assert.ok(info.listNodeCount > 0);
  assert.equal(info.subscriptionCount, data.nodes.filter((node) => node.type === "TASK").length);
  const bathroomMaterials = info.dataPool["bathroom__materials"] as Array<Record<string, unknown>>;
  assert.ok(Array.isArray(bathroomMaterials));
  assert.equal(bathroomMaterials.length, 2);
  assert.equal(bathroomMaterials.find((item) => item.materialId === "bathroom-tiles")?.deliveryDays, 14);
  assert.equal(runtime.taskState("bathroom-plumbing")?.status, "READY");
  assert.equal(runtime.isReady("bathroom-plumbing"), true);
  assert.equal(runtime.isReady("bathroom-waterproofing"), false);
  const plumbing = data.nodes.find((node) => node.id === "bathroom-plumbing")!;
  plumbing.manualBlocker = "Permit hold";
  plumbing.delayDays = 2;
  runtime.setFact(plumbing.id, plumbing.status);
  assert.equal(runtime.isReady(plumbing.id), false);
  assert.equal(runtime.taskState(plumbing.id)?.manuallyBlocked, true);
  assert.equal(runtime.taskState(plumbing.id)?.effectiveDuration, 6);
  plumbing.manualBlocker = undefined;
  runtime.setFact(plumbing.id, plumbing.status);
  assert.equal(runtime.isReady(plumbing.id), true);
  runtime.selectMaterialOption("bathroom-tiles", "express");
  assert.equal((runtime.binder.getNodeByName("bathroom-tiles__option").getNodeValue() as { id: string }).id, "express");
  assert.ok(runtime.recentEvents().length > 0);

  data.nodes.find((node) => node.id === "bathroom-plumbing")!.status = "COMPLETED";
  data.nodes.find((node) => node.id === "bathroom-electrical")!.status = "COMPLETED";
  runtime.setFact("bathroom-plumbing", "COMPLETED");
  runtime.setFact("bathroom-electrical", "COMPLETED");
  assert.equal(runtime.isReady("bathroom-waterproofing"), true);
  runtime.dispose();
});

test("licensed scenario creates an independent Wavebinder graph", { skip: !licensed }, async () => {
  const baseline = createDemoData();
  const result = await simulate(baseline, "Critical delay", [{ nodeId: "bathroom-plumbing", durationDeltaDays: 7 }]);
  assert.equal(result.graph.runtime?.ready, true);
  assert.ok((result.graph.runtime?.nodeCount ?? 0) > baseline.nodes.length * 2);
  assert.equal(baseline.nodes.find((node) => node.id === "bathroom-plumbing")?.durationDays, 4);
});

test("licensed material scenario rebuilds structured lists and delays dependent schedule", { skip: !licensed }, async () => {
  const baseline = createDemoData();
  const result = await simulate(baseline, "Material delay", [{ nodeId: "bathroom-tiles", deliveryDeltaDays: 14, estimatedCostDelta: 350 }]);
  assert.equal(result.impact.delayDays, 14);
  assert.equal(result.impact.additionalCost, 350);
  const bathroomMaterials = result.graph.runtime?.dataPool["bathroom__materials"] as Array<Record<string, unknown>>;
  assert.equal(bathroomMaterials.find((item) => item.materialId === "bathroom-tiles")?.deliveryDays, 28);
  assert.equal(baseline.nodes.find((node) => node.id === "bathroom-tiles")?.options?.[0].deliveryDays, 14);
});

test("licensed material receipt and same-option edits propagate into room lists and project forecast", { skip: !licensed }, async (t) => {
  const data = createDemoData();
  const runtime = new RenovationRuntime(data);
  t.after(() => runtime.dispose());
  await runtime.ready();
  const material = data.nodes.find((node) => node.id === "bathroom-tiles")!;
  const bundle = () => (runtime.runtimeInfo().dataPool["bathroom__materials"] as Array<Record<string, unknown>>).find((item) => item.materialId === material.id)!;
  const costBefore = runtime.forecast().summary.estimatedCost;
  material.options![0].estimatedCost += 300;
  material.options![0].deliveryDays = 28;
  material.options![0].available = true;
  runtime.setFact(material.id, material.status);
  assert.equal(bundle().estimatedCost, 800);
  assert.equal(bundle().deliveryDays, 28);
  assert.equal(bundle().available, true);
  assert.equal(runtime.forecast().summary.estimatedCost, costBefore + 300);
  assert.equal(runtime.forecast().analysis.schedule.find((entry) => entry.nodeId === "bathroom-tiling")?.materialReadyDay, 28);
  material.status = "COMPLETED";
  runtime.setFact(material.id, material.status);
  assert.equal(bundle().delivered, true);
  assert.equal(bundle().deliveryDays, 0);
  assert.equal(runtime.forecast().analysis.schedule.find((entry) => entry.nodeId === "bathroom-tiling")?.materialReadyDay, 0);
});

test("licensed edits emit changed facts only and forecast consumes completed duration and cost", { skip: !licensed }, async (t) => {
  const data = createDemoData();
  const runtime = new RenovationRuntime(data);
  t.after(() => runtime.dispose());
  await runtime.ready();
  let unrelatedEmissions = -1;
  const subscription = runtime.binder.getNodeByName("living-painting__state").subscribe(() => { unrelatedEmissions++; });
  t.after(() => subscription.unsubscribe());
  const countBefore = runtime.recentEvents();
  runtime.refresh();
  assert.deepEqual(runtime.recentEvents(), countBefore);
  const task = data.nodes.find((node) => node.id === "bathroom-plumbing")!;
  const costBefore = runtime.forecast().summary.estimatedCost;
  task.estimatedCost! += 125;
  runtime.setFact(task.id, task.status);
  assert.equal(runtime.taskState(task.id).estimatedCost, task.estimatedCost);
  assert.equal(runtime.forecast().summary.estimatedCost, costBefore + 125);
  task.status = "COMPLETED";
  task.actualDurationDays = 1;
  runtime.setFact(task.id, task.status);
  assert.equal(runtime.forecast().analysis.schedule.find((entry) => entry.nodeId === task.id)?.effectiveDurationDays, 1);
  assert.equal(unrelatedEmissions, 0);
  const subscriptionCount = runtime.runtimeInfo().subscriptionCount;
  await runtime.ready();
  assert.equal(runtime.runtimeInfo().subscriptionCount, subscriptionCount);
});

test("licensed store commands keep facts, room bundles and forecast consistent across undo", { skip: !licensed }, async (t) => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { RenovationStore } = await import("./store.js");
  const directory = mkdtempSync(join(tmpdir(), "renograph-licensed-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const store = await RenovationStore.create({ dataPath: join(directory, "project.json") });
  t.after(() => store.runtime.dispose());
  const originalRuntimeId = store.getGraph().runtime.instanceId;
  await store.updateNode("bathroom-plumbing", { manualBlocker: "Permit" });
  assert.equal(store.getBlocked().find((node) => node.id === "bathroom-plumbing")?.explanation.status, "BLOCKED");
  await store.updateNode("bathroom-plumbing", { manualBlocker: "" });
  await store.transition("bathroom-plumbing", "COMPLETED", 1);
  assert.equal(store.getAnalysis().schedule.find((entry) => entry.nodeId === "bathroom-plumbing")?.effectiveDurationDays, 1);
  await store.transition("bathroom-tiles", "COMPLETED");
  const bundle = () => (store.getGraph().runtime.dataPool["bathroom__materials"] as Array<Record<string, unknown>>).find((item) => item.materialId === "bathroom-tiles")!;
  assert.equal(bundle().delivered, true);
  assert.equal(bundle().deliveryDays, 0);
  assert.equal(store.getGraph().runtime.instanceId, originalRuntimeId);
  await store.undo();
  assert.equal(bundle().delivered, false);
  assert.equal(bundle().deliveryDays, 14);
  assert.notEqual(store.getGraph().runtime.instanceId, originalRuntimeId);
});


test("licensed initialization wires every room and project root before populating lists", { skip: !licensed }, async (t) => {
  const data = createDemoData();
  const runtime = new RenovationRuntime(data);
  t.after(() => runtime.dispose());
  await runtime.ready();
  for (const room of data.nodes.filter((node) => node.type === "ROOM")) {
    const list = runtime.binder.getNodeByName(`${room.id}__materials`);
    assert.equal(list.depValues.size, list.node.dep.length, `unwired room: ${room.id}`);
  }
  const project = runtime.binder.getNodeByName("__project_forecast");
  assert.equal(project.depValues.size, project.node.dep.length);
  assert.ok(runtime.forecast().analysis.durationDays > 0);
});
