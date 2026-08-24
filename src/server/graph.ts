import { ComplexNode, ListNode, MultiNode, WaveBinder } from "wave-binder";
import { randomUUID } from "node:crypto";
import type { BlockerExplanation, NodeStatus, RenovationData, RenovationNode, Relationship, ScheduleEntry } from "../shared/types.js";

const completionName = (id: string) => `${id}__completed`;
const deliveredName = (id: string) => `${id}__delivered`;
const availableName = (id: string) => `${id}__available`;
const readyName = (id: string) => `${id}__ready`;
const progressName = (id: string) => `${id}__in_progress`;
const stateName = (id: string) => `${id}__state`;
const optionName = (id: string) => `${id}__option`;

function licenseFromEnvironment(): any {
  const raw = process.env.WAVEBINDER_LICENSE;
  if (!raw) throw new Error("WAVEBINDER_LICENSE is required to start Renograph");
  return JSON.parse(raw);
}

export class RenovationRuntime {
  readonly binder: WaveBinder;
  readonly instanceId = randomUUID();
  readonly createdAt = new Date().toISOString();
  readonly role: "baseline" | "scenario";
  readonly rebuildCount: number;
  private readonly subscriptions: any[] = [];
  private readonly taskStateProjection = new Map<string, any>();
  private readonly events: Array<{ nodeId: string; status: string; at: string }> = [];

  constructor(readonly data: RenovationData, metadata: { role?: "baseline" | "scenario"; rebuildCount?: number } = {}) {
    this.role = metadata.role ?? "baseline";
    this.rebuildCount = metadata.rebuildCount ?? 0;
    const taskNodes = data.nodes.filter((node) => node.type === "TASK");
    const materialNodes = data.nodes.filter((node) => node.type === "MATERIAL");
    const protoNodes: any[] = [
      {
        name: "__project_start",
        type: "SINGLE",
        path: "/__project_start",
        la: { type: "USER_SELECTION" },
        defaultValue: 1,
        dep: [],
      },
      ...data.nodes.flatMap((node) => [{
        name: node.type === "MATERIAL" ? deliveredName(node.id) : completionName(node.id),
        type: "SINGLE",
        path: `/${node.id}/fact`,
        la: { type: "USER_SELECTION" },
        defaultValue: node.type === "MATERIAL" ? (node.status === "COMPLETED" ? 1 : 0) : (node.status === "COMPLETED" ? 1 : 0),
        dep: [],
      }, {
        name: node.type === "TASK" ? progressName(node.id) : `${node.id}__unused`,
        type: "SINGLE",
        path: `/${node.id}/progress`,
        la: { type: "USER_SELECTION" },
        defaultValue: node.status === "IN_PROGRESS" ? 1 : 0,
        dep: [],
      }, ...(node.type === "MATERIAL" ? [{
        name: optionName(node.id),
        type: "MULTI",
        path: `/${node.id}/option`,
        la: { type: "CUSTOM_FUNCTION", functionName: `options_${node.id}` },
        dep: [],
      }, {
        name: availableName(node.id),
        type: "SINGLE",
        path: `/${node.id}/available`,
        la: { type: "CUSTOM_FUNCTION", functionName: "materialAvailable" },
        dep: [
          { nodeName: optionName(node.id), parameterName: "option", isOptional: false, onUpdate: true },
          { nodeName: deliveredName(node.id), parameterName: "delivered", isOptional: false, onUpdate: true },
        ],
      }] : []), {
        name: readyName(node.id),
        type: "SINGLE",
        path: `/${node.id}/ready`,
        la: { type: "CUSTOM_FUNCTION", functionName: "allDependenciesSatisfied" },
        dep: this.dependenciesFor(node, taskNodes, materialNodes),
      }, ...(node.type === "TASK" ? [{
        name: stateName(node.id),
        type: "COMPLEX",
        path: `/${node.id}/state`,
        la: { type: "CUSTOM_FUNCTION", functionName: `state_${node.id}` },
        dep: [
          { nodeName: completionName(node.id), parameterName: "completed", isOptional: false, onUpdate: true },
          { nodeName: progressName(node.id), parameterName: "inProgress", isOptional: false, onUpdate: true },
          { nodeName: readyName(node.id), parameterName: "ready", isOptional: false, onUpdate: true },
        ],
        protos: [
          { name: "status", type: "SINGLE", path: "/status", la: { type: "USER_SELECTION" }, dep: [] },
          { name: "duration", type: "SINGLE", path: "/duration", la: { type: "USER_SELECTION" }, dep: [] },
          { name: "estimatedCost", type: "SINGLE", path: "/estimatedCost", la: { type: "USER_SELECTION" }, dep: [] },
        ],
      }] : [])]),
      ...data.nodes.filter((node) => node.type === "ROOM").map((room) => ({
        name: `${room.id}__materials`,
        type: "LIST",
        path: `/${room.id}/materials`,
        la: { type: "USER_SELECTION" },
        defaultValue: data.relationships.filter((relationship) => relationship.type === "REQUIRES_MATERIAL" && data.relationships.some((location) => location.type === "LOCATED_IN" && location.fromNodeId === relationship.fromNodeId && location.toNodeId === room.id)).length,
        dep: [],
        proto: { name: `${room.id}__material`, type: "SINGLE", path: "/material", la: { type: "USER_SELECTION" }, dep: [] },
      })),
    ];

    const customFunctions: any[] = [{
      name: "allDependenciesSatisfied",
      implementation: (...values: unknown[]) => Number(values.length > 0 && values.every((value) => value === 1)),
    }, {
      name: "materialAvailable",
      implementation: (option: any, delivered: number) => Number(Boolean(option?.available) || delivered === 1),
    }, ...materialNodes.map((material) => ({
      name: `options_${material.id}`,
      implementation: () => material.options ?? [],
    })), ...taskNodes.map((task) => ({
      name: `state_${task.id}`,
      implementation: (completed: number, inProgress: number, ready: number) => ({
        status: completed === 1 ? "COMPLETED" : inProgress === 1 ? "IN_PROGRESS" : ready === 1 ? "READY" : "BLOCKED",
        duration: task.durationDays ?? 0,
        estimatedCost: task.estimatedCost ?? 0,
      }),
    }))];
    this.binder = new WaveBinder(licenseFromEnvironment(), protoNodes, new Map(), customFunctions);
    this.binder.tangleNodes();
  }

  private dependenciesFor(node: RenovationNode, tasks: RenovationNode[], materials: RenovationNode[]) {
    const dependencies = this.data.relationships.filter((relationship) => relationship.fromNodeId === node.id && relationship.type !== "LOCATED_IN");
    const result = dependencies.map((relationship) => {
      const upstream = this.data.nodes.find((candidate) => candidate.id === relationship.toNodeId)!;
      return {
        nodeName: upstream.type === "MATERIAL" ? availableName(upstream.id) : completionName(upstream.id),
        parameterName: upstream.id,
        isOptional: false,
        onUpdate: true,
      };
    });
    if (result.length === 0) {
      result.push({ nodeName: "__project_start", parameterName: "projectStart", isOptional: false, onUpdate: true });
    }
    return result;
  }

  async ready(): Promise<void> {
    await this.binder.waitUntilReady();
    if (!this.binder.isReady()) throw new Error("Wavebinder runtime is not ready");
    this.bindSubscriptions();
  }

  private bindSubscriptions(): void {
    for (const task of this.data.nodes.filter((node) => node.type === "TASK")) {
      const node = this.binder.getNodeByName(stateName(task.id)) as ComplexNode;
      this.subscriptions.push(node.subscribe((value: any) => {
        if (!value?.status) return;
        this.taskStateProjection.set(task.id, value);
        this.events.push({ nodeId: task.id, status: value.status, at: new Date().toISOString() });
        if (this.events.length > 100) this.events.shift();
      }));
    }
  }

  setFact(nodeId: string, status: NodeStatus): void {
    const node = this.data.nodes.find((candidate) => candidate.id === nodeId);
    if (!node || (node.type !== "TASK" && node.type !== "MATERIAL")) return;
    const fact = node.type === "MATERIAL" ? deliveredName(nodeId) : completionName(nodeId);
    this.binder.getNodeByName(fact).next(status === "COMPLETED" ? 1 : 0);
    if (node.type === "TASK") this.binder.getNodeByName(progressName(nodeId)).next(status === "IN_PROGRESS" ? 1 : 0);
  }

  isReady(nodeId: string): boolean {
    return this.taskState(nodeId)?.status === "READY";
  }

  taskState(nodeId: string): any { return this.taskStateProjection.get(nodeId) ?? (this.binder.getNodeByName(stateName(nodeId)) as ComplexNode)?.getNodeValue(); }

  selectMaterialOption(nodeId: string, optionId: string): RenovationNode {
    const material = this.data.nodes.find((node) => node.id === nodeId && node.type === "MATERIAL");
    if (!material || !material.options) throw new Error("NODE_NOT_FOUND");
    const index = material.options.findIndex((option) => option.id === optionId);
    if (index < 0) throw new Error("MATERIAL_OPTION_NOT_FOUND");
    const optionNode = this.binder.getNodeByName(optionName(nodeId)) as MultiNode;
    optionNode.setSelection(index);
    material.selectedOptionId = optionId;
    material.estimatedCost = material.options[index].estimatedCost;
    this.events.push({ nodeId, status: `OPTION:${optionId}`, at: new Date().toISOString() });
    return material;
  }

  refresh(): void {
    for (const node of this.data.nodes) {
      this.setFact(node.id, node.status);
      if (node.type === "MATERIAL" && node.selectedOptionId) this.selectMaterialOption(node.id, node.selectedOptionId);
    }
  }

  deriveStatuses(): void {
    for (const node of this.data.nodes.filter((candidate) => candidate.type === "TASK")) {
      if (node.status === "COMPLETED" || node.status === "IN_PROGRESS") continue;
      node.status = this.isReady(node.id) ? "READY" : "BLOCKED";
    }
  }

  runtimeInfo() {
    return {
      ready: this.binder.isReady(),
      nodeCount: this.binder.getNodes().length,
      dependencyCount: this.data.relationships.filter((relationship) => relationship.type !== "LOCATED_IN").length,
      derivedNodeCount: this.data.nodes.length,
      complexNodeCount: this.data.nodes.filter((node) => node.type === "TASK").length,
      multiNodeCount: this.data.nodes.filter((node) => node.type === "MATERIAL").length,
      listNodeCount: this.binder.getNodes().filter((node) => node instanceof ListNode).length,
      subscriptionCount: this.subscriptions.length,
      instanceId: this.instanceId,
      role: this.role,
      createdAt: this.createdAt,
      rebuildCount: this.rebuildCount,
      eventCount: this.events.length,
      lastEvent: this.events.at(-1) ? `${this.events.at(-1)!.nodeId}:${this.events.at(-1)!.status}` : undefined,
    };
  }

  recentEvents() { return this.events.slice(-12).reverse(); }

  dispose(): void { this.subscriptions.forEach((subscription) => subscription.unsubscribe()); this.binder.nukeNodes(); }
}

export function topologicalTasks(data: RenovationData): RenovationNode[] {
  const tasks = data.nodes.filter((node) => node.type === "TASK");
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const prerequisites = new Map(tasks.map((task) => [task.id, new Set<string>()]));
  for (const relationship of data.relationships.filter((item) => item.type === "DEPENDS_ON")) {
    if (byId.has(relationship.fromNodeId) && byId.has(relationship.toNodeId)) prerequisites.get(relationship.fromNodeId)!.add(relationship.toNodeId);
  }
  const result: RenovationNode[] = [];
  const remaining = new Set(tasks.map((task) => task.id));
  while (remaining.size) {
    const next = [...remaining].find((id) => [...prerequisites.get(id)!].every((dependency) => !remaining.has(dependency)));
    if (!next) throw new Error("DEPENDENCY_CYCLE");
    result.push(byId.get(next)!);
    remaining.delete(next);
  }
  return result;
}

export function schedule(data: RenovationData): ScheduleEntry[] {
  const tasks = topologicalTasks(data);
  const entries = new Map<string, ScheduleEntry>();
  const predecessors = (id: string) => data.relationships.filter((item) => item.type === "DEPENDS_ON" && item.fromNodeId === id).map((item) => item.toNodeId);
  const successors = (id: string) => data.relationships.filter((item) => item.type === "DEPENDS_ON" && item.toNodeId === id).map((item) => item.fromNodeId);
  for (const task of tasks) {
    const previous = predecessors(task.id).map((id) => entries.get(id)!).filter(Boolean);
    const earliestStart = previous.length ? Math.max(...previous.map((entry) => entry.earliestFinish)) : 0;
    entries.set(task.id, { nodeId: task.id, earliestStart, earliestFinish: earliestStart + (task.durationDays ?? 0), latestStart: 0, latestFinish: 0, slack: 0, critical: false });
  }
  const projectDuration = Math.max(0, ...[...entries.values()].map((entry) => entry.earliestFinish));
  for (const task of [...tasks].reverse()) {
    const entry = entries.get(task.id)!;
    const next = successors(task.id).map((id) => entries.get(id)!).filter(Boolean);
    entry.latestFinish = next.length ? Math.min(...next.map((candidate) => candidate.latestStart)) : projectDuration;
    entry.latestStart = entry.latestFinish - (task.durationDays ?? 0);
    entry.slack = entry.latestStart - entry.earliestStart;
    entry.critical = entry.slack === 0;
  }
  return [...entries.values()];
}

export function blockers(data: RenovationData, nodeId: string): BlockerExplanation {
  const direct = data.relationships.filter((relationship) => relationship.fromNodeId === nodeId && relationship.type !== "LOCATED_IN").map((relationship) => relationship.toNodeId).filter((id) => data.nodes.find((node) => node.id === id)?.status !== "COMPLETED");
  const roots = new Set<string>();
  const visit = (id: string, seen = new Set<string>()) => {
    if (seen.has(id)) return;
    seen.add(id);
    const next = data.relationships.filter((relationship) => relationship.fromNodeId === id && relationship.type !== "LOCATED_IN").map((relationship) => relationship.toNodeId).filter((candidate) => data.nodes.find((node) => node.id === candidate)?.status !== "COMPLETED");
    if (!next.length) roots.add(id);
    else next.forEach((candidate) => visit(candidate, seen));
  };
  direct.forEach((id) => visit(id));
  return { nodeId, status: direct.length ? "BLOCKED" : "READY", blockedBy: direct, rootBlockers: [...roots] };
}

export function validateNoCycle(data: RenovationData, fromNodeId: string, toNodeId: string): string[] | null {
  if (fromNodeId === toNodeId) return [fromNodeId, toNodeId];
  const path: string[] = [];
  const visit = (current: string, seen: Set<string>): boolean => {
    path.push(current);
    if (current === fromNodeId) return true;
    for (const relationship of data.relationships.filter((item) => item.type === "DEPENDS_ON" && item.fromNodeId === current)) {
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
