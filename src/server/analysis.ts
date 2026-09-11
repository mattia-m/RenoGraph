import type { Analysis, CriticalState, ProjectForecast, GraphResponse, RenovationData, ScenarioChange, ScenarioResult } from "../shared/types.js";
import { RenovationRuntime } from "./graph.js";
import { applyScenarioChanges } from "./commands.js";
import { blockers } from "./domain.js";
import { analyze, summary } from "./forecast.js";
export { analyze, summary } from "./forecast.js";

export function graphResponse(data: RenovationData, analysis = analyze(data)): GraphResponse {
  const entryById = new Map(analysis.schedule.map((entry) => [entry.nodeId, entry]));
  const byId = new Map(data.nodes.map((node) => [node.id, node]));
  const state = (critical: boolean, nodeId: string): CriticalState => !critical ? "NONE" : byId.get(nodeId)?.status === "COMPLETED" ? "HISTORICAL" : "ACTIVE";
  // Two zero-slack endpoints alone do not make an edge part of the driving path.
  const drivesFinish = (predecessorId: string, successorId: string) => {
    const previous = entryById.get(predecessorId);
    const next = entryById.get(successorId);
    return Boolean(previous?.critical && next?.critical && previous.earliestFinish === next.earliestStart);
  };
  const graphNodes = data.nodes.map((node) => {
    const explanation = node.status === "BLOCKED" ? blockers(data, node.id) : undefined;
    const critical = entryById.get(node.id)?.critical ?? false;
    return { ...node, label: node.name, critical, criticalState: state(critical, node.id), blockedBy: explanation?.blockedBy ?? [], rootBlockers: explanation?.rootBlockers ?? [] };
  });
  const edges = data.relationships.map((edge) => {
    const critical = edge.type === "DEPENDS_ON" && drivesFinish(edge.toNodeId, edge.fromNodeId);
    return { ...edge, source: edge.fromNodeId, target: edge.toNodeId, critical, criticalState: state(critical, edge.fromNodeId) };
  });
  const resourceEdges = analysis.resourceLinks.map((link) => {
    const professional = data.professionals?.find((person) => person.id === link.professionalId);
    return { ...link, id: `resource:${link.professionalId}:${link.predecessorTaskId}:${link.successorTaskId}`,
      source: link.predecessorTaskId, target: link.successorTaskId,
      professionalName: professional?.name ?? link.professionalId, trade: professional?.trade ?? "Shared crew",
      criticalState: state(drivesFinish(link.predecessorTaskId, link.successorTaskId), link.successorTaskId),
    };
  });
  return { nodes: graphNodes, edges, resourceEdges, analysis };
}

function selectedDeliveryDays(data: RenovationData, nodeId: string): number {
  const material = data.nodes.find((node) => node.id === nodeId && node.type === "MATERIAL");
  if (!material) return 0;
  if (material.status === "COMPLETED") return 0;
  return material.options?.find((option) => option.id === material.selectedOptionId)?.deliveryDays ?? material.options?.[0]?.deliveryDays ?? 0;
}

function affectedNodes(baseline: RenovationData, changed: RenovationData, changes: ScenarioChange[], baselineAnalysis: Analysis, scenarioAnalysis: Analysis) {
  const changedIds = new Set(changes.map((change) => change.nodeId));
  const baselineEntries = new Map(baselineAnalysis.schedule.map((entry) => [entry.nodeId, entry]));
  const tasks = scenarioAnalysis.schedule.map((entry) => ({ id: entry.nodeId, name: changed.nodes.find((node) => node.id === entry.nodeId)!.name, scheduleDeltaDays: entry.earliestStart - (baselineEntries.get(entry.nodeId)?.earliestStart ?? entry.earliestStart) })).filter((node) => node.scheduleDeltaDays !== 0 || changedIds.has(node.id));
  const materials = changes.filter((change) => changed.nodes.find((node) => node.id === change.nodeId)?.type === "MATERIAL").map((change) => ({
    id: change.nodeId,
    name: changed.nodes.find((node) => node.id === change.nodeId)!.name,
    scheduleDeltaDays: selectedDeliveryDays(changed, change.nodeId) - selectedDeliveryDays(baseline, change.nodeId),
  }));
  return [...materials, ...tasks];
}

export function simulatePure(baseline: RenovationData, name: string, changes: ScenarioChange[]): ScenarioResult {
  const changed: RenovationData = structuredClone(baseline);
  applyScenarioChanges(changed, changes);
  const baselineAnalysis = analyze(baseline);
  const scenarioAnalysis = analyze(changed);
  const affected = affectedNodes(baseline, changed, changes, baselineAnalysis, scenarioAnalysis);
  const baselineCost = summary(baseline, baselineAnalysis).estimatedCost;
  const scenarioCost = summary(changed, scenarioAnalysis).estimatedCost;
  return {
    scenario: name,
    baseline: { completionDate: baselineAnalysis.completionDate, estimatedCost: baselineCost },
    scenarioResult: { completionDate: scenarioAnalysis.completionDate, estimatedCost: scenarioCost },
    impact: { delayDays: scenarioAnalysis.durationDays - baselineAnalysis.durationDays, additionalCost: scenarioCost - baselineCost, criticalPathChanged: baselineAnalysis.criticalPath.join(",") !== scenarioAnalysis.criticalPath.join(",") },
    affectedNodes: affected,
    affectedChain: [...affected].sort((left, right) => right.scheduleDeltaDays - left.scheduleDeltaDays).map((node) => node.id),
    graph: graphResponse(changed, scenarioAnalysis),
  };
}

export async function simulate(baseline: RenovationData, name: string, changes: ScenarioChange[], baselineForecast?: ProjectForecast): Promise<ScenarioResult> {
  const changed: RenovationData = structuredClone(baseline);
  applyScenarioChanges(changed, changes);
  const scenarioRuntime = new RenovationRuntime(changed, { role: "scenario" });
  try {
    await scenarioRuntime.ready();
    scenarioRuntime.refresh();
    scenarioRuntime.deriveStatuses();
    const baselineAnalysis = baselineForecast?.analysis ?? analyze(baseline);
    const scenarioForecast = scenarioRuntime.forecast();
    const scenarioAnalysis = scenarioForecast.analysis;
    const affected = affectedNodes(baseline, changed, changes, baselineAnalysis, scenarioAnalysis);
    const baselineCost = (baselineForecast?.summary ?? summary(baseline, baselineAnalysis)).estimatedCost;
    const scenarioCost = scenarioForecast.summary.estimatedCost;
    return {
      scenario: name,
      baseline: { completionDate: baselineAnalysis.completionDate, estimatedCost: baselineCost },
      scenarioResult: { completionDate: scenarioAnalysis.completionDate, estimatedCost: scenarioCost },
      impact: { delayDays: scenarioAnalysis.durationDays - baselineAnalysis.durationDays, additionalCost: scenarioCost - baselineCost, criticalPathChanged: baselineAnalysis.criticalPath.join(",") !== scenarioAnalysis.criticalPath.join(",") },
      affectedNodes: affected,
      affectedChain: [...affected].sort((left, right) => right.scheduleDeltaDays - left.scheduleDeltaDays).map((node) => node.id),
      graph: { ...graphResponse(changed, scenarioAnalysis), runtime: scenarioRuntime.runtimeInfo() },
    };
  } finally {
    scenarioRuntime.dispose();
  }
}
