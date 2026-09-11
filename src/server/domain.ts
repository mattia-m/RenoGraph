import type {
  BlockerExplanation,
  RenovationData,
  RenovationNode,
  RoomMaterialRequirement,
  ScheduleEntry,
  ForecastInputs,
} from "../shared/types.js";

export function effectiveTaskDuration(task: RenovationNode): number {
  const measured =
    task.status === "COMPLETED" && task.actualDurationDays !== undefined
      ? task.actualDurationDays
      : (task.durationDays ?? 0);
  return measured + (task.delayDays ?? 0);
}

export function selectedMaterialOption(material: RenovationNode) {
  return (
    material.options?.find(
      (option) => option.id === material.selectedOptionId,
    ) ?? material.options?.[0]
  );
}

export function roomMaterialRequirements(
  data: RenovationData,
  roomId: string,
): RoomMaterialRequirement[] {
  const roomTaskIds = new Set(
    data.relationships
      .filter(
        (relationship) =>
          relationship.type === "LOCATED_IN" &&
          relationship.toNodeId === roomId,
      )
      .map((relationship) => relationship.fromNodeId),
  );
  const taskIdsByMaterial = new Map<string, string[]>();
  for (const relationship of data.relationships.filter(
    (candidate) =>
      candidate.type === "REQUIRES_MATERIAL" &&
      roomTaskIds.has(candidate.fromNodeId),
  )) {
    taskIdsByMaterial.set(relationship.toNodeId, [
      ...(taskIdsByMaterial.get(relationship.toNodeId) ?? []),
      relationship.fromNodeId,
    ]);
  }
  return [...taskIdsByMaterial.entries()].map(
    ([materialId, requiredByTaskIds]) => {
      const material = data.nodes.find(
        (node) => node.id === materialId && node.type === "MATERIAL",
      )!;
      const option = selectedMaterialOption(material);
      const delivered = material.status === "COMPLETED";
      return {
        materialId,
        materialName: material.name,
        selectedOptionId: option?.id ?? "",
        selectedOptionLabel: option?.label ?? "No option",
        available: materialAvailable(option, delivered),
        delivered,
        deliveryDays: delivered ? 0 : (option?.deliveryDays ?? 0),
        estimatedCost: option?.estimatedCost ?? material.estimatedCost ?? 0,
        requiredByTaskIds,
      };
    },
  );
}

export function topologicalTasks(data: RenovationData): RenovationNode[] {
  const tasks = data.nodes.filter((node) => node.type === "TASK");
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const prerequisites = new Map(
    tasks.map((task) => [task.id, new Set<string>()]),
  );
  for (const relationship of data.relationships.filter(
    (item) => item.type === "DEPENDS_ON",
  )) {
    if (byId.has(relationship.fromNodeId) && byId.has(relationship.toNodeId))
      prerequisites.get(relationship.fromNodeId)!.add(relationship.toNodeId);
  }
  const result: RenovationNode[] = [];
  const remaining = new Set(tasks.map((task) => task.id));
  while (remaining.size) {
    const next = [...remaining].find((id) =>
      [...prerequisites.get(id)!].every(
        (dependency) => !remaining.has(dependency),
      ),
    );
    if (!next) throw new Error("DEPENDENCY_CYCLE");
    result.push(byId.get(next)!);
    remaining.delete(next);
  }
  return result;
}

export function schedule(
  data: RenovationData,
  inputs?: ForecastInputs,
): ScheduleEntry[] {
  const tasks = topologicalTasks(data);
  const entries = new Map<string, ScheduleEntry>();
  const predecessors = (id: string) =>
    data.relationships
      .filter((item) => item.type === "DEPENDS_ON" && item.fromNodeId === id)
      .map((item) => item.toNodeId);
  const successors = (id: string) =>
    data.relationships
      .filter((item) => item.type === "DEPENDS_ON" && item.toNodeId === id)
      .map((item) => item.fromNodeId);
  const resourceSuccessors = new Map<string, Set<string>>();
  const materialConstraints = (id: string) =>
    data.relationships
      .filter(
        (item) => item.type === "REQUIRES_MATERIAL" && item.fromNodeId === id,
      )
      .map((item) => {
        const material = data.nodes.find(
          (node) => node.id === item.toNodeId && node.type === "MATERIAL",
        );
        const deliveryDays = inputs
          ? inputs.materials[item.toNodeId].deliveryDays
          : material?.status === "COMPLETED"
            ? 0
            : material
              ? (selectedMaterialOption(material)?.deliveryDays ?? 0)
              : 0;
        return { materialId: item.toNodeId, deliveryDays };
      });
  const professionalFreeDay = new Map(
    (data.professionals ?? []).map((professional) => [
      professional.id,
      professional.availableFromDay,
    ]),
  );
  const previousTaskByProfessional = new Map<string, string>();
  for (const task of tasks) {
    const previous = predecessors(task.id)
      .map((id) => entries.get(id)!)
      .filter(Boolean);
    const constraints = materialConstraints(task.id);
    const materialReadyDay = Math.max(
      0,
      ...constraints.map((constraint) => constraint.deliveryDays),
    );
    const predecessorReadyDay = previous.length
      ? Math.max(...previous.map((entry) => entry.earliestFinish))
      : 0;
    const professionalIds = (data.assignments ?? [])
      .filter((assignment) => assignment.taskId === task.id)
      .map((assignment) => assignment.professionalId);
    const resourceReadyDay = Math.max(
      0,
      ...professionalIds.map((id) => professionalFreeDay.get(id) ?? 0),
    );
    const dependencyReadyDay = Math.max(predecessorReadyDay, materialReadyDay);
    const earliestStart = Math.max(dependencyReadyDay, resourceReadyDay);
    const effectiveDurationDays = inputs
      ? inputs.tasks[task.id].effectiveDuration
      : effectiveTaskDuration(task);
    const earliestFinish = earliestStart + effectiveDurationDays;
    const resourcePredecessors: ScheduleEntry["resourcePredecessors"] = [];
    professionalIds.forEach((id) => {
      const previousTaskId = previousTaskByProfessional.get(id);
      if (previousTaskId) {
        resourcePredecessors.push({ professionalId: id, taskId: previousTaskId });
        const linked =
          resourceSuccessors.get(previousTaskId) ?? new Set<string>();
        linked.add(task.id);
        resourceSuccessors.set(previousTaskId, linked);
      }
      previousTaskByProfessional.set(id, task.id);
      professionalFreeDay.set(id, earliestFinish);
    });
    entries.set(task.id, {
      nodeId: task.id,
      earliestStart,
      earliestFinish,
      latestStart: 0,
      latestFinish: 0,
      slack: 0,
      critical: false,
      materialReadyDay,
      materialConstraints: constraints,
      effectiveDurationDays,
      resourceReadyDay,
      resourceDelayDays: Math.max(0, resourceReadyDay - dependencyReadyDay),
      professionalIds,
      resourcePredecessors,
    });
  }
  const projectDuration = Math.max(
    0,
    ...[...entries.values()].map((entry) => entry.earliestFinish),
  );
  for (const task of [...tasks].reverse()) {
    const entry = entries.get(task.id)!;
    const nextIds = new Set([
      ...successors(task.id),
      ...(resourceSuccessors.get(task.id) ?? []),
    ]);
    const next = [...nextIds].map((id) => entries.get(id)!).filter(Boolean);
    entry.latestFinish = next.length
      ? Math.min(...next.map((candidate) => candidate.latestStart))
      : projectDuration;
    entry.latestStart =
      entry.latestFinish -
      (inputs
        ? inputs.tasks[task.id].effectiveDuration
        : effectiveTaskDuration(task));
    entry.slack = entry.latestStart - entry.earliestStart;
    entry.critical = entry.slack === 0;
  }
  return [...entries.values()];
}

export function materialAvailable(
  option: { available: boolean } | undefined,
  delivered: boolean,
): boolean {
  return delivered || Boolean(option?.available);
}

export function dependencySatisfied(node: RenovationNode): boolean {
  return node.type === "MATERIAL"
    ? materialAvailable(
        selectedMaterialOption(node),
        node.status === "COMPLETED",
      )
    : node.status === "COMPLETED";
}

export function blockers(
  data: RenovationData,
  nodeId: string,
): BlockerExplanation {
  const byId = new Map(data.nodes.map((node) => [node.id, node]));
  const unsatisfied = (id: string) =>
    data.relationships
      .filter((edge) => edge.fromNodeId === id && edge.type !== "LOCATED_IN")
      .map((edge) => edge.toNodeId)
      .filter((id) => !byId.has(id) || !dependencySatisfied(byId.get(id)!));
  const direct = [...new Set(unsatisfied(nodeId))];
  const roots = new Set<string>();
  const manualReasons = new Map<string, string>();
  const visit = (id: string, seen = new Set<string>()) => {
    if (seen.has(id)) return;
    seen.add(id);
    const reason = byId.get(id)?.manualBlocker?.trim();
    if (reason) {
      roots.add(id);
      manualReasons.set(id, reason);
    }
    const next = unsatisfied(id);
    if (!next.length) roots.add(id);
    else next.forEach((upstream) => visit(upstream, seen));
  };
  direct.forEach((id) => visit(id));
  const reason = byId.get(nodeId)?.manualBlocker?.trim();
  if (reason) {
    roots.add(nodeId);
    manualReasons.set(nodeId, reason);
  }
  return {
    nodeId,
    status: direct.length || reason ? "BLOCKED" : "READY",
    blockedBy: direct,
    rootBlockers: [...roots],
    ...(manualReasons.size
      ? {
          manualReasons: [...manualReasons].map(([nodeId, reason]) => ({
            nodeId,
            reason,
          })),
        }
      : {}),
  };
}

export function deriveDomainStatuses(data: RenovationData): void {
  for (const node of data.nodes.filter((node) => node.type === "TASK")) {
    if (node.status !== "COMPLETED" && node.status !== "IN_PROGRESS")
      node.status = blockers(data, node.id).status;
  }
}

export function validateNoCycle(
  data: RenovationData,
  fromNodeId: string,
  toNodeId: string,
): string[] | null {
  if (fromNodeId === toNodeId) return [fromNodeId, toNodeId];
  const path: string[] = [];
  const visit = (current: string, seen: Set<string>): boolean => {
    path.push(current);
    if (current === fromNodeId) return true;
    for (const relationship of data.relationships.filter(
      (item) => item.type === "DEPENDS_ON" && item.fromNodeId === current,
    )) {
      if (!seen.has(relationship.toNodeId)) {
        seen.add(relationship.toNodeId);
        if (visit(relationship.toNodeId, seen)) return true;
      }
    }
    path.pop();
    return false;
  };
  return visit(toNodeId, new Set([toNodeId])) ? [fromNodeId, ...path] : null;
}
