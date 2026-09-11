import type {
  Contractor,
  NodeStatus,
  Professional,
  ProjectDocument,
  Purchase,
  RenovationData,
  RenovationNode,
  Relationship,
  ScenarioChange,
  TaskAssignment,
} from "../shared/types.js";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { graphResponse, simulate } from "./analysis.js";
import { blockers, RenovationRuntime } from "./graph.js";
import { createDemoData } from "./seed.js";
import {
  findNode,
  nonnegative,
  patchMaterialOption,
  patchNode,
  selectOption,
  validateRelationship,
  type NodePatch,
} from "./commands.js";

export type StoreRuntime = Pick<
  RenovationRuntime,
  | "data"
  | "ready"
  | "refresh"
  | "deriveStatuses"
  | "forecast"
  | "runtimeInfo"
  | "recentEvents"
  | "dispose"
>;
type RuntimeFactory = (
  data: RenovationData,
  metadata: { role: "baseline"; rebuildCount: number },
) => StoreRuntime;

export class RenovationStore {
  private currentData: RenovationData;
  get data(): RenovationData {
    return this.currentData;
  }
  runtime: StoreRuntime;
  private rebuilds = 0;
  private readonly history: RenovationData[] = [];
  private readonly initialData: RenovationData;
  private mutationQueue: Promise<unknown> = Promise.resolve();

  private constructor(
    data: RenovationData,
    runtime: StoreRuntime,
    private readonly dataPath: string,
    initialData: RenovationData,
    private readonly runtimeFactory: RuntimeFactory,
  ) {
    this.currentData = data;
    this.runtime = runtime;
    this.initialData = structuredClone(initialData);
  }

  static async create(
    options: {
      dataPath?: string;
      initialData?: RenovationData;
      runtimeFactory?: RuntimeFactory;
    } = {},
  ): Promise<RenovationStore> {
    const dataPath = path.resolve(
      options.dataPath ?? process.env.RENOGRAPH_DATA ?? "data/renovation.json",
    );
    const defaults = options.initialData ?? createDemoData();
    const data: RenovationData = existsSync(dataPath)
      ? JSON.parse(readFileSync(dataPath, "utf8"))
      : structuredClone(defaults);
    for (const node of data.nodes) {
      const seeded = defaults.nodes.find(
        (candidate) => candidate.id === node.id,
      );
      if (node.type === "MATERIAL" && seeded?.options && !node.options) {
        node.options = structuredClone(seeded.options);
        node.selectedOptionId = seeded.selectedOptionId;
      }
    }
    data.professionals ??= [];
    data.assignments ??= [];
    data.contractors ??= [];
    data.purchases ??= [];
    data.documents ??= [];
    for (const edge of data.relationships) validateRelationship(data, edge);
    mkdirSync(path.dirname(dataPath), { recursive: true });
    const runtimeFactory: RuntimeFactory =
      options.runtimeFactory ??
      ((data, metadata) => new RenovationRuntime(data, metadata));
    const runtime = runtimeFactory(data, { role: "baseline", rebuildCount: 0 });
    try {
      await runtime.ready();
      runtime.refresh();
      runtime.deriveStatuses();
      runtime.forecast();
      const store = new RenovationStore(
        data,
        runtime,
        dataPath,
        defaults,
        runtimeFactory,
      );
      store.persist(data);
      return store;
    } catch (error) {
      runtime.dispose();
      throw error;
    }
  }

  private persist(data: RenovationData): void {
    const temporary = `${this.dataPath}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, {
        flag: "wx",
      });
      renameSync(temporary, this.dataPath);
    } finally {
      rmSync(temporary, { force: true });
    }
  }

  private enqueue<T>(operation: () => T | Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation);
    this.mutationQueue = result.catch(() => undefined);
    return result;
  }

  private mutate<T>(operation: (candidate: RenovationData) => T): Promise<T> {
    return this.enqueue(() => {
      const previous = this.data;
      const candidate = structuredClone(previous);
      const result = operation(candidate);
      try {
        // This section is synchronous: readers cannot observe a partially committed mutation.
        this.runtime.data = candidate;
        this.runtime.refresh();
        this.runtime.deriveStatuses();
        this.runtime.forecast();
        this.persist(candidate);
      } catch (error) {
        this.runtime.data = previous;
        this.runtime.refresh();
        this.runtime.deriveStatuses();
        throw error;
      }
      this.currentData = candidate;
      this.pushHistory(previous);
      return result;
    });
  }

  private async replaceRuntime(
    candidate: RenovationData,
    undo = false,
  ): Promise<void> {
    candidate.professionals ??= [];
    candidate.assignments ??= [];
    candidate.contractors ??= [];
    candidate.purchases ??= [];
    candidate.documents ??= [];
    let next: StoreRuntime | undefined;
    try {
      next = this.runtimeFactory(candidate, {
        role: "baseline",
        rebuildCount: this.rebuilds + 1,
      });
      await next.ready();
      next.refresh();
      next.deriveStatuses();
      next.forecast();
      this.persist(candidate);
    } catch (error) {
      next?.dispose();
      throw error;
    }
    const previous = this.runtime;
    const previousData = this.data;
    this.currentData = candidate;
    this.runtime = next;
    this.rebuilds += 1;
    if (undo) this.history.pop();
    else this.pushHistory(previousData);
    // Commit has succeeded; teardown errors must not turn it into a reported rollback.
    try {
      previous.dispose();
    } catch (error) {
      console.error("Previous Wavebinder runtime cleanup failed", error);
    }
  }

  getGraph() {
    return {
      ...graphResponse(this.data, this.getAnalysis()),
      runtime: {
        ...this.runtime.runtimeInfo(),
        canUndo: this.history.length > 0,
      },
    };
  }
  getSummary() {
    return this.runtime.forecast().summary;
  }
  getAnalysis() {
    return this.runtime.forecast().analysis;
  }
  getReady() {
    return this.data.nodes.filter(
      (node) => node.type === "TASK" && node.status === "READY",
    );
  }
  getBlocked() {
    return this.data.nodes
      .filter((node) => node.type === "TASK" && node.status === "BLOCKED")
      .map((node) => ({ ...node, explanation: blockers(this.data, node.id) }));
  }
  getEvents() {
    return this.runtime.recentEvents();
  }
  getOperations() {
    return {
      professionals: this.data.professionals,
      assignments: this.data.assignments,
      contractors: this.data.contractors,
      purchases: this.data.purchases,
      documents: this.data.documents,
      resourceConflicts: this.getAnalysis().resourceConflicts,
    };
  }
  getNode(nodeId: string) {
    return this.data.nodes.find((node) => node.id === nodeId);
  }

  addProfessional(
    input: Pick<
      Professional,
      "name" | "trade" | "availableFromDay" | "availableToDay"
    >,
  ): Promise<Professional> {
    return this.mutate((data) => {
      if (!input.name?.trim() || !input.trade?.trim())
        throw new Error("INVALID_PROFESSIONAL");
      nonnegative(input.availableFromDay, "INVALID_PROFESSIONAL");
      const professional = {
        ...input,
        name: input.name.trim(),
        trade: input.trade.trim(),
        id: `professional-${randomUUID()}`,
      };
      data.professionals!.push(professional);
      return professional;
    });
  }
  assignProfessional(
    taskId: string,
    professionalId: string,
  ): Promise<TaskAssignment> {
    return this.mutate((data) => {
      if (
        findNode(data, taskId).type !== "TASK" ||
        !data.professionals!.some((item) => item.id === professionalId)
      )
        throw new Error("INVALID_ASSIGNMENT");
      if (
        data.assignments!.some(
          (item) =>
            item.taskId === taskId && item.professionalId === professionalId,
        )
      )
        throw new Error("ASSIGNMENT_EXISTS");
      const assignment = {
        id: `assignment-${randomUUID()}`,
        taskId,
        professionalId,
      };
      data.assignments!.push(assignment);
      return assignment;
    });
  }
  removeAssignment(id: string): Promise<void> {
    return this.mutate((data) => {
      const index = data.assignments!.findIndex((item) => item.id === id);
      if (index < 0) throw new Error("ASSIGNMENT_NOT_FOUND");
      data.assignments!.splice(index, 1);
    });
  }
  addContractor(
    input: Pick<Contractor, "name" | "trade" | "contact">,
  ): Promise<Contractor> {
    return this.mutate((data) => {
      if (!input.name?.trim() || !input.trade?.trim())
        throw new Error("INVALID_CONTRACTOR");
      const item = { ...input, id: `contractor-${randomUUID()}` };
      data.contractors!.push(item);
      return item;
    });
  }
  addPurchase(input: Omit<Purchase, "id">): Promise<Purchase> {
    return this.mutate((data) => {
      if (!input.description?.trim()) throw new Error("INVALID_PURCHASE");
      nonnegative(input.amount, "INVALID_PURCHASE");
      const item = { ...input, id: `purchase-${randomUUID()}` };
      data.purchases!.push(item);
      return item;
    });
  }
  updatePurchase(id: string, status: Purchase["status"]): Promise<Purchase> {
    return this.mutate((data) => {
      const item = data.purchases!.find((candidate) => candidate.id === id);
      if (!item || !["REQUESTED", "ORDERED", "RECEIVED"].includes(status))
        throw new Error("INVALID_PURCHASE");
      item.status = status;
      return item;
    });
  }
  addDocument(input: Omit<ProjectDocument, "id">): Promise<ProjectDocument> {
    return this.mutate((data) => {
      if (
        !input.name?.trim() ||
        !["QUOTE", "CONTRACT", "PERMIT", "INVOICE", "OTHER"].includes(
          input.kind,
        )
      )
        throw new Error("INVALID_DOCUMENT");
      const item = { ...input, id: `document-${randomUUID()}` };
      data.documents!.push(item);
      return item;
    });
  }

  updateNode(nodeId: string, patch: NodePatch): Promise<RenovationNode> {
    return this.mutate((data) => patchNode(data, nodeId, patch));
  }
  updateMaterialOption(
    nodeId: string,
    optionId: string,
    patch: Parameters<typeof patchMaterialOption>[3],
  ): Promise<RenovationNode> {
    return this.mutate((data) =>
      patchMaterialOption(data, nodeId, optionId, patch),
    );
  }
  transition(
    nodeId: string,
    status: NodeStatus,
    actualDurationDays?: number,
  ): Promise<RenovationNode> {
    return this.mutate((data) =>
      patchNode(
        data,
        nodeId,
        {
          status,
          ...(actualDurationDays !== undefined ? { actualDurationDays } : {}),
        },
        true,
      ),
    );
  }
  selectMaterialOption(
    nodeId: string,
    optionId: string,
  ): Promise<RenovationNode> {
    return this.mutate((data) => selectOption(data, nodeId, optionId));
  }

  addRelationship(
    input: Omit<Relationship, "id" | "renovationId">,
  ): Promise<Relationship> {
    return this.enqueue(async () => {
      const candidate = structuredClone(this.data);
      validateRelationship(candidate, input);
      if (
        candidate.relationships.some(
          (edge) =>
            edge.fromNodeId === input.fromNodeId &&
            edge.toNodeId === input.toNodeId &&
            edge.type === input.type,
        )
      )
        throw new Error("RELATIONSHIP_EXISTS");
      const relationship = {
        ...input,
        id: `edge-${randomUUID()}`,
        renovationId: candidate.renovation.id,
      };
      candidate.relationships.push(relationship);
      await this.replaceRuntime(candidate);
      return relationship;
    });
  }

  addNode(input: {
    type: "TASK" | "MATERIAL";
    name: string;
    description?: string;
    roomId?: string;
    durationDays?: number;
    estimatedCost?: number;
    deliveryDays?: number;
  }): Promise<RenovationNode> {
    return this.enqueue(async () => {
      if (
        typeof input.name !== "string" ||
        !input.name.trim() ||
        !["TASK", "MATERIAL"].includes(input.type)
      )
        throw new Error("INVALID_NODE");
      if (input.type === "TASK")
        nonnegative(input.durationDays, "INVALID_DURATION");
      if (input.estimatedCost !== undefined)
        nonnegative(input.estimatedCost, "INVALID_COST");
      if (input.deliveryDays !== undefined)
        nonnegative(input.deliveryDays, "INVALID_DURATION");
      const data = structuredClone(this.data);
      if (input.roomId && findNode(data, input.roomId).type !== "ROOM")
        throw new Error("INVALID_RELATIONSHIP");
      const slug =
        input.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "node";
      let id = slug;
      let suffix = 2;
      while (data.nodes.some((node) => node.id === id))
        id = `${slug}-${suffix++}`;
      const node: RenovationNode = {
        id,
        renovationId: data.renovation.id,
        type: input.type,
        name: input.name.trim(),
        description: input.description,
        status: "PLANNED",
        estimatedCost: input.estimatedCost ?? 0,
        position: {
          x: 80 + (data.nodes.length % 6) * 220,
          y: input.type === "TASK" ? 930 : 1080,
        },
        ...(input.type === "TASK"
          ? { durationDays: input.durationDays }
          : {
              selectedOptionId: "standard",
              options: [
                {
                  id: "standard",
                  label: "Standard",
                  deliveryDays: input.deliveryDays ?? 0,
                  estimatedCost: input.estimatedCost ?? 0,
                  available: false,
                },
              ],
            }),
      };
      data.nodes.push(node);
      if (input.roomId)
        data.relationships.push({
          id: `edge-${randomUUID()}`,
          renovationId: data.renovation.id,
          fromNodeId: node.id,
          toNodeId: input.roomId,
          type: "LOCATED_IN",
        });
      await this.replaceRuntime(data);
      return node;
    });
  }

  removeRelationship(relationshipId: string): Promise<void> {
    return this.enqueue(async () => {
      const candidate = structuredClone(this.data);
      const index = candidate.relationships.findIndex(
        (edge) => edge.id === relationshipId,
      );
      if (index < 0) throw new Error("RELATIONSHIP_NOT_FOUND");
      candidate.relationships.splice(index, 1);
      await this.replaceRuntime(candidate);
    });
  }
  resetDemo(): Promise<void> {
    return this.enqueue(() =>
      this.replaceRuntime(structuredClone(this.initialData)),
    );
  }
  undo(): Promise<void> {
    return this.enqueue(async () => {
      const snapshot = this.history.at(-1);
      if (!snapshot) throw new Error("NOTHING_TO_UNDO");
      await this.replaceRuntime(structuredClone(snapshot), true);
    });
  }
  private pushHistory(snapshot: RenovationData): void {
    this.history.push(structuredClone(snapshot));
    if (this.history.length > 30) this.history.shift();
  }
  simulate(name: string, changes: ScenarioChange[]) {
    return simulate(
      structuredClone(this.data),
      name,
      changes,
      this.runtime.forecast(),
    );
  }
}
