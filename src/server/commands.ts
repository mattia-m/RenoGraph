import type {
  MaterialOption,
  RenovationData,
  RenovationNode,
  Relationship,
  ScenarioChange,
} from "../shared/types.js";
import {
  blockers,
  deriveDomainStatuses,
  selectedMaterialOption,
  validateNoCycle,
} from "./domain.js";

export type NodePatch = Partial<
  Pick<
    RenovationNode,
    | "name"
    | "description"
    | "durationDays"
    | "actualDurationDays"
    | "delayDays"
    | "manualBlocker"
    | "estimatedCost"
    | "actualCost"
    | "status"
  >
>;
export function nonnegative(value: unknown, error: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new Error(error);
}
export function findNode(data: RenovationData, id: string): RenovationNode {
  const node = data.nodes.find((node) => node.id === id);
  if (!node) throw new Error("NODE_NOT_FOUND");
  return node;
}

export function patchNode(
  data: RenovationData,
  nodeId: string,
  patch: NodePatch,
  forceTransition = false,
): RenovationNode {
  const node = findNode(data, nodeId);
  const updated = { ...node, ...patch };
  for (const key of [
    "durationDays",
    "actualDurationDays",
    "delayDays",
  ] as const)
    if (patch[key] !== undefined) nonnegative(patch[key], "INVALID_DURATION");
  for (const key of ["estimatedCost", "actualCost"] as const)
    if (patch[key] !== undefined) nonnegative(patch[key], "INVALID_COST");
  if (patch.name !== undefined) {
    if (typeof patch.name !== "string" || !patch.name.trim())
      throw new Error("INVALID_NAME");
    updated.name = patch.name.trim();
  }
  if (patch.description !== undefined && typeof patch.description !== "string")
    throw new Error("INVALID_DESCRIPTION");
  if (patch.manualBlocker !== undefined) {
    if (typeof patch.manualBlocker !== "string")
      throw new Error("INVALID_BLOCKER");
    updated.manualBlocker = patch.manualBlocker.trim() || undefined;
  }
  if (
    patch.status !== undefined &&
    !["PLANNED", "READY", "IN_PROGRESS", "COMPLETED", "BLOCKED"].includes(
      patch.status,
    )
  )
    throw new Error("INVALID_STATUS_TRANSITION");
  if (
    patch.status !== undefined &&
    (patch.status !== node.status || forceTransition)
  ) {
    if (node.type === "ROOM") throw new Error("INVALID_STATUS_TRANSITION");
    const candidate = {
      ...data,
      nodes: data.nodes.map((item) => (item.id === nodeId ? updated : item)),
    };
    if (node.type === "TASK") {
      const ready = blockers(candidate, nodeId).status === "READY";
      if (
        patch.status === "IN_PROGRESS" &&
        (!ready || node.status === "COMPLETED")
      )
        throw new Error("INVALID_STATUS_TRANSITION");
      if (patch.status === "COMPLETED") {
        if (
          node.status !== "IN_PROGRESS" &&
          (node.status === "COMPLETED" || !ready)
        )
          throw new Error("INVALID_STATUS_TRANSITION");
        nonnegative(updated.actualDurationDays, "ACTUAL_DURATION_REQUIRED");
      }
      if (patch.status === "BLOCKED")
        updated.manualBlocker ||= "Manually blocked";
      if (patch.status === "IN_PROGRESS" || patch.status === "COMPLETED")
        updated.manualBlocker = undefined;
    }
  }
  if (node.type === "MATERIAL" && patch.estimatedCost !== undefined) {
    const option = selectedMaterialOption(node);
    if (option) option.estimatedCost = patch.estimatedCost;
  }
  Object.assign(node, updated);
  deriveDomainStatuses(data);
  return node;
}

export function patchMaterialOption(
  data: RenovationData,
  nodeId: string,
  optionId: string,
  patch: Partial<
    Pick<
      MaterialOption,
      "label" | "deliveryDays" | "estimatedCost" | "available"
    >
  >,
): RenovationNode {
  const node = findNode(data, nodeId);
  const option =
    node.type === "MATERIAL"
      ? node.options?.find((option) => option.id === optionId)
      : undefined;
  if (!option) throw new Error("MATERIAL_OPTION_NOT_FOUND");
  if (patch.deliveryDays !== undefined)
    nonnegative(patch.deliveryDays, "INVALID_DURATION");
  if (patch.estimatedCost !== undefined)
    nonnegative(patch.estimatedCost, "INVALID_COST");
  if (
    patch.label !== undefined &&
    (typeof patch.label !== "string" || !patch.label.trim())
  )
    throw new Error("INVALID_NAME");
  if (patch.available !== undefined && typeof patch.available !== "boolean")
    throw new Error("INVALID_MATERIAL_OPTION");
  Object.assign(option, patch);
  node.estimatedCost =
    selectedMaterialOption(node)?.estimatedCost ?? node.estimatedCost;
  deriveDomainStatuses(data);
  return node;
}

export function selectOption(
  data: RenovationData,
  nodeId: string,
  optionId: string,
): RenovationNode {
  const node = findNode(data, nodeId);
  const option =
    node.type === "MATERIAL"
      ? node.options?.find((option) => option.id === optionId)
      : undefined;
  if (!option) throw new Error("MATERIAL_OPTION_NOT_FOUND");
  node.selectedOptionId = optionId;
  node.estimatedCost = option.estimatedCost;
  deriveDomainStatuses(data);
  return node;
}

export function validateRelationship(
  data: RenovationData,
  input: Pick<Relationship, "fromNodeId" | "toNodeId" | "type">,
): void {
  const from = findNode(data, input.fromNodeId);
  const to = findNode(data, input.toNodeId);
  const valid =
    input.type === "DEPENDS_ON"
      ? from.type === "TASK" && to.type === "TASK"
      : input.type === "REQUIRES_MATERIAL"
        ? from.type === "TASK" && to.type === "MATERIAL"
        : input.type === "LOCATED_IN" &&
          from.type !== "ROOM" &&
          to.type === "ROOM";
  if (!valid) throw new Error("INVALID_RELATIONSHIP");
  if (input.type === "DEPENDS_ON" && validateNoCycle(data, from.id, to.id))
    throw new Error("DEPENDENCY_CYCLE");
}

export function applyScenarioChanges(
  data: RenovationData,
  changes: ScenarioChange[],
): void {
  for (const change of changes) {
    const node = findNode(data, change.nodeId);
    if (node.type === "ROOM") throw new Error("INVALID_SCENARIO");
    const patch: NodePatch = {};
    if (node.type === "MATERIAL") {
      const option = selectedMaterialOption(node);
      const delta = change.deliveryDeltaDays ?? change.durationDeltaDays;
      const days = change.newDeliveryDays ?? change.newDurationDays;
      if (
        !option &&
        (delta !== undefined ||
          days !== undefined ||
          change.estimatedCostDelta !== undefined)
      )
        throw new Error("MATERIAL_OPTION_NOT_FOUND");
      if (option)
        patchMaterialOption(data, node.id, option.id, {
          ...(delta !== undefined || days !== undefined
            ? {
                deliveryDays: days ?? Math.max(0, option.deliveryDays + delta!),
              }
            : {}),
          ...(change.estimatedCostDelta !== undefined
            ? {
                estimatedCost: option.estimatedCost + change.estimatedCostDelta,
              }
            : {}),
        });
    } else {
      if (
        change.durationDeltaDays !== undefined ||
        change.newDurationDays !== undefined
      )
        patch.durationDays =
          change.newDurationDays ??
          Math.max(0, (node.durationDays ?? 0) + change.durationDeltaDays!);
      if (change.estimatedCostDelta !== undefined)
        patch.estimatedCost =
          (node.estimatedCost ?? 0) + change.estimatedCostDelta;
      if (change.actualDurationDays !== undefined)
        patch.actualDurationDays = change.actualDurationDays;
    }
    if (change.newStatus !== undefined) patch.status = change.newStatus;
    patchNode(data, node.id, patch, change.newStatus !== undefined);
  }
}
