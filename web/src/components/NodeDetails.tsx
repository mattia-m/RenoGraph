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
function graphNodeName(id: string, nodes: GraphNode[]): string {
  return nodes.find((node) => node.id === id)?.name ?? id;
}

export function NodeDetails({
  node,
  allNodes,
  dependencies,
  dependents,
  onAction,
  onScenario,
  onEdit,
  busy,
}: {
  node: GraphNode;
  allNodes: GraphNode[];
  dependencies: GraphNode[];
  dependents: GraphNode[];
  onAction: (action: "start" | "complete" | "block") => void;
  onScenario: () => void;
  onEdit: () => void;
  busy: boolean;
}) {
  const meta = statusMeta[node.status];
  const planned = node.durationDays ?? 0;
  const actual = node.actualDurationDays;
  const delay = node.delayDays ?? 0;
  const effective =
    (node.status === "COMPLETED" && actual !== undefined ? actual : planned) +
    delay;
  const variance = actual === undefined ? delay : actual - planned + delay;
  return (
    <div className="details-content">
      <div className="details-top">
        <span className={`type-pill ${node.type.toLowerCase()}`}>
          {node.type}
        </span>
        <span className={`status-pill ${node.status.toLowerCase()}`}>
          {meta.icon} {meta.label}
        </span>
      </div>
      <h2>{node.name}</h2>
      <p className="description">{node.description}</p>
      {node.type === "TASK" ? (
        <div className="duration-breakdown">
          <div>
            <span className="eyebrow">PLANNED</span>
            <strong>{planned} days</strong>
          </div>
          <div>
            <span className="eyebrow">ACTUAL</span>
            <strong>{actual === undefined ? "—" : `${actual} days`}</strong>
          </div>
          <div>
            <span className="eyebrow">VARIANCE</span>
            <strong
              className={variance > 0 ? "overrun" : variance < 0 ? "ahead" : ""}
            >
              {variance > 0 ? "+" : ""}
              {variance} days
            </strong>
          </div>
          <div>
            <span className="eyebrow">EFFECTIVE</span>
            <strong>{effective} days</strong>
          </div>
        </div>
      ) : (
        <div className="detail-stats">
          <div>
            <span className="eyebrow">DELIVERY</span>
            <strong>{selectedDeliveryDays(node)} days</strong>
          </div>
          <div>
            <span className="eyebrow">EST. COST</span>
            <strong>
              {node.estimatedCost ? money.format(node.estimatedCost) : "--"}
            </strong>
          </div>
        </div>
      )}
      {node.type === "TASK" && (
        <div className="cost-line">
          <span className="eyebrow">EST. COST</span>
          <strong>
            {node.estimatedCost ? money.format(node.estimatedCost) : "--"}
          </strong>
          {delay > 0 && <small>Includes +{delay}d direct delay</small>}
        </div>
      )}
      {node.critical && (
        <div className="critical-callout">
          <span>◆</span>
          <div>
            <strong>Critical activity</strong>
            <p>
              Any delay beyond available slack can move the projected
              completion.
            </p>
          </div>
        </div>
      )}
      {node.manualBlocker && (
        <div className="blocker-callout">
          <span>!</span>
          <div>
            <strong>Manual blocker</strong>
            <p>{node.manualBlocker}</p>
          </div>
        </div>
      )}
      {node.status === "BLOCKED" && !node.manualBlocker && (
        <div className="blocker-callout">
          <span>!</span>
          <div>
            <strong>
              Waiting on {node.blockedBy?.length ?? 0} direct dependencies
            </strong>
            <p>
              Root blockers:{" "}
              {node.rootBlockers
                ?.map((id) => graphNodeName(id, allNodes))
                .join(", ") || "none"}
            </p>
          </div>
        </div>
      )}
      <div className="detail-section">
        <span className="eyebrow">
          DEPENDS ON <b>{dependencies.length}</b>
        </span>
        {dependencies.length ? (
          dependencies.map((item) => (
            <div className="linked-row" key={item.id}>
              <span className={`mini-dot ${item.status.toLowerCase()}`} />
              {item.name}
              <span className="link-status">
                {statusMeta[item.status].icon}
              </span>
            </div>
          ))
        ) : (
          <p className="muted">No upstream dependencies</p>
        )}
      </div>
      <div className="detail-section">
        <span className="eyebrow">
          UNLOCKS <b>{dependents.length}</b>
        </span>
        {dependents.slice(0, 4).map((item) => (
          <div className="linked-row" key={item.id}>
            <span className={`mini-dot ${item.status.toLowerCase()}`} />
            {item.name}
          </div>
        ))}
      </div>
      <div className="detail-actions">
        <button className="edit-button" onClick={onEdit} disabled={busy}>
          Edit node & dependencies
        </button>
        {node.type === "MATERIAL" && node.status !== "COMPLETED" && (
          <button onClick={() => onAction("complete")} disabled={busy}>
            Mark delivered
          </button>
        )}
        {node.type === "TASK" && node.status === "READY" && (
          <button onClick={() => onAction("start")} disabled={busy}>
            Start work
          </button>
        )}
        {node.type === "TASK" && node.status === "IN_PROGRESS" && (
          <button onClick={() => onAction("complete")} disabled={busy}>
            Mark complete
          </button>
        )}
        {node.type === "TASK" &&
          (node.status === "READY" || node.status === "IN_PROGRESS") && (
            <button
              className="quiet-danger"
              onClick={() => onAction("block")}
              disabled={busy}
            >
              Block
            </button>
          )}
        {(node.type === "TASK" || node.type === "MATERIAL") && (
          <button className="scenario-button" onClick={onScenario}>
            Simulate change <span>↗</span>
          </button>
        )}
      </div>
    </div>
  );
}
