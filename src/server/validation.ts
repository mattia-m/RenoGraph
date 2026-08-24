import type { NodeStatus, ScenarioChange } from "../shared/types.js";

const statuses = new Set<NodeStatus>(["PLANNED", "READY", "IN_PROGRESS", "COMPLETED", "BLOCKED"]);

export function validateScenarioInput(input: unknown): { name: string; changes: ScenarioChange[] } {
  if (!input || typeof input !== "object") throw new Error("INVALID_SCENARIO");
  const candidate = input as { name?: unknown; changes?: unknown };
  if (candidate.name !== undefined && typeof candidate.name !== "string") throw new Error("INVALID_SCENARIO");
  if (!Array.isArray(candidate.changes) || candidate.changes.length === 0) throw new Error("INVALID_SCENARIO");
  const changes = candidate.changes.map((raw) => {
    if (!raw || typeof raw !== "object") throw new Error("INVALID_SCENARIO");
    const change = raw as Record<string, unknown>;
    if (typeof change.nodeId !== "string" || !change.nodeId) throw new Error("INVALID_SCENARIO");
    for (const key of ["durationDeltaDays", "newDurationDays", "estimatedCostDelta", "deliveryDeltaDays", "newDeliveryDays"]) {
      if (change[key] !== undefined && (typeof change[key] !== "number" || !Number.isFinite(change[key] as number))) throw new Error("INVALID_SCENARIO");
    }
    if ((change.newDurationDays !== undefined && (change.newDurationDays as number) < 0) || (change.newDeliveryDays !== undefined && (change.newDeliveryDays as number) < 0)) throw new Error("INVALID_DURATION");
    if (change.newStatus !== undefined && (typeof change.newStatus !== "string" || !statuses.has(change.newStatus as NodeStatus))) throw new Error("INVALID_SCENARIO");
    return change as unknown as ScenarioChange;
  });
  return { name: (candidate.name as string | undefined) ?? "Untitled scenario", changes };
}
