import assert from "node:assert/strict";
import test from "node:test";
import { simulate } from "./analysis.js";
import { RenovationRuntime } from "./graph.js";
import { createDemoData } from "./seed.js";

const licensed = Boolean(process.env.WAVEBINDER_LICENSE);

test("licensed Wavebinder runtime propagates multi-source renovation readiness", { skip: !licensed }, async () => {
  const data = createDemoData();
  const runtime = new RenovationRuntime(data);
  await runtime.ready();
  runtime.refresh();
  const info = runtime.runtimeInfo();
  assert.ok(info.complexNodeCount > 0);
  assert.ok(info.multiNodeCount > 0);
  assert.ok(info.listNodeCount > 0);
  assert.equal(info.subscriptionCount, info.complexNodeCount);
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
