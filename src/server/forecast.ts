import type {
  Analysis,
  ForecastInputs,
  RenovationData,
  Summary,
} from "../shared/types.js";
import { schedule } from "./domain.js";

function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function analyze(
  data: RenovationData,
  inputs?: ForecastInputs,
): Analysis {
  const entries = schedule(data, inputs);
  const durationDays = Math.max(
    0,
    ...entries.map((entry) => entry.earliestFinish),
  );
  const resourceConflicts = entries.flatMap((entry) =>
    entry.resourceDelayDays > 0
      ? entry.professionalIds.map((professionalId) => ({
          professionalId,
          taskIds: (data.assignments ?? [])
            .filter(
              (assignment) => assignment.professionalId === professionalId,
            )
            .map((assignment) => assignment.taskId),
          delayedTaskId: entry.nodeId,
          delayDays: entry.resourceDelayDays,
        }))
      : [],
  );
  const criticalPath = entries.filter((entry) => entry.critical)
    .sort((a, b) => a.earliestStart - b.earliestStart).map((entry) => entry.nodeId);
  const completed = new Set(data.nodes.filter((node) =>
    (inputs?.tasks[node.id]?.status ?? node.status) === "COMPLETED").map((node) => node.id));
  return {
    schedule: entries,
    activeCriticalPath: criticalPath.filter((id) => !completed.has(id)),
    historicalCriticalPath: criticalPath.filter((id) => completed.has(id)),
    resourceLinks: entries.flatMap((entry) => entry.resourcePredecessors.map((predecessor) => ({
      professionalId: predecessor.professionalId, predecessorTaskId: predecessor.taskId, successorTaskId: entry.nodeId,
    }))),
    durationDays,
    criticalPath,
    completionDate: addDays(data.renovation.startDate, durationDays),
    resourceConflicts,
  };
}

export function summary(
  data: RenovationData,
  analysis = analyze(data),
  inputs?: ForecastInputs,
): Summary {
  const tasks = data.nodes
    .filter((node) => node.type === "TASK")
    .map((node) => (inputs ? inputs.tasks[node.id] : node));
  const readyTasks = tasks.filter((node) => node.status === "READY").length;
  const blockedTasks = tasks.filter((node) => node.status === "BLOCKED").length;
  const cost = (kind: "estimatedCost" | "actualCost") =>
    data.nodes.reduce((total, node) => {
      const projected =
        inputs &&
        (node.type === "TASK"
          ? inputs.tasks[node.id]
          : node.type === "MATERIAL"
            ? inputs.materials[node.id]
            : undefined);
      return total + (projected?.[kind] ?? node[kind] ?? 0);
    }, 0);
  return {
    progress: tasks.length
      ? tasks.filter((node) => node.status === "COMPLETED").length /
        tasks.length
      : 0,
    budget: data.renovation.budget,
    estimatedCost: cost("estimatedCost"),
    actualCost: cost("actualCost"),
    completionDate: analysis.completionDate,
    readyTasks,
    blockedTasks,
    criticalPathDurationDays: analysis.durationDays,
    totalTasks: tasks.length,
  };
}
