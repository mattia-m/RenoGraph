import { useEffect, useState } from "react";
import type {
  GraphNode,
  NodeStatus,
  Relationship,
} from "../../../src/shared/types.js";
function graphNodeName(id: string, nodes: GraphNode[]): string {
  return nodes.find((node) => node.id === id)?.name ?? id;
}
function isTaskNode(node: GraphNode): boolean {
  return node.type === "TASK";
}

export function EditPanel({
  node,
  allNodes,
  dependencyEdges,
  busy,
  onClose,
  onSaveNode,
  onSaveOption,
  onSelectOption,
  onAddDependency,
  onRemoveDependency,
}: {
  node: GraphNode;
  allNodes: GraphNode[];
  dependencyEdges: Array<Relationship & { source: string; target: string }>;
  busy: boolean;
  onClose: () => void;
  onSaveNode: (id: string, patch: Record<string, unknown>) => Promise<void>;
  onSaveOption: (
    id: string,
    optionId: string,
    patch: Record<string, unknown>,
  ) => Promise<void>;
  onSelectOption: (optionId: string) => void;
  onAddDependency: (
    from: string,
    to: string,
    type: "DEPENDS_ON" | "REQUIRES_MATERIAL",
  ) => Promise<void>;
  onRemoveDependency: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState(node.name);
  const [description, setDescription] = useState(node.description ?? "");
  const [duration, setDuration] = useState(node.durationDays ?? 0);
  const [cost, setCost] = useState(node.estimatedCost ?? 0);
  const [status, setStatus] = useState<NodeStatus>(node.status);
  const [manualBlocker, setManualBlocker] = useState(node.manualBlocker ?? "");
  const [manualDelay, setManualDelay] = useState(node.delayDays ?? 0);
  const [target, setTarget] = useState("");
  const selectedOption =
    node.options?.find((option) => option.id === node.selectedOptionId) ??
    node.options?.[0];
  const [delivery, setDelivery] = useState(selectedOption?.deliveryDays ?? 0);
  const [available, setAvailable] = useState(
    selectedOption?.available ?? false,
  );
  useEffect(() => {
    setDelivery(selectedOption?.deliveryDays ?? 0);
    setCost(selectedOption?.estimatedCost ?? node.estimatedCost ?? 0);
    setAvailable(selectedOption?.available ?? false);
  }, [node.selectedOptionId]);
  const existingTargets = new Set(dependencyEdges.map((edge) => edge.target));
  const candidates =
    node.type === "TASK"
      ? allNodes.filter(
          (candidate) =>
            candidate.id !== node.id &&
            candidate.type !== "ROOM" &&
            !existingTargets.has(candidate.id),
        )
      : [];
  const save = async () => {
    await onSaveNode(node.id, {
      name,
      description,
      status,
      ...(node.type === "TASK"
        ? {
            durationDays: duration,
            estimatedCost: cost,
            delayDays: manualDelay,
            manualBlocker,
          }
        : {}),
    });
    if (node.type === "MATERIAL" && selectedOption)
      await onSaveOption(node.id, selectedOption.id, {
        deliveryDays: delivery,
        estimatedCost: cost,
        available,
      });
  };
  const add = async () => {
    const selected = allNodes.find((candidate) => candidate.id === target);
    if (!selected) return;
    await onAddDependency(
      node.id,
      selected.id,
      selected.type === "MATERIAL" ? "REQUIRES_MATERIAL" : "DEPENDS_ON",
    );
    setTarget("");
  };
  if (isTaskNode(node))
    return (
      <div className="edit-panel">
        <div className="edit-heading">
          <div>
            <span className="eyebrow">LIVE EDIT MODE</span>
            <h2>{node.name}</h2>
          </div>
          <button onClick={onClose} aria-label="Close edit mode">
            ×
          </button>
        </div>
        <p className="edit-note">
          <span className="live-dot" />
          Every save propagates through Wavebinder and recalculates the
          forecast.
        </p>
        <label>
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Description
          <textarea
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        {node.status === "COMPLETED" ? (
          <div className="measured-summary">
            <span>Measured duration</span>
            <strong>
              {node.actualDurationDays ?? node.durationDays ?? 0} days
            </strong>
            <small>
              {(node.actualDurationDays ?? node.durationDays ?? 0) -
                (node.durationDays ?? 0) >=
              0
                ? "+"
                : ""}
              {(node.actualDurationDays ?? node.durationDays ?? 0) -
                (node.durationDays ?? 0)}
              d against plan
            </small>
          </div>
        ) : (
          <label>
            Status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as NodeStatus)}
            >
              {(
                ["PLANNED", "READY", "IN_PROGRESS", "BLOCKED"] as NodeStatus[]
              ).map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <small>
              Use “Complete work” outside Edit mode so actual duration is always
              captured.
            </small>
          </label>
        )}
        <div className="edit-grid">
          <label>
            Planned days
            <input
              type="number"
              min="0"
              value={duration}
              onChange={(event) => setDuration(Number(event.target.value))}
            />
          </label>
          <label>
            Estimated cost
            <input
              type="number"
              min="0"
              value={cost}
              onChange={(event) => setCost(Number(event.target.value))}
            />
          </label>
        </div>
        <div className="constraint-editor">
          <span className="eyebrow">LIVE CONSTRAINT</span>
          <label>
            Manual delay (days)
            <input
              type="number"
              min="0"
              value={manualDelay}
              onChange={(event) => setManualDelay(Number(event.target.value))}
            />
          </label>
          <label>
            Blocker reason
            <input
              placeholder="Clear to remove blocker"
              value={manualBlocker}
              onChange={(event) => setManualBlocker(event.target.value)}
            />
          </label>
        </div>
        <button
          className="primary-action"
          onClick={() => void save()}
          disabled={busy || !name.trim()}
        >
          Save and propagate
        </button>
        <div className="dependency-editor">
          <span className="eyebrow">DEPENDENCY INPUTS</span>
          {dependencyEdges.map((edge) => (
            <div className="dependency-edit-row" key={edge.id}>
              <span>
                {graphNodeName(edge.target, allNodes)}
                <small>{edge.type.replaceAll("_", " ")}</small>
              </span>
              <button
                onClick={() => void onRemoveDependency(edge.id)}
                disabled={busy}
              >
                Remove
              </button>
            </div>
          ))}
          <div className="dependency-add">
            <select
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            >
              <option value="">Choose task or material…</option>
              {candidates.map((candidate) => (
                <option value={candidate.id} key={candidate.id}>
                  {candidate.name} · {candidate.type.toLowerCase()}
                </option>
              ))}
            </select>
            <button onClick={() => void add()} disabled={busy || !target}>
              Add
            </button>
          </div>
        </div>
      </div>
    );
  return (
    <div className="edit-panel">
      <div className="edit-heading">
        <div>
          <span className="eyebrow">LIVE EDIT MODE</span>
          <h2>{node.name}</h2>
        </div>
        <button onClick={onClose} aria-label="Close edit mode">
          ×
        </button>
      </div>
      <p className="edit-note">
        <span className="live-dot" />
        Saving updates the Wavebinder graph immediately.
      </p>
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        Description
        <textarea
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      {node.type === "MATERIAL" && (
        <label>
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as NodeStatus)}
          >
            {(["PLANNED", "READY", "COMPLETED", "BLOCKED"] as NodeStatus[]).map(
              (value) => (
                <option key={value}>{value}</option>
              ),
            )}
          </select>
        </label>
      )}
      {node.type === "MATERIAL" && selectedOption && (
        <div className="option-editor">
          <span className="eyebrow">SELECTED MATERIAL OPTION</span>
          <label>
            Option
            <select
              value={node.selectedOptionId}
              onChange={(event) => onSelectOption(event.target.value)}
            >
              {node.options?.map((option) => (
                <option value={option.id} key={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="edit-grid">
            <label>
              Delivery days
              <input
                type="number"
                min="0"
                value={delivery}
                onChange={(event) => setDelivery(Number(event.target.value))}
              />
            </label>
            <label>
              Price
              <input
                type="number"
                min="0"
                value={cost}
                onChange={(event) => setCost(Number(event.target.value))}
              />
            </label>
          </div>
          <label className="check-field">
            <input
              type="checkbox"
              checked={available}
              onChange={(event) => setAvailable(event.target.checked)}
            />
            Available now
          </label>
        </div>
      )}
      <button
        className="primary-action"
        onClick={() => void save()}
        disabled={busy || !name.trim()}
      >
        Save and propagate
      </button>
    </div>
  );
}
