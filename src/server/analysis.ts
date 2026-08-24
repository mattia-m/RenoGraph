import type { Analysis, GraphResponse, RenovationData, ScenarioChange, ScenarioResult, Summary } from "../shared/types.js";
import { blockers, RenovationRuntime, schedule } from "./graph.js";

function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function analyze(data: RenovationData): Analysis {
  const entries = schedule(data);
  const durationDays = Math.max(0, ...entries.map((entry) => entry.earliestFinish));
  return { schedule: entries, durationDays, criticalPath: entries.filter((entry) => entry.critical).sort((a, b) => a.earliestStart - b.earliestStart).map((entry) => entry.nodeId), completionDate: addDays(data.renovation.startDate, durationDays) };
}

export function summary(data: RenovationData, analysis = analyze(data)): Summary {
  const tasks = data.nodes.filter((node) => node.type === "TASK");
  const readyTasks = tasks.filter((node) => node.status === "READY").length;
  const blockedTasks = tasks.filter((node) => node.status === "BLOCKED").length;
  return {
    progress: tasks.length ? tasks.filter((node) => node.status === "COMPLETED").length / tasks.length : 0,
    budget: data.renovation.budget,
    estimatedCost: data.nodes.reduce((total, node) => total + (node.estimatedCost ?? 0), 0),
    actualCost: data.nodes.reduce((total, node) => total + (node.actualCost ?? 0), 0),
    completionDate: analysis.completionDate,
    readyTasks,
    blockedTasks,
    criticalPathDurationDays: analysis.durationDays,
    totalTasks: tasks.length,
  };
}

export function graphResponse(data: RenovationData, analysis = analyze(data)): GraphResponse {
  const entryById = new Map(analysis.schedule.map((entry) => [entry.nodeId, entry]));
  const graphNodes = data.nodes.map((node) => {
    const explanation = node.status === "BLOCKED" ? blockers(data, node.id) : undefined;
    return { ...node, label: node.name, critical: entryById.get(node.id)?.critical ?? false, blockedBy: explanation?.blockedBy ?? [], rootBlockers: explanation?.rootBlockers ?? [] };
  });
  const edges = data.relationships.map((edge) => ({ ...edge, source: edge.fromNodeId, target: edge.toNodeId, critical: Boolean(entryById.get(edge.fromNodeId)?.critical && entryById.get(edge.toNodeId)?.critical) }));
  return { nodes: graphNodes, edges, analysis };
}

function applyChanges(data: RenovationData, changes: ScenarioChange[]): void {
  for (const change of changes) {
    const node = data.nodes.find((candidate) => candidate.id === change.nodeId);
    if (!node) throw new Error("NODE_NOT_FOUND");
    if (change.durationDeltaDays !== undefined) node.durationDays = Math.max(0, (node.durationDays ?? 0) + change.durationDeltaDays);
    if (change.newDurationDays !== undefined) node.durationDays = Math.max(0, change.newDurationDays);
    if (change.newStatus) node.status = change.newStatus;
    if (change.estimatedCostDelta !== undefined) node.estimatedCost = (node.estimatedCost ?? 0) + change.estimatedCostDelta;
  }
}

export function simulatePure(baseline: RenovationData, name: string, changes: ScenarioChange[]): ScenarioResult {
  const changed: RenovationData = structuredClone(baseline);
  applyChanges(changed, changes);
  const changedIds = new Set(changes.map((change) => change.nodeId));
  const baselineAnalysis = analyze(baseline);
  const scenarioAnalysis = analyze(changed);
  const baselineEntries = new Map(baselineAnalysis.schedule.map((entry) => [entry.nodeId, entry]));
  const affectedNodes = scenarioAnalysis.schedule.map((entry) => ({ id: entry.nodeId, name: changed.nodes.find((node) => node.id === entry.nodeId)!.name, scheduleDeltaDays: entry.earliestStart - (baselineEntries.get(entry.nodeId)?.earliestStart ?? entry.earliestStart) })).filter((node) => node.scheduleDeltaDays !== 0 || changedIds.has(node.id));
  const baselineCost = summary(baseline, baselineAnalysis).estimatedCost;
  const scenarioCost = summary(changed, scenarioAnalysis).estimatedCost;
  return {
    scenario: name,
    baseline: { completionDate: baselineAnalysis.completionDate, estimatedCost: baselineCost },
    scenarioResult: { completionDate: scenarioAnalysis.completionDate, estimatedCost: scenarioCost },
    impact: { delayDays: scenarioAnalysis.durationDays - baselineAnalysis.durationDays, additionalCost: scenarioCost - baselineCost, criticalPathChanged: baselineAnalysis.criticalPath.join(",") !== scenarioAnalysis.criticalPath.join(",") },
    affectedNodes,
    affectedChain: affectedNodes.sort((left, right) => right.scheduleDeltaDays - left.scheduleDeltaDays).map((node) => node.id),
    graph: graphResponse(changed, scenarioAnalysis),
  };
}

export async function simulate(baseline: RenovationData, name: string, changes: ScenarioChange[]): Promise<ScenarioResult> {
  const changed: RenovationData = structuredClone(baseline);
  applyChanges(changed, changes);
  const changedIds = new Set(changes.map((change) => change.nodeId));
  const scenarioRuntime = new RenovationRuntime(changed, { role: "scenario" });
  try {
    await scenarioRuntime.ready();
    scenarioRuntime.refresh();
    scenarioRuntime.deriveStatuses();
    const baselineAnalysis = analyze(baseline);
    const scenarioAnalysis = analyze(changed);
    const baselineEntries = new Map(baselineAnalysis.schedule.map((entry) => [entry.nodeId, entry]));
    const affectedNodes = scenarioAnalysis.schedule.map((entry) => ({ id: entry.nodeId, name: changed.nodes.find((node) => node.id === entry.nodeId)!.name, scheduleDeltaDays: entry.earliestStart - (baselineEntries.get(entry.nodeId)?.earliestStart ?? entry.earliestStart) })).filter((node) => node.scheduleDeltaDays !== 0 || changedIds.has(node.id));
    const baselineCost = summary(baseline, baselineAnalysis).estimatedCost;
    const scenarioCost = summary(changed, scenarioAnalysis).estimatedCost;
    return {
      scenario: name,
      baseline: { completionDate: baselineAnalysis.completionDate, estimatedCost: baselineCost },
      scenarioResult: { completionDate: scenarioAnalysis.completionDate, estimatedCost: scenarioCost },
      impact: { delayDays: scenarioAnalysis.durationDays - baselineAnalysis.durationDays, additionalCost: scenarioCost - baselineCost, criticalPathChanged: baselineAnalysis.criticalPath.join(",") !== scenarioAnalysis.criticalPath.join(",") },
      affectedNodes,
      affectedChain: affectedNodes.sort((left, right) => right.scheduleDeltaDays - left.scheduleDeltaDays).map((node) => node.id),
      graph: { ...graphResponse(changed, scenarioAnalysis), runtime: scenarioRuntime.runtimeInfo() },
    };
  } finally {
    scenarioRuntime.dispose();
  }
}
