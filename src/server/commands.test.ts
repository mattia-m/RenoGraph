import assert from "node:assert/strict";
import test from "node:test";
import {
  applyScenarioChanges,
  patchNode,
  validateRelationship,
} from "./commands.js";
import { blockers, deriveDomainStatuses } from "./domain.js";
import { createDemoData } from "./seed.js";

test("manual blockers and available material options use the readiness rules in explanations", () => {
  const data = createDemoData();
  patchNode(data, "bathroom-plumbing", { manualBlocker: "Permit hold" });
  const explanation = blockers(data, "bathroom-plumbing");
  assert.equal(explanation.status, "BLOCKED");
  assert.deepEqual(explanation.manualReasons, [
    { nodeId: "bathroom-plumbing", reason: "Permit hold" },
  ]);
  assert.ok(explanation.rootBlockers.includes("bathroom-plumbing"));
  const material = data.nodes.find((node) => node.id === "bathroom-tiles")!;
  material.selectedOptionId = "express";
  assert.ok(!blockers(data, "bathroom-tiling").blockedBy.includes(material.id));
  assert.ok(
    !blockers(data, "bathroom-grouting").rootBlockers.includes(material.id),
  );
  patchNode(data, "bathroom-plumbing", {
    status: "BLOCKED",
    manualBlocker: "",
  });
  assert.equal(blockers(data, "bathroom-plumbing").status, "READY");
});

test("patches and scenario commands enforce completion and start prerequisites", () => {
  const data = createDemoData();
  deriveDomainStatuses(data);
  const before = structuredClone(data);
  assert.throws(
    () => patchNode(data, "bathroom-tiling", { status: "IN_PROGRESS" }),
    /INVALID_STATUS_TRANSITION/,
  );
  assert.throws(
    () =>
      patchNode(data, "bathroom-tiling", {
        status: "COMPLETED",
        actualDurationDays: 3,
      }),
    /INVALID_STATUS_TRANSITION/,
  );
  assert.throws(
    () => patchNode(data, "bathroom-plumbing", { status: "COMPLETED" }),
    /ACTUAL_DURATION_REQUIRED/,
  );
  assert.deepEqual(data, before);
  assert.throws(
    () =>
      applyScenarioChanges(structuredClone(data), [
        { nodeId: "bathroom-plumbing", newStatus: "COMPLETED" },
      ]),
    /ACTUAL_DURATION_REQUIRED/,
  );
  applyScenarioChanges(data, [
    {
      nodeId: "bathroom-plumbing",
      newStatus: "COMPLETED",
      actualDurationDays: 3,
    },
  ]);
  assert.equal(
    data.nodes.find((node) => node.id === "bathroom-plumbing")
      ?.actualDurationDays,
    3,
  );
});

test("scenario block commands survive derivation and ordinary blocked edits stay derived", () => {
  const data = createDemoData();
  deriveDomainStatuses(data);
  patchNode(data, "bathroom-tiling", { status: "BLOCKED", name: "Tiling" });
  assert.equal(
    data.nodes.find((node) => node.id === "bathroom-tiling")?.manualBlocker,
    undefined,
  );
  applyScenarioChanges(data, [
    { nodeId: "bathroom-plumbing", newStatus: "BLOCKED" },
  ]);
  assert.equal(
    data.nodes.find((node) => node.id === "bathroom-plumbing")?.status,
    "BLOCKED",
  );
  assert.equal(
    blockers(data, "bathroom-plumbing").manualReasons?.[0].reason,
    "Manually blocked",
  );
});

test("relationship commands reject mismatched endpoint types and cycles", () => {
  const data = createDemoData();
  for (const input of [
    {
      fromNodeId: "bathroom-plumbing",
      toNodeId: "bathroom",
      type: "DEPENDS_ON" as const,
    },
    {
      fromNodeId: "bathroom-tiles",
      toNodeId: "bathroom-plumbing",
      type: "REQUIRES_MATERIAL" as const,
    },
    {
      fromNodeId: "bathroom-plumbing",
      toNodeId: "bathroom-tiles",
      type: "LOCATED_IN" as const,
    },
  ])
    assert.throws(
      () => validateRelationship(data, input),
      /INVALID_RELATIONSHIP/,
    );
  assert.throws(
    () =>
      validateRelationship(data, {
        fromNodeId: "bathroom-demolition",
        toNodeId: "bathroom-plumbing",
        type: "DEPENDS_ON",
      }),
    /DEPENDENCY_CYCLE/,
  );
  assert.doesNotThrow(() =>
    validateRelationship(data, {
      fromNodeId: "bathroom-plumbing",
      toNodeId: "bathroom-tiles",
      type: "REQUIRES_MATERIAL",
    }),
  );
});
