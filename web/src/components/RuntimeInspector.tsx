import { runtimeName } from "../../../src/shared/runtime.js";
import type {
  GraphNode,
  GraphResponse,
  RoomMaterialRequirement,
} from "../../../src/shared/types.js";
const money = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export function RuntimeInspector({
  node,
  graph,
}: {
  node: GraphNode;
  graph?: GraphResponse;
}) {
  const pool = graph?.runtime?.dataPool ?? {};
  const ownKeys =
    node.type === "TASK"
      ? [
          runtimeName(node.id, "completed"),
          runtimeName(node.id, "in_progress"),
          runtimeName(node.id, "planned_duration"),
          runtimeName(node.id, "actual_duration"),
          runtimeName(node.id, "delay_days"),
          runtimeName(node.id, "manual_clear"),
          runtimeName(node.id, "ready"),
          runtimeName(node.id, "state"),
        ]
      : node.type === "MATERIAL"
        ? [
            runtimeName(node.id, "delivered"),
            runtimeName(node.id, "option"),
            runtimeName(node.id, "available"),
          ]
        : [runtimeName(node.id, "materials")];
  const inputs = (graph?.edges ?? [])
    .filter((edge) => edge.source === node.id && edge.type !== "LOCATED_IN")
    .map((edge) => {
      const upstream = graph?.nodes.find(
        (candidate) => candidate.id === edge.target,
      );
      const key =
        upstream?.type === "MATERIAL"
          ? runtimeName(edge.target, "available")
          : runtimeName(edge.target, "completed");
      return {
        id: edge.id,
        label: upstream?.name ?? edge.target,
        value: pool[key],
      };
    });
  const roomBundle =
    node.type === "ROOM" &&
    Array.isArray(pool[runtimeName(node.id, "materials")])
      ? (pool[runtimeName(node.id, "materials")] as RoomMaterialRequirement[])
      : [];
  return (
    <details className="runtime-inspector" open>
      <summary>
        <span>
          <span className="live-dot" />
          {graph?.runtime?.snapshot
            ? "WAVEBINDER SCENARIO SNAPSHOT"
            : "WAVEBINDER LIVE STATE"}
        </span>
        <small>{ownKeys.length + inputs.length} signals</small>
      </summary>
      {inputs.length > 0 && (
        <div className="runtime-group">
          <span className="eyebrow">REACTIVE INPUTS</span>
          {inputs.map((input) => (
            <div className="runtime-row" key={input.id}>
              <span>{input.label}</span>
              <code>{formatRuntimeValue(input.value)}</code>
            </div>
          ))}
        </div>
      )}
      <div className="runtime-group">
        <span className="eyebrow">DATA POOL</span>
        {ownKeys.map((key) => (
          <div className="runtime-row" key={key}>
            <span>{key.replace(`${node.id}__`, "")}</span>
            <code>{formatRuntimeValue(pool[key])}</code>
          </div>
        ))}
      </div>
      {roomBundle.length > 0 && (
        <div className="runtime-group">
          <span className="eyebrow">ROOM MATERIAL LIST</span>
          {roomBundle.map((item) => (
            <div className="bundle-row" key={item.materialId}>
              <strong>{item.materialName}</strong>
              <span>
                {item.selectedOptionLabel} · {item.deliveryDays}d
              </span>
              <small>
                {item.delivered
                  ? "DELIVERED"
                  : item.available
                    ? "AVAILABLE"
                    : "ORDERED"}{" "}
                · {money.format(item.estimatedCost)}
              </small>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}

function selectedDeliveryDays(
  node: Pick<GraphNode, "options" | "selectedOptionId" | "status">,
): number {
  if (node.status === "COMPLETED") return 0;
  return (
    node.options?.find((option) => option.id === node.selectedOptionId)
      ?.deliveryDays ??
    node.options?.[0]?.deliveryDays ??
    0
  );
}

function formatRuntimeValue(value: unknown): string {
  if (value === undefined) return "pending";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function graphNodeName(id: string, nodes: GraphNode[]): string {
  return nodes.find((node) => node.id === id)?.name ?? id;
}
function isTaskNode(node: GraphNode): boolean {
  return node.type === "TASK";
}
