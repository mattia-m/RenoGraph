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
  assert.equal(runtime.taskState("bathroom-plumbing")?.status, "READY");
  assert.equal(runtime.isReady("bathroom-plumbing"), true);
  assert.equal(runtime.isReady("bathroom-waterproofing"), false);
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
