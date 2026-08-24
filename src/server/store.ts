import type { NodeStatus, RenovationData, RenovationNode, Relationship, ScenarioChange } from "../shared/types.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { analyze, graphResponse, simulate, summary } from "./analysis.js";
import { blockers, RenovationRuntime, validateNoCycle } from "./graph.js";
import { createDemoData } from "./seed.js";

export class RenovationStore {
  readonly data: RenovationData;
  runtime: RenovationRuntime;
  private readonly dataPath: string;
  private rebuilds = 0;

  private constructor(data: RenovationData, runtime: RenovationRuntime, dataPath: string) {
    this.data = data;
    this.runtime = runtime;
    this.dataPath = dataPath;
  }

  static async create(): Promise<RenovationStore> {
    const dataPath = path.resolve(process.env.RENOGRAPH_DATA ?? "data/renovation.json");
    const defaults = createDemoData();
    const data = existsSync(dataPath) ? JSON.parse(readFileSync(dataPath, "utf8")) as RenovationData : defaults;
    for (const node of data.nodes) {
      const seeded = defaults.nodes.find((candidate) => candidate.id === node.id);
      if (node.type === "MATERIAL" && seeded?.options && !node.options) {
        node.options = seeded.options;
        node.selectedOptionId = seeded.selectedOptionId;
      }
    }
    mkdirSync(path.dirname(dataPath), { recursive: true });
    const runtime = new RenovationRuntime(data, { role: "baseline" });
    await runtime.ready();
    const store = new RenovationStore(data, runtime, dataPath);
    runtime.refresh();
    store.deriveStatuses();
    store.persist();
    return store;
  }

  private persist(): void { writeFileSync(this.dataPath, `${JSON.stringify(this.data, null, 2)}\n`); }

  private deriveStatuses(): void {
    this.runtime.deriveStatuses();
  }

  getGraph() { return { ...graphResponse(this.data), runtime: this.runtime.runtimeInfo() }; }
  getSummary() { return summary(this.data); }
  getAnalysis() { return analyze(this.data); }
  getReady() { return this.data.nodes.filter((node) => node.type === "TASK" && node.status === "READY"); }
  getBlocked() { return this.data.nodes.filter((node) => node.type === "TASK" && node.status === "BLOCKED").map((node) => ({ ...node, explanation: blockers(this.data, node.id) })); }
  getEvents() { return this.runtime.recentEvents(); }
  getNode(nodeId: string) { return this.data.nodes.find((node) => node.id === nodeId); }

  updateNode(nodeId: string, patch: Partial<Pick<RenovationNode, "name" | "description" | "durationDays" | "estimatedCost" | "actualCost" | "status">>): RenovationNode {
    const node = this.getNode(nodeId);
    if (!node) throw new Error("NODE_NOT_FOUND");
    if (patch.durationDays !== undefined && patch.durationDays < 0) throw new Error("INVALID_DURATION");
    Object.assign(node, patch);
    this.runtime.setFact(node.id, node.status);
    this.deriveStatuses();
    this.persist();
    return node;
  }

  transition(nodeId: string, status: NodeStatus): RenovationNode {
    const node = this.getNode(nodeId);
    if (!node) throw new Error("NODE_NOT_FOUND");
    if (node.type !== "TASK" && node.type !== "MATERIAL") throw new Error("INVALID_STATUS_TRANSITION");
    if (status === "IN_PROGRESS" && node.status !== "READY") throw new Error("INVALID_STATUS_TRANSITION");
    if (status === "COMPLETED" && node.type === "TASK" && node.status !== "IN_PROGRESS" && node.status !== "READY") throw new Error("INVALID_STATUS_TRANSITION");
    node.status = status;
    this.runtime.setFact(node.id, status);
    this.deriveStatuses();
    this.persist();
    return node;
  }

  selectMaterialOption(nodeId: string, optionId: string): RenovationNode {
    const node = this.runtime.selectMaterialOption(nodeId, optionId);
    this.deriveStatuses();
    this.persist();
    return node;
  }

  async addRelationship(input: Omit<Relationship, "id" | "renovationId">): Promise<Relationship> {
    if (!this.getNode(input.fromNodeId) || !this.getNode(input.toNodeId)) throw new Error("NODE_NOT_FOUND");
    if (input.type === "DEPENDS_ON" && validateNoCycle(this.data, input.fromNodeId, input.toNodeId)) throw new Error("DEPENDENCY_CYCLE");
    const relationship = { ...input, id: `edge-${Date.now()}`, renovationId: this.data.renovation.id };
    const previous = this.runtime;
    this.data.relationships.push(relationship);
    try {
      this.rebuilds += 1;
      const next = new RenovationRuntime(this.data, { role: "baseline", rebuildCount: this.rebuilds });
      await next.ready();
      next.refresh();
      next.deriveStatuses();
      this.runtime = next;
      previous.dispose();
      this.persist();
      return relationship;
    } catch (error) {
      this.data.relationships.pop();
      throw error;
    }
  }

  async removeRelationship(relationshipId: string): Promise<void> {
    const index = this.data.relationships.findIndex((relationship) => relationship.id === relationshipId);
    if (index < 0) throw new Error("RELATIONSHIP_NOT_FOUND");
    const [removed] = this.data.relationships.splice(index, 1);
    const previous = this.runtime;
    try {
      this.rebuilds += 1;
      const next = new RenovationRuntime(this.data, { role: "baseline", rebuildCount: this.rebuilds });
      await next.ready();
      next.refresh();
      next.deriveStatuses();
      this.runtime = next;
      previous.dispose();
      this.persist();
    } catch (error) {
      this.data.relationships.splice(index, 0, removed);
      throw error;
    }
  }

  async resetDemo(): Promise<void> {
    const previous = this.runtime;
    Object.assign(this.data, createDemoData());
    this.rebuilds += 1;
    const next = new RenovationRuntime(this.data, { role: "baseline", rebuildCount: this.rebuilds });
    await next.ready();
    next.refresh();
    next.deriveStatuses();
    this.runtime = next;
    previous.dispose();
    this.persist();
  }

  simulate(name: string, changes: ScenarioChange[]) { return simulate(this.data, name, changes); }
}
