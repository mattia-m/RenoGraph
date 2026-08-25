import type { Contractor, NodeStatus, Professional, ProjectDocument, Purchase, RenovationData, RenovationNode, Relationship, ScenarioChange, TaskAssignment } from "../shared/types.js";
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
  private readonly history: RenovationData[] = [];
  private readonly initialData: RenovationData;

  private constructor(data: RenovationData, runtime: RenovationRuntime, dataPath: string, initialData: RenovationData) {
    this.data = data;
    this.runtime = runtime;
    this.dataPath = dataPath;
    this.initialData = structuredClone(initialData);
  }

  static async create(options: { dataPath?: string; initialData?: RenovationData } = {}): Promise<RenovationStore> {
    const dataPath = path.resolve(options.dataPath ?? process.env.RENOGRAPH_DATA ?? "data/renovation.json");
    const defaults = options.initialData ?? createDemoData();
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
    data.professionals ??= [];
    data.assignments ??= [];
    data.contractors ??= [];
    data.purchases ??= [];
    data.documents ??= [];
    const store = new RenovationStore(data, runtime, dataPath, defaults);
    runtime.refresh();
    store.deriveStatuses();
    store.persist();
    return store;
  }

  private persist(): void { writeFileSync(this.dataPath, `${JSON.stringify(this.data, null, 2)}\n`); }

  private deriveStatuses(): void {
    this.runtime.deriveStatuses();
  }

  getGraph() { return { ...graphResponse(this.data), runtime: { ...this.runtime.runtimeInfo(), canUndo: this.history.length > 0 } }; }
  getSummary() { return summary(this.data); }
  getAnalysis() { return analyze(this.data); }
  getReady() { return this.data.nodes.filter((node) => node.type === "TASK" && node.status === "READY"); }
  getBlocked() { return this.data.nodes.filter((node) => node.type === "TASK" && node.status === "BLOCKED").map((node) => ({ ...node, explanation: blockers(this.data, node.id) })); }
  getEvents() { return this.runtime.recentEvents(); }
  getOperations() { return { professionals: this.data.professionals, assignments: this.data.assignments, contractors: this.data.contractors, purchases: this.data.purchases, documents: this.data.documents, resourceConflicts: this.getAnalysis().resourceConflicts }; }
  getNode(nodeId: string) { return this.data.nodes.find((node) => node.id === nodeId); }

  addProfessional(input: Pick<Professional, "name" | "trade" | "availableFromDay" | "availableToDay">): Professional {
    if (!input.name?.trim() || !input.trade?.trim() || !Number.isFinite(input.availableFromDay) || input.availableFromDay < 0) throw new Error("INVALID_PROFESSIONAL");
    this.checkpoint();
    const professional = { ...input, name: input.name.trim(), trade: input.trade.trim(), id: `professional-${Date.now()}` };
    this.data.professionals!.push(professional); this.persist(); return professional;
  }
  assignProfessional(taskId: string, professionalId: string): TaskAssignment {
    if (this.getNode(taskId)?.type !== "TASK" || !this.data.professionals!.some((item) => item.id === professionalId)) throw new Error("INVALID_ASSIGNMENT");
    if (this.data.assignments!.some((item) => item.taskId === taskId && item.professionalId === professionalId)) throw new Error("ASSIGNMENT_EXISTS");
    this.checkpoint(); const assignment = { id: `assignment-${Date.now()}`, taskId, professionalId }; this.data.assignments!.push(assignment); this.persist(); return assignment;
  }
  removeAssignment(id: string): void { const index = this.data.assignments!.findIndex((item) => item.id === id); if (index < 0) throw new Error("ASSIGNMENT_NOT_FOUND"); this.checkpoint(); this.data.assignments!.splice(index, 1); this.persist(); }
  addContractor(input: Pick<Contractor, "name" | "trade" | "contact">): Contractor { if (!input.name?.trim() || !input.trade?.trim()) throw new Error("INVALID_CONTRACTOR"); this.checkpoint(); const item = { ...input, id: `contractor-${Date.now()}` }; this.data.contractors!.push(item); this.persist(); return item; }
  addPurchase(input: Omit<Purchase, "id">): Purchase { if (!input.description?.trim() || !Number.isFinite(input.amount) || input.amount < 0) throw new Error("INVALID_PURCHASE"); this.checkpoint(); const item = { ...input, id: `purchase-${Date.now()}` }; this.data.purchases!.push(item); this.persist(); return item; }
  updatePurchase(id: string, status: Purchase["status"]): Purchase { const item = this.data.purchases!.find((candidate) => candidate.id === id); if (!item || !["REQUESTED", "ORDERED", "RECEIVED"].includes(status)) throw new Error("INVALID_PURCHASE"); this.checkpoint(); item.status = status; this.persist(); return item; }
  addDocument(input: Omit<ProjectDocument, "id">): ProjectDocument { if (!input.name?.trim() || !["QUOTE", "CONTRACT", "PERMIT", "INVOICE", "OTHER"].includes(input.kind)) throw new Error("INVALID_DOCUMENT"); this.checkpoint(); const item = { ...input, id: `document-${Date.now()}` }; this.data.documents!.push(item); this.persist(); return item; }

  updateNode(nodeId: string, patch: Partial<Pick<RenovationNode, "name" | "description" | "durationDays" | "actualDurationDays" | "delayDays" | "manualBlocker" | "estimatedCost" | "actualCost" | "status">>): RenovationNode {
    const node = this.getNode(nodeId);
    if (!node) throw new Error("NODE_NOT_FOUND");
    if (patch.durationDays !== undefined && (typeof patch.durationDays !== "number" || !Number.isFinite(patch.durationDays) || patch.durationDays < 0)) throw new Error("INVALID_DURATION");
    if (patch.estimatedCost !== undefined && (typeof patch.estimatedCost !== "number" || !Number.isFinite(patch.estimatedCost) || patch.estimatedCost < 0)) throw new Error("INVALID_COST");
    if (patch.actualDurationDays !== undefined && (typeof patch.actualDurationDays !== "number" || !Number.isFinite(patch.actualDurationDays) || patch.actualDurationDays < 0)) throw new Error("INVALID_DURATION");
    if (patch.delayDays !== undefined && (typeof patch.delayDays !== "number" || !Number.isFinite(patch.delayDays) || patch.delayDays < 0)) throw new Error("INVALID_DURATION");
    if (patch.manualBlocker !== undefined && typeof patch.manualBlocker !== "string") throw new Error("INVALID_BLOCKER");
    if (patch.manualBlocker !== undefined) patch.manualBlocker = patch.manualBlocker.trim();
    if (patch.name !== undefined && (typeof patch.name !== "string" || !patch.name.trim())) throw new Error("INVALID_NAME");
    if (patch.status !== undefined && !(["PLANNED", "READY", "IN_PROGRESS", "COMPLETED", "BLOCKED"] as NodeStatus[]).includes(patch.status)) throw new Error("INVALID_STATUS_TRANSITION");
    this.checkpoint();
    Object.assign(node, patch);
    this.runtime.setFact(node.id, node.status);
    this.deriveStatuses();
    this.runtime.refresh();
    this.persist();
    return node;
  }

  updateMaterialOption(nodeId: string, optionId: string, patch: { label?: string; deliveryDays?: number; estimatedCost?: number; available?: boolean }): RenovationNode {
    const node = this.getNode(nodeId);
    const option = node?.type === "MATERIAL" ? node.options?.find((candidate) => candidate.id === optionId) : undefined;
    if (!node || !option) throw new Error("MATERIAL_OPTION_NOT_FOUND");
    if (patch.deliveryDays !== undefined && (typeof patch.deliveryDays !== "number" || !Number.isFinite(patch.deliveryDays) || patch.deliveryDays < 0)) throw new Error("INVALID_DURATION");
    if (patch.estimatedCost !== undefined && (typeof patch.estimatedCost !== "number" || !Number.isFinite(patch.estimatedCost) || patch.estimatedCost < 0)) throw new Error("INVALID_COST");
    if (patch.label !== undefined && (typeof patch.label !== "string" || !patch.label.trim())) throw new Error("INVALID_NAME");
    if (patch.available !== undefined && typeof patch.available !== "boolean") throw new Error("INVALID_MATERIAL_OPTION");
    this.checkpoint();
    Object.assign(option, patch);
    if (node.selectedOptionId === optionId) node.estimatedCost = option.estimatedCost;
    this.runtime.selectMaterialOption(nodeId, node.selectedOptionId ?? optionId);
    this.deriveStatuses();
    this.persist();
    return node;
  }

  transition(nodeId: string, status: NodeStatus, actualDurationDays?: number): RenovationNode {
    const node = this.getNode(nodeId);
    if (!node) throw new Error("NODE_NOT_FOUND");
    if (node.type !== "TASK" && node.type !== "MATERIAL") throw new Error("INVALID_STATUS_TRANSITION");
    if (status === "IN_PROGRESS" && node.status !== "READY") throw new Error("INVALID_STATUS_TRANSITION");
    if (status === "COMPLETED" && node.type === "TASK" && node.status !== "IN_PROGRESS" && node.status !== "READY") throw new Error("INVALID_STATUS_TRANSITION");
    if (status === "COMPLETED" && node.type === "TASK" && (typeof actualDurationDays !== "number" || !Number.isFinite(actualDurationDays) || actualDurationDays < 0)) throw new Error("ACTUAL_DURATION_REQUIRED");
    this.checkpoint();
    node.status = status;
    if (status === "COMPLETED" && node.type === "TASK") node.actualDurationDays = actualDurationDays;
    if (status === "BLOCKED" && node.type === "TASK") node.manualBlocker = node.manualBlocker || "Manually blocked";
    if (status === "IN_PROGRESS" || status === "COMPLETED") node.manualBlocker = undefined;
    this.runtime.setFact(node.id, status);
    this.deriveStatuses();
    this.persist();
    return node;
  }

  selectMaterialOption(nodeId: string, optionId: string): RenovationNode {
    const material = this.getNode(nodeId);
    if (material?.type !== "MATERIAL" || !material.options?.some((option) => option.id === optionId)) throw new Error("MATERIAL_OPTION_NOT_FOUND");
    this.checkpoint();
    const node = this.runtime.selectMaterialOption(nodeId, optionId);
    this.deriveStatuses();
    this.persist();
    return node;
  }

  async addRelationship(input: Omit<Relationship, "id" | "renovationId">): Promise<Relationship> {
    if (!this.getNode(input.fromNodeId) || !this.getNode(input.toNodeId)) throw new Error("NODE_NOT_FOUND");
    if (input.type === "DEPENDS_ON" && validateNoCycle(this.data, input.fromNodeId, input.toNodeId)) throw new Error("DEPENDENCY_CYCLE");
    if (this.data.relationships.some((relationship) => relationship.fromNodeId === input.fromNodeId && relationship.toNodeId === input.toNodeId && relationship.type === input.type)) throw new Error("RELATIONSHIP_EXISTS");
    const relationship = { ...input, id: `edge-${Date.now()}`, renovationId: this.data.renovation.id };
    const snapshot = structuredClone(this.data);
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
      this.pushHistory(snapshot);
      this.persist();
      return relationship;
    } catch (error) {
      this.data.relationships.pop();
      throw error;
    }
  }

  async addNode(input: { type: "TASK" | "MATERIAL"; name: string; description?: string; roomId?: string; durationDays?: number; estimatedCost?: number; deliveryDays?: number }): Promise<RenovationNode> {
    if (!input.name?.trim() || !["TASK", "MATERIAL"].includes(input.type)) throw new Error("INVALID_NODE");
    if (input.type === "TASK" && (!Number.isFinite(input.durationDays) || (input.durationDays ?? -1) < 0)) throw new Error("INVALID_DURATION");
    const snapshot = structuredClone(this.data);
    const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "node";
    let id = slug;
    let suffix = 2;
    while (this.getNode(id)) id = `${slug}-${suffix++}`;
    const node: RenovationNode = input.type === "TASK" ? {
      id, renovationId: this.data.renovation.id, type: "TASK", name: input.name.trim(), description: input.description, status: "PLANNED", durationDays: input.durationDays ?? 1, estimatedCost: input.estimatedCost ?? 0,
      position: { x: 80 + (this.data.nodes.length % 6) * 220, y: 930 },
    } : {
      id, renovationId: this.data.renovation.id, type: "MATERIAL", name: input.name.trim(), description: input.description, status: "BLOCKED", estimatedCost: input.estimatedCost ?? 0, selectedOptionId: "standard",
      options: [{ id: "standard", label: "Standard", deliveryDays: input.deliveryDays ?? 0, estimatedCost: input.estimatedCost ?? 0, available: false }], position: { x: 80 + (this.data.nodes.length % 6) * 220, y: 1080 },
    };
    this.data.nodes.push(node);
    if (input.roomId && this.getNode(input.roomId)?.type === "ROOM") this.data.relationships.push({ id: `edge-${Date.now()}-room`, renovationId: this.data.renovation.id, fromNodeId: node.id, toNodeId: input.roomId, type: "LOCATED_IN" });
    const previous = this.runtime;
    try {
      this.rebuilds += 1;
      const next = new RenovationRuntime(this.data, { role: "baseline", rebuildCount: this.rebuilds });
      await next.ready(); next.refresh(); next.deriveStatuses(); this.runtime = next; previous.dispose(); this.pushHistory(snapshot); this.persist(); return node;
    } catch (error) { Object.assign(this.data, snapshot); throw error; }
  }

  async removeRelationship(relationshipId: string): Promise<void> {
    const index = this.data.relationships.findIndex((relationship) => relationship.id === relationshipId);
    if (index < 0) throw new Error("RELATIONSHIP_NOT_FOUND");
    const snapshot = structuredClone(this.data);
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
      this.pushHistory(snapshot);
      this.persist();
    } catch (error) {
      this.data.relationships.splice(index, 0, removed);
      throw error;
    }
  }

  async resetDemo(): Promise<void> {
    const snapshot = structuredClone(this.data);
    const previous = this.runtime;
    Object.assign(this.data, structuredClone(this.initialData));
    this.rebuilds += 1;
    const next = new RenovationRuntime(this.data, { role: "baseline", rebuildCount: this.rebuilds });
    await next.ready();
    next.refresh();
    next.deriveStatuses();
    this.runtime = next;
    previous.dispose();
    this.pushHistory(snapshot);
    this.persist();
  }

  async undo(): Promise<void> {
    const snapshot = this.history.pop();
    if (!snapshot) throw new Error("NOTHING_TO_UNDO");
    const previous = this.runtime;
    Object.assign(this.data, structuredClone(snapshot));
    this.rebuilds += 1;
    const next = new RenovationRuntime(this.data, { role: "baseline", rebuildCount: this.rebuilds });
    await next.ready();
    next.refresh();
    next.deriveStatuses();
    this.runtime = next;
    previous.dispose();
    this.persist();
  }

  private checkpoint(): void { this.pushHistory(structuredClone(this.data)); }
  private pushHistory(snapshot: RenovationData): void {
    this.history.push(snapshot);
    if (this.history.length > 30) this.history.shift();
  }

  simulate(name: string, changes: ScenarioChange[]) { return simulate(this.data, name, changes); }
}
