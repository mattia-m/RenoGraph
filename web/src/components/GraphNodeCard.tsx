import { Handle, Position } from "@xyflow/react";
import type { Node, NodeProps } from "@xyflow/react";
import type { GraphNode, NodeStatus } from "../../../src/shared/types.js";

const money = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const statusMeta: Record<NodeStatus, { icon: string; label: string }> = {
  COMPLETED: { icon: "✓", label: "Completed" },
  READY: { icon: "→", label: "Ready" },
  IN_PROGRESS: { icon: "◉", label: "In progress" },
  BLOCKED: { icon: "!", label: "Blocked" },
  PLANNED: { icon: "○", label: "Planned" },
};
type GraphNodeData = Record<string, unknown> &
  GraphNode & { onSelect?: (node: GraphNode) => void; scenarioDelta?: number };
export type FlowNode = Node<GraphNodeData>;

function RenovationNodeCard({ data }: NodeProps<FlowNode>) {
  const meta = statusMeta[data.status];
  return (
    <>
      <Handle type="target" position={Position.Top} className="handle" />
      <button
        className={`graph-card ${data.type.toLowerCase()} ${data.status.toLowerCase()} ${data.critical ? "critical" : ""}`}
        onClick={() => data.onSelect?.(data)}
      >
        <span className="card-kicker">
          <span className="status-icon">{meta.icon}</span>
          {data.type}
        </span>
        <strong>{data.name}</strong>
        <span className="card-meta">
          {data.type === "TASK" && data.actualDurationDays !== undefined
            ? `${data.actualDurationDays}d actual / ${data.durationDays ?? 0}d plan`
            : data.durationDays
              ? `${data.durationDays} days`
              : data.type === "MATERIAL"
                ? `${selectedDeliveryDays(data)}d delivery`
                : "space"}
          {data.delayDays ? ` + ${data.delayDays}d delay` : ""}
          {data.estimatedCost ? ` · ${money.format(data.estimatedCost)}` : ""}
        </span>
        {data.critical && <span className="critical-badge">CRITICAL</span>}
        {data.scenarioDelta !== undefined && data.scenarioDelta !== 0 && (
          <span className="delta-badge">+{data.scenarioDelta}d</span>
        )}
      </button>
      <Handle type="source" position={Position.Bottom} className="handle" />
    </>
  );
}

export const nodeTypes = { renovation: RenovationNodeCard };
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
