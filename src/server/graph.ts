import { ComplexNode, ListNode, MultiNode, WaveBinder } from "wave-binder";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type {
  ForecastInputs,
  MaterialForecast,
  MaterialOption,
  NodeStatus,
  ProjectForecast,
  RenovationData,
  RenovationNode,
  RoomMaterialRequirement,
  TaskForecast,
} from "../shared/types.js";
import {
  materialAvailable,
  roomMaterialRequirements,
  selectedMaterialOption,
} from "./domain.js";
import { analyze, summary } from "./forecast.js";
export {
  blockers,
  effectiveTaskDuration,
  roomMaterialRequirements,
  schedule,
  topologicalTasks,
  validateNoCycle,
} from "./domain.js";

type ProtoNode = ConstructorParameters<typeof WaveBinder>[1][number];
type CustomFunction = ConstructorParameters<typeof WaveBinder>[3][number];
const name = (id: string, field: string) => `${id}__${field}`;
const dep = (nodeName: string, optional = false): ProtoNode["dep"][number] => ({
  nodeName,
  parameterName: nodeName,
  isOptional: optional,
  onUpdate: true,
  namingResolvingRule: [],
});
const single = (nodeName: string, defaultValue?: unknown): ProtoNode => ({
  name: nodeName,
  path: `/${nodeName}`,
  type: "SINGLE",
  la: { type: "USER_SELECTION" as ProtoNode["la"]["type"] },
  defaultValue,
  dep: [],
});
const fields = (keys: string[]): ProtoNode[] =>
  keys.map((key) => ({ ...single(key), path: `/${key}` }));
const taskFields = [
  "status",
  "plannedDuration",
  "actualDuration",
  "delayDays",
  "effectiveDuration",
  "durationVariance",
  "manuallyBlocked",
  "estimatedCost",
  "actualCost",
];
const materialFields = [
  "materialId",
  "materialName",
  "selectedOptionId",
  "selectedOptionLabel",
  "available",
  "delivered",
  "deliveryDays",
  "estimatedCost",
  "actualCost",
];

type ProjectFacts = Pick<
  RenovationData,
  "renovation" | "professionals" | "assignments"
> & {
  roomCosts: Record<string, { estimatedCost: number; actualCost: number }>;
};

export class RenovationRuntime {
  readonly binder: WaveBinder;
  readonly instanceId: string = randomUUID();
  readonly createdAt = new Date().toISOString();
  readonly role: "baseline" | "scenario";
  readonly rebuildCount: number;
  private readonly subscriptions: Array<{ unsubscribe(): void }> = [];
  private readonly taskStateProjection = new Map<string, TaskForecast>();
  private readonly events: Array<{
    nodeId: string;
    status: string;
    at: string;
  }> = [];
  private initialized = false;
  private disposed = false;

  constructor(
    public data: RenovationData,
    metadata: { role?: "baseline" | "scenario"; rebuildCount?: number } = {},
  ) {
    this.role = metadata.role ?? "baseline";
    this.rebuildCount = metadata.rebuildCount ?? 0;
    const tasks = data.nodes.filter((node) => node.type === "TASK");
    const materials = data.nodes.filter((node) => node.type === "MATERIAL");
    const protoNodes: ProtoNode[] = [
      single("__project_start", 1),
      single("__lists_active", null),
      single("__project_facts", this.projectFacts()),
    ];
    const customFunctions: CustomFunction[] = [];
    const derived = (
      nodeName: string,
      type: string,
      dependencies: ProtoNode["dep"],
      implementation: Function,
      extra: Partial<ProtoNode> = {},
    ) => {
      protoNodes.push({
        name: nodeName,
        path: `/${nodeName}`,
        type,
        dep: dependencies,
        la: {
          type: "CUSTOM_FUNCTION" as ProtoNode["la"]["type"],
          functionName: nodeName,
        },
        ...extra,
      });
      customFunctions.push({ name: nodeName, implementation });
    };
    for (const node of materials) {
      protoNodes.push(
        single(name(node.id, "delivered"), Number(node.status === "COMPLETED")),
      );
      protoNodes.push(
        single(name(node.id, "catalog"), structuredClone(node.options ?? [])),
      );
      protoNodes.push(single(name(node.id, "name"), node.name));
      protoNodes.push(
        single(name(node.id, "estimated_cost"), node.estimatedCost ?? 0),
      );
      protoNodes.push(
        single(name(node.id, "actual_cost"), node.actualCost ?? 0),
      );
      derived(
        name(node.id, "option"),
        "MULTI",
        [dep(name(node.id, "catalog"))],
        (options: MaterialOption[]) => options,
      );
      derived(
        name(node.id, "available"),
        "SINGLE",
        [dep(name(node.id, "option"), true), dep(name(node.id, "delivered"))],
        (option: MaterialOption | undefined, delivered: number) =>
          Number(materialAvailable(option, delivered === 1)),
      );
      derived(
        name(node.id, "material_state"),
        "COMPLEX",
        [
          dep(name(node.id, "option"), true),
          dep(name(node.id, "delivered")),
          dep(name(node.id, "name")),
          dep(name(node.id, "estimated_cost")),
          dep(name(node.id, "actual_cost")),
        ],
        (
          option: MaterialOption | undefined,
          delivered: number,
          materialName: string,
          estimatedCost: number,
          actualCost: number,
        ): MaterialForecast => ({
          materialId: node.id,
          materialName,
          selectedOptionId: option?.id ?? "",
          selectedOptionLabel: option?.label ?? "No option",
          available: materialAvailable(option, delivered === 1),
          delivered: delivered === 1,
          deliveryDays: delivered === 1 ? 0 : (option?.deliveryDays ?? 0),
          estimatedCost: option?.estimatedCost ?? estimatedCost,
          actualCost,
        }),
        { protos: fields(materialFields) },
      );
    }
    for (const task of tasks) {
      const facts: Record<string, unknown> = {
        completed: Number(task.status === "COMPLETED"),
        in_progress: Number(task.status === "IN_PROGRESS"),
        planned_duration: task.durationDays ?? 0,
        actual_duration: task.actualDurationDays ?? null,
        delay_days: task.delayDays ?? 0,
        manual_clear: task.manualBlocker ? 0 : 1,
        estimated_cost: task.estimatedCost ?? 0,
        actual_cost: task.actualCost ?? 0,
      };
      for (const [field, value] of Object.entries(facts))
        protoNodes.push(single(name(task.id, field), value));
      const prerequisites = data.relationships.filter(
        (edge) => edge.fromNodeId === task.id && edge.type !== "LOCATED_IN",
      );
      const dependencies = prerequisites.map((edge) =>
        dep(
          name(
            edge.toNodeId,
            edge.type === "REQUIRES_MATERIAL" ? "available" : "completed",
          ),
        ),
      );
      derived(
        name(task.id, "ready"),
        "SINGLE",
        [...dependencies, dep(name(task.id, "manual_clear"))],
        (...values: number[]) => Number(values.every((value) => value === 1)),
      );
      derived(
        name(task.id, "state"),
        "COMPLEX",
        [
          "completed",
          "in_progress",
          "ready",
          "planned_duration",
          "actual_duration",
          "delay_days",
          "manual_clear",
          "estimated_cost",
          "actual_cost",
        ].map((field) =>
          dep(name(task.id, field), field === "actual_duration"),
        ),
        (
          completed: number,
          inProgress: number,
          ready: number,
          plannedDuration: number,
          actualDuration: number | null,
          delayDays: number,
          manualClear: number,
          estimatedCost: number,
          actualCost: number,
        ): TaskForecast => ({
          status:
            completed === 1
              ? "COMPLETED"
              : inProgress === 1
                ? "IN_PROGRESS"
                : ready === 1
                  ? "READY"
                  : "BLOCKED",
          plannedDuration,
          actualDuration: actualDuration ?? null,
          delayDays,
          effectiveDuration:
            (completed === 1 && actualDuration != null
              ? actualDuration
              : plannedDuration) + delayDays,
          durationVariance:
            actualDuration == null
              ? delayDays
              : actualDuration - plannedDuration + delayDays,
          manuallyBlocked: manualClear === 0,
          estimatedCost,
          actualCost,
        }),
        { protos: fields(taskFields) },
      );
    }
    for (const room of data.nodes.filter((node) => node.type === "ROOM")) {
      const requirements = roomMaterialRequirements(data, room.id);
      derived(
        name(room.id, "materials"),
        "LIST",
        [
          dep("__lists_active"),
          ...(requirements.length
            ? requirements.map((item) =>
                dep(name(item.materialId, "material_state")),
              )
            : [dep("__project_start")]),
        ],
        (
          _active: number,
          ...values: MaterialForecast[]
        ): RoomMaterialRequirement[] =>
          requirements.map((requirement, index) => ({
            ...values[index],
            requiredByTaskIds: requirement.requiredByTaskIds,
          })),
        {
          proto: {
            name: name(room.id, "material"),
            path: "/material",
            type: "COMPLEX",
            la: { type: "USER_SELECTION" as ProtoNode["la"]["type"] },
            dep: [],
            protos: fields([...materialFields, "requiredByTaskIds"]),
          },
        },
      );
    }
    // Only topology is captured. Every mutable forecast input is a dependency.
    const topology = structuredClone(data);
    derived(
      "__project_forecast",
      "SINGLE",
      [
        dep("__project_facts"),
        ...tasks.map((task) => dep(name(task.id, "state"))),
        ...materials.map((material) =>
          dep(name(material.id, "material_state")),
        ),
      ],
      (
        project: ProjectFacts,
        ...values: Array<TaskForecast | MaterialForecast>
      ): ProjectForecast => {
        const inputs: ForecastInputs = {
          tasks: Object.fromEntries(
            tasks.map((task, index) => [
              task.id,
              values[index] as TaskForecast,
            ]),
          ),
          materials: Object.fromEntries(
            materials.map((material, index) => [
              material.id,
              values[tasks.length + index] as MaterialForecast,
            ]),
          ),
        };
        const forecastData = {
          ...topology,
          ...project,
          nodes: topology.nodes.map((node) =>
            node.type === "ROOM"
              ? { ...node, ...project.roomCosts[node.id] }
              : node,
          ),
        };
        const analysis = analyze(forecastData, inputs);
        return { analysis, summary: summary(forecastData, analysis, inputs) };
      },
    );
    const raw = process.env.WAVEBINDER_LICENSE;
    if (!raw)
      throw new Error("WAVEBINDER_LICENSE is required to start Renograph");
    this.binder = new WaveBinder(
      JSON.parse(raw),
      protoNodes,
      new Map(),
      customFunctions,
    );
    this.binder.tangleNodes();
  }

  private projectFacts(): ProjectFacts {
    return structuredClone({
      renovation: this.data.renovation,
      professionals: this.data.professionals ?? [],
      assignments: this.data.assignments ?? [],
      roomCosts: Object.fromEntries(
        this.data.nodes
          .filter((node) => node.type === "ROOM")
          .map((node) => [
            node.id,
            {
              estimatedCost: node.estimatedCost ?? 0,
              actualCost: node.actualCost ?? 0,
            },
          ]),
      ),
    });
  }

  async ready(): Promise<void> {
    await this.binder.waitUntilReady();
    if (this.disposed || !this.binder.isReady())
      throw new Error("Wavebinder runtime is not ready");
    if (this.initialized) return;
    this.initialized = true;
    this.refresh();
    // Wavebinder registers LIST children in its node array. Materialize them only
    // after tangleNodes finishes traversing that array, so no roots are skipped.
    this.write("__lists_active", 1);
    for (const task of this.data.nodes.filter((node) => node.type === "TASK")) {
      this.subscriptions.push(
        this.binder
          .getNodeByName(name(task.id, "state"))
          .subscribe((value: TaskForecast) => {
            if (!value?.status) return;
            const previous = this.taskStateProjection.get(task.id);
            if (isDeepStrictEqual(previous, value)) return;
            this.taskStateProjection.set(task.id, structuredClone(value));
            this.record(task.id, value.status);
          }),
      );
    }
  }

  private record(nodeId: string, status: string): void {
    this.events.push({ nodeId, status, at: new Date().toISOString() });
    if (this.events.length > 100) this.events.shift();
  }

  private write(nodeName: string, value: unknown): boolean {
    const node = this.binder.getNodeByName(nodeName);
    if (isDeepStrictEqual(node.getNodeValue(), value)) return false;
    node.next(structuredClone(value));
    return true;
  }

  setFact(nodeId: string, status: NodeStatus): void {
    const node = this.data.nodes.find((candidate) => candidate.id === nodeId);
    if (!node || node.type === "ROOM") return;
    if (node.type === "MATERIAL") {
      this.write(name(nodeId, "delivered"), Number(status === "COMPLETED"));
      this.write(name(nodeId, "name"), node.name);
      this.write(name(nodeId, "estimated_cost"), node.estimatedCost ?? 0);
      this.write(name(nodeId, "actual_cost"), node.actualCost ?? 0);
      const catalogChanged = this.write(
        name(nodeId, "catalog"),
        node.options ?? [],
      );
      const option = selectedMaterialOption(node);
      const optionNode = this.binder.getNodeByName(
        name(nodeId, "option"),
      ) as MultiNode;
      if (
        option &&
        (catalogChanged ||
          !isDeepStrictEqual(optionNode.getNodeValue(), option))
      )
        optionNode.setSelection(node.options!.indexOf(option));
      return;
    }
    const facts: Record<string, unknown> = {
      planned_duration: node.durationDays ?? 0,
      actual_duration: node.actualDurationDays ?? null,
      delay_days: node.delayDays ?? 0,
      manual_clear: node.manualBlocker ? 0 : 1,
      estimated_cost: node.estimatedCost ?? 0,
      actual_cost: node.actualCost ?? 0,
      in_progress: Number(status === "IN_PROGRESS"),
      completed: Number(status === "COMPLETED"),
    };
    for (const [field, value] of Object.entries(facts))
      this.write(name(nodeId, field), value);
  }

  refresh(): void {
    for (const node of this.data.nodes) this.setFact(node.id, node.status);
    this.write("__project_facts", this.projectFacts());
  }

  selectMaterialOption(nodeId: string, optionId: string): RenovationNode {
    const material = this.data.nodes.find(
      (node) => node.id === nodeId && node.type === "MATERIAL",
    );
    const option = material?.options?.find((option) => option.id === optionId);
    if (!material || !option) throw new Error("MATERIAL_OPTION_NOT_FOUND");
    const changed = material.selectedOptionId !== optionId;
    material.selectedOptionId = optionId;
    material.estimatedCost = option.estimatedCost;
    this.setFact(nodeId, material.status);
    if (changed) this.record(nodeId, `OPTION:${optionId}`);
    return material;
  }

  taskState(nodeId: string): TaskForecast {
    return (
      this.binder.getNodeByName(name(nodeId, "state")) as ComplexNode
    ).getNodeValue() as TaskForecast;
  }
  isReady(nodeId: string): boolean {
    return this.taskState(nodeId).status === "READY";
  }
  forecast(): ProjectForecast {
    if (!this.binder.isReady())
      throw new Error("Wavebinder runtime is not ready");
    const forecast = this.binder
      .getNodeByName("__project_forecast")
      .getNodeValue() as ProjectForecast;
    if (!forecast?.analysis || !forecast.summary)
      throw new Error("WAVEBINDER_FORECAST_NOT_READY");
    return structuredClone(forecast);
  }
  deriveStatuses(): void {
    for (const node of this.data.nodes.filter((node) => node.type === "TASK"))
      node.status = this.taskState(node.id).status;
  }
  runtimeInfo() {
    const nodes = this.binder.getNodes();
    return {
      ready: this.binder.isReady(),
      nodeCount: nodes.length,
      dependencyCount: nodes.reduce(
        (total, node) => total + node.node.dep.length,
        0,
      ),
      derivedNodeCount: nodes.filter(
        (node) => node.node.la.type === "CUSTOM_FUNCTION",
      ).length,
      complexNodeCount: nodes.filter((node) => node instanceof ComplexNode)
        .length,
      multiNodeCount: nodes.filter((node) => node instanceof MultiNode).length,
      listNodeCount: nodes.filter((node) => node instanceof ListNode).length,
      subscriptionCount: this.subscriptions.length,
      instanceId: this.instanceId,
      role: this.role,
      createdAt: this.createdAt,
      rebuildCount: this.rebuildCount,
      eventCount: this.events.length,
      lastEvent: this.events.at(-1)
        ? `${this.events.at(-1)!.nodeId}:${this.events.at(-1)!.status}`
        : undefined,
      dataPool: structuredClone(this.binder.getDataPool()) as Record<
        string,
        unknown
      >,
    };
  }
  recentEvents() {
    return this.events.slice(-12).reverse();
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.subscriptions
      .splice(0)
      .forEach((subscription) => subscription.unsubscribe());
    this.taskStateProjection.clear();
    this.binder.nukeNodes();
  }
}
