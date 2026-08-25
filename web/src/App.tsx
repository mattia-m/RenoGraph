import { useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
} from "@xyflow/react";
import type { Edge, Node, NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type {
  GraphNode,
  GraphResponse,
  MaterialOption,
  NodeStatus,
  ProjectListItem,
  Relationship,
  RenovationData,
  RoomMaterialRequirement,
  ScenarioResult,
  Summary,
} from "../../src/shared/types.js";
import {
  NewProjectModal,
  OperationsModal,
  type OperationsData,
} from "./OperationsModals.js";

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
type FlowNode = Node<GraphNodeData>;
type RuntimeEvent = { nodeId: string; status: string; at: string };

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

const nodeTypes = { renovation: RenovationNodeCard };

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok)
    throw new Error((await response.json()).message ?? "Request failed");
  if (response.status === 204) return undefined as T;
  return response.json();
}

export function App() {
  const [renovationId, setRenovationId] = useState(
    () => sessionStorage.getItem("renograph-project") ?? "casa-rossi",
  );
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [renovation, setRenovation] = useState<RenovationData["renovation"]>();
  const [operations, setOperations] = useState<OperationsData>();
  const [operationsOpen, setOperationsOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [graph, setGraph] = useState<GraphResponse>();
  const [summary, setSummary] = useState<Summary>();
  const [selected, setSelected] = useState<GraphNode>();
  const [showCritical, setShowCritical] = useState(false);
  const [filter, setFilter] = useState<"ALL" | NodeStatus>("ALL");
  const [scenario, setScenario] = useState<ScenarioResult>();
  const [scenarioView, setScenarioView] = useState<"BASELINE" | "SCENARIO">(
    "BASELINE",
  );
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [delay, setDelay] = useState(14);
  const [costDelta, setCostDelta] = useState(350);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [events, setEvents] = useState<RuntimeEvent[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [actualDuration, setActualDuration] = useState(1);

  const load = async () => {
    try {
      const [
        nextGraph,
        nextSummary,
        runtime,
        projectList,
        projectData,
        nextOperations,
      ] = await Promise.all([
        api<GraphResponse>(`/renovations/${renovationId}/graph`),
        api<Summary>(`/renovations/${renovationId}/summary`),
        api<{ events: RuntimeEvent[] }>(
          `/renovations/${renovationId}/runtime/events`,
        ),
        api<ProjectListItem[]>("/renovations"),
        api<RenovationData>(`/renovations/${renovationId}`),
        api<OperationsData>(`/renovations/${renovationId}/operations`),
      ]);
      setGraph(nextGraph);
      setSummary(nextSummary);
      setEvents(runtime.events);
      setProjects(projectList);
      setRenovation(projectData.renovation);
      setOperations(nextOperations);
      setSelected((current) =>
        current
          ? nextGraph.nodes.find((node) => node.id === current.id)
          : undefined,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to load Renograph",
      );
    }
  };
  useEffect(() => {
    setGraph(undefined);
    setSelected(undefined);
    setScenario(undefined);
    void load();
  }, [renovationId]);
  const switchProject = (id: string) => {
    sessionStorage.setItem("renograph-project", id);
    setRenovationId(id);
  };
  const createProject = async (input: {
    name: string;
    startDate: string;
    budget?: number;
  }) => {
    setBusy(true);
    try {
      const created = await api<RenovationData>("/renovations", {
        method: "POST",
        body: JSON.stringify(input),
      });
      setProjectOpen(false);
      switchProject(created.renovation.id);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to create project",
      );
    } finally {
      setBusy(false);
    }
  };

  const displayedGraph =
    scenario && scenarioView === "SCENARIO" ? scenario.graph : graph;
  const selectedNode = selected
    ? displayedGraph?.nodes.find((node) => node.id === selected.id)
    : undefined;
  const flowNodes = useMemo<FlowNode[]>(
    () =>
      (displayedGraph?.nodes ?? [])
        .filter((node) => filter === "ALL" || node.status === filter)
        .map((node) => ({
          id: node.id,
          type: "renovation",
          position: node.position ?? { x: 0, y: 0 },
          data: {
            ...node,
            onSelect: setSelected,
            scenarioDelta:
              scenarioView === "BASELINE"
                ? scenario?.affectedNodes.find(
                    (affected) => affected.id === node.id,
                  )?.scheduleDeltaDays
                : undefined,
          },
        })),
    [displayedGraph, filter, scenario, scenarioView],
  );
  const visibleIds = new Set(flowNodes.map((node) => node.id));
  const flowEdges = useMemo<Edge[]>(
    () =>
      (displayedGraph?.edges ?? [])
        .filter(
          (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
        )
        .map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: "smoothstep",
          animated: showCritical && edge.critical,
          className:
            showCritical && edge.critical ? "critical-edge" : "normal-edge",
        })),
    [displayedGraph, showCritical, filter],
  );

  const dependencies = selectedNode
    ? (displayedGraph?.edges.filter(
        (edge) => edge.source === selectedNode.id && edge.type !== "LOCATED_IN",
      ) ?? [])
    : [];
  const dependents = selectedNode
    ? (displayedGraph?.edges.filter(
        (edge) => edge.target === selectedNode.id && edge.type !== "LOCATED_IN",
      ) ?? [])
    : [];

  const transition = async (
    action: "start" | "complete" | "block",
    actualDurationDays?: number,
  ) => {
    if (!selected) return;
    if (
      action === "complete" &&
      selectedNode?.type === "TASK" &&
      actualDurationDays === undefined
    ) {
      setActualDuration(selectedNode.durationDays ?? 1);
      setCompletionOpen(true);
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await api(`/renovations/${renovationId}/nodes/${selected.id}/${action}`, {
        method: "POST",
        body: JSON.stringify(
          actualDurationDays === undefined ? {} : { actualDurationDays },
        ),
      });
      setScenario(undefined);
      setCompletionOpen(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };
  const runScenario = async () => {
    if (!selectedNode) return;
    setBusy(true);
    setError(undefined);
    try {
      const delayChange =
        selectedNode.type === "MATERIAL"
          ? { deliveryDeltaDays: delay }
          : { durationDeltaDays: delay };
      const result = await api<ScenarioResult>(
        `/renovations/${renovationId}/scenarios`,
        {
          method: "POST",
          body: JSON.stringify({
            name: `${selectedNode.name} delayed`,
            changes: [
              {
                nodeId: selectedNode.id,
                ...delayChange,
                estimatedCostDelta: costDelta,
              },
            ],
          }),
        },
      );
      setScenario(result);
      setScenarioView("BASELINE");
      setScenarioOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Simulation failed");
    } finally {
      setBusy(false);
    }
  };
  const selectMaterialOption = async (optionId: string) => {
    if (!selected) return;
    setBusy(true);
    setError(undefined);
    try {
      await api(
        `/renovations/${renovationId}/nodes/${selected.id}/select-option`,
        { method: "POST", body: JSON.stringify({ optionId }) },
      );
      setScenario(undefined);
      setScenarioView("BASELINE");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Material selection failed",
      );
    } finally {
      setBusy(false);
    }
  };
  const resetDemo = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await api(`/renovations/${renovationId}/reset`, { method: "POST" });
      setScenario(undefined);
      setScenarioView("BASELINE");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  };
  const mutate = async (path: string, options: RequestInit) => {
    setBusy(true);
    setError(undefined);
    try {
      await api(path, options);
      setScenario(undefined);
      setScenarioView("BASELINE");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Edit failed");
      throw cause;
    } finally {
      setBusy(false);
    }
  };
  const saveNode = (nodeId: string, patch: Record<string, unknown>) =>
    mutate(`/renovations/${renovationId}/nodes/${nodeId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  const saveOption = (
    nodeId: string,
    optionId: string,
    patch: Record<string, unknown>,
  ) =>
    mutate(`/renovations/${renovationId}/nodes/${nodeId}/options/${optionId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  const addDependency = (
    fromNodeId: string,
    toNodeId: string,
    type: "DEPENDS_ON" | "REQUIRES_MATERIAL",
  ) =>
    mutate(`/renovations/${renovationId}/relationships`, {
      method: "POST",
      body: JSON.stringify({ fromNodeId, toNodeId, type }),
    });
  const removeDependency = (relationshipId: string) =>
    mutate(`/renovations/${renovationId}/relationships/${relationshipId}`, {
      method: "DELETE",
    });
  const undo = async () => {
    await mutate(`/renovations/${renovationId}/undo`, { method: "POST" });
  };
  const createNode = async (input: Record<string, unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      const node = await api<GraphNode>(`/renovations/${renovationId}/nodes`, {
        method: "POST",
        body: JSON.stringify(input),
      });
      setCreateOpen(false);
      await load();
      setSelected(node);
      setEditMode(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to create node",
      );
    } finally {
      setBusy(false);
    }
  };

  if (error && !graph)
    return (
      <main className="fatal">
        <span className="eyebrow">RENOGRAPH / STARTUP</span>
        <h1>Graph unavailable</h1>
        <p>{error}</p>
        <p className="muted">
          Start the API with a valid <code>WAVEBINDER_LICENSE</code>.
        </p>
      </main>
    );
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">R</span>
          <div>
            <strong>RENOGRAPH</strong>
            <span>renovation intelligence</span>
          </div>
        </div>
        <div className="project-title">
          <span className="eyebrow">ACTIVE RENOVATION</span>
          <div className="project-switch">
            <select
              value={renovationId}
              onChange={(event) => switchProject(event.target.value)}
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <button onClick={() => setProjectOpen(true)}>+ New project</button>
          </div>
        </div>
        <div className="header-state">
          <span className="live-dot" />
          LIVE GRAPH
        </div>
      </header>
      {error && graph && <div className="inline-error">{error}</div>}
      <section className="metrics">
        <div className="metric progress-metric">
          <span className="eyebrow">OVERALL PROGRESS</span>
          <strong>
            {Math.round((summary?.progress ?? 0) * 100)}
            <small>%</small>
          </strong>
          <div className="progress-track">
            <i style={{ width: `${(summary?.progress ?? 0) * 100}%` }} />
          </div>
        </div>
        <div className="metric">
          <span className="eyebrow">ESTIMATED COST</span>
          <strong>{money.format(summary?.estimatedCost ?? 0)}</strong>
          <span className="metric-note">
            of {money.format(summary?.budget ?? 0)} budget
          </span>
        </div>
        <div className="metric">
          <span className="eyebrow">PROJECTED END</span>
          <strong>
            {summary?.completionDate
              ? new Date(
                  `${summary.completionDate}T00:00:00`,
                ).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                })
              : "--"}
          </strong>
          <span className="metric-note">
            {renovation?.targetEndDate
              ? `target ${renovation.targetEndDate}`
              : "live resource-aware forecast"}
          </span>
        </div>
        <div className="metric">
          <span className="eyebrow">CRITICAL PATH</span>
          <strong>
            {summary?.criticalPathDurationDays ?? 0}
            <small>d</small>
          </strong>
          <span className="metric-note">
            {graph?.analysis.criticalPath.length ?? 0} activities
          </span>
        </div>
      </section>
      <div className="workspace">
        <aside className="sidebar left-sidebar">
          <button
            className="add-node-button"
            onClick={() => setCreateOpen(true)}
          >
            + Add task or material
          </button>
          <button
            className="add-node-button operations-button"
            onClick={() => setOperationsOpen(true)}
          >
            People & workflows{" "}
            <b>{graph?.analysis.resourceConflicts.length ?? 0}</b>
          </button>
          <div className="panel-heading">
            <span className="eyebrow">FILTER GRAPH</span>
            <span className="count">{graph?.nodes.length ?? 0}</span>
          </div>
          <div className="filter-list">
            {(["ALL", "TASK", "ROOM", "MATERIAL"] as const).map((item) => (
              <button
                key={item}
                className={filter === item ? "active" : ""}
                onClick={() => setFilter(item as typeof filter)}
              >
                <span className={`filter-dot ${item.toLowerCase()}`} />
                {item === "ALL"
                  ? "All nodes"
                  : `${item[0]}${item.slice(1).toLowerCase()}s`}
                <span>
                  {item === "ALL"
                    ? graph?.nodes.length
                    : graph?.nodes.filter((node) => node.type === item).length}
                </span>
              </button>
            ))}
          </div>
          <div className="panel-heading status-heading">
            <span className="eyebrow">SIGNALS</span>
          </div>
          <button
            className={`signal-row ${showCritical ? "active" : ""}`}
            onClick={() => setShowCritical((value) => !value)}
          >
            <span className="signal-line" />
            Critical path<span>{graph?.analysis.criticalPath.length ?? 0}</span>
          </button>
          {(["READY", "BLOCKED", "IN_PROGRESS"] as const).map((status) => (
            <button
              key={status}
              className={`signal-row ${filter === status ? "active" : ""}`}
              onClick={() => setFilter(status)}
            >
              <span className={`signal-status ${status.toLowerCase()}`}>
                {statusMeta[status].icon}
              </span>
              {statusMeta[status].label}
              <span>
                {graph?.nodes.filter((node) => node.status === status).length ??
                  0}
              </span>
            </button>
          ))}
          <div className="sidebar-note">
            <span className="wave-icon">~</span>
            <p>Wavebinder is maintaining dependency state in real time.</p>
          </div>
          <div className="event-timeline">
            <span className="eyebrow">LAST PROPAGATIONS</span>
            {events.slice(0, 4).map((event, index) => (
              <div className="event-row" key={`${event.at}-${index}`}>
                <span className="event-pulse" />
                {event.nodeId.replaceAll("-", " ")}
                <b>{event.status}</b>
              </div>
            ))}
          </div>
        </aside>
        <section className="graph-panel">
          <div className="graph-toolbar">
            <div>
              <span className="eyebrow">DEPENDENCY MAP</span>
              <strong>What determines the finish?</strong>
            </div>
            <div className="runtime-chip">
              <span className="live-dot" />
              WAVEBINDER <b>{graph?.runtime?.nodeCount ?? 0}</b> nodes{" "}
              <b>{graph?.runtime?.dependencyCount ?? 0}</b> links{" "}
              <small>
                C{graph?.runtime?.complexNodeCount ?? 0} / M
                {graph?.runtime?.multiNodeCount ?? 0} / L
                {graph?.runtime?.listNodeCount ?? 0} / S
                {graph?.runtime?.subscriptionCount ?? 0}
              </small>
            </div>
            <div className="toolbar-actions">
              <button
                className={showCritical ? "selected" : ""}
                onClick={() => setShowCritical((value) => !value)}
              >
                <span className="critical-symbol">◆</span>{" "}
                {showCritical ? "Critical highlighted" : "Highlight critical"}
              </button>
              <button
                onClick={() => void undo()}
                disabled={busy || !graph?.runtime?.canUndo}
              >
                Undo
              </button>
              <button
                onClick={() => {
                  setScenario(undefined);
                  void load();
                }}
              >
                Refresh
              </button>
              <button onClick={() => void resetDemo()}>Reset demo</button>
            </div>
          </div>
          <div className="graph-canvas">
            {graph ? (
              <ReactFlow
                nodes={flowNodes}
                edges={flowEdges}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                minZoom={0.2}
                maxZoom={1.5}
                proOptions={{ hideAttribution: true }}
              >
                <Background color="#27323a" gap={24} size={1} />
                <Controls showInteractive={false} />
                <MiniMap
                  nodeColor={(node) =>
                    node.data?.status === "COMPLETED"
                      ? "#9abf47"
                      : node.data?.status === "BLOCKED"
                        ? "#e27455"
                        : "#e7a75e"
                  }
                  maskColor="rgba(16,22,27,.72)"
                />
              </ReactFlow>
            ) : (
              <div className="loading">Building live graph...</div>
            )}
          </div>
        </section>
        <aside className="sidebar right-sidebar">
          {selectedNode ? (
            editMode ? (
              <EditPanel
                key={selectedNode.id}
                node={selectedNode}
                allNodes={graph?.nodes ?? []}
                dependencyEdges={(graph?.edges ?? []).filter(
                  (edge) =>
                    edge.source === selectedNode.id &&
                    edge.type !== "LOCATED_IN",
                )}
                busy={busy}
                onClose={() => setEditMode(false)}
                onSaveNode={saveNode}
                onSaveOption={saveOption}
                onSelectOption={selectMaterialOption}
                onAddDependency={addDependency}
                onRemoveDependency={removeDependency}
              />
            ) : (
              <>
                <NodeDetails
                  node={selectedNode}
                  allNodes={displayedGraph?.nodes ?? []}
                  dependencies={
                    dependencies
                      .map((edge) =>
                        displayedGraph?.nodes.find(
                          (node) => node.id === edge.target,
                        ),
                      )
                      .filter(Boolean) as GraphNode[]
                  }
                  dependents={
                    dependents
                      .map((edge) =>
                        displayedGraph?.nodes.find(
                          (node) => node.id === edge.source,
                        ),
                      )
                      .filter(Boolean) as GraphNode[]
                  }
                  onAction={transition}
                  onScenario={() => setScenarioOpen(true)}
                  onEdit={() => setEditMode(true)}
                  busy={busy}
                />
                {selectedNode.type === "MATERIAL" && selectedNode.options && (
                  <MaterialOptions
                    options={selectedNode.options}
                    selectedOptionId={selectedNode.selectedOptionId}
                    onSelect={selectMaterialOption}
                  />
                )}
                <RuntimeInspector node={selectedNode} graph={displayedGraph} />
              </>
            )
          ) : (
            <div className="empty-details">
              <span className="empty-glyph">+</span>
              <h2>Select a node</h2>
              <p>
                Inspect readiness, dependencies, blockers and schedule impact.
              </p>
            </div>
          )}
        </aside>
      </div>
      {createOpen && (
        <CreateNodeModal
          rooms={graph?.nodes.filter((node) => node.type === "ROOM") ?? []}
          busy={busy}
          onClose={() => setCreateOpen(false)}
          onCreate={createNode}
        />
      )}
      {projectOpen && (
        <NewProjectModal
          busy={busy}
          onClose={() => setProjectOpen(false)}
          onCreate={createProject}
        />
      )}
      {operationsOpen && operations && (
        <OperationsModal
          renovationId={renovationId}
          operations={operations}
          nodes={graph?.nodes ?? []}
          busy={busy}
          onClose={() => setOperationsOpen(false)}
          onMutate={mutate}
        />
      )}
      {completionOpen && selectedNode?.type === "TASK" && (
        <div
          className="modal-backdrop"
          onClick={() => setCompletionOpen(false)}
        >
          <section
            className="scenario-modal completion-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="close"
              aria-label="Close completion"
              onClick={() => setCompletionOpen(false)}
            >
              ×
            </button>
            <span className="eyebrow">MEASURED COMPLETION</span>
            <h2>{selectedNode.name}</h2>
            <p>
              The actual duration replaces the original estimate in the live
              project forecast.
            </p>
            <label>
              Planned duration{" "}
              <output>{selectedNode.durationDays ?? 0} days</output>
            </label>
            <label>
              Actual duration
              <input
                type="number"
                min="0"
                value={actualDuration}
                onChange={(event) =>
                  setActualDuration(Number(event.target.value))
                }
              />
            </label>
            <div className="variance-preview">
              Forecast variance{" "}
              <strong>
                {actualDuration - (selectedNode.durationDays ?? 0) >= 0
                  ? "+"
                  : ""}
                {actualDuration - (selectedNode.durationDays ?? 0)} days
              </strong>
            </div>
            <button
              className="primary-action"
              onClick={() => void transition("complete", actualDuration)}
              disabled={busy}
            >
              Complete and reforecast
            </button>
          </section>
        </div>
      )}
      <footer className="statusbar">
        <div>
          <span className="status-status ready">→</span>
          <strong>{summary?.readyTasks ?? 0}</strong>
          <span>READY</span>
        </div>
        <div>
          <span className="status-status blocked">!</span>
          <strong>{summary?.blockedTasks ?? 0}</strong>
          <span>BLOCKED</span>
        </div>
        <div>
          <span className="status-status critical">◆</span>
          <strong>{summary?.criticalPathDurationDays ?? 0}</strong>
          <span>CRITICAL DAYS</span>
        </div>
        <div className="footer-end">
          <span>PROJECTED END</span>
          <strong>{summary?.completionDate ?? "--"}</strong>
        </div>
      </footer>
      {scenarioOpen && selectedNode && (
        <div className="modal-backdrop" onClick={() => setScenarioOpen(false)}>
          <section
            className="scenario-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="close"
              aria-label="Close scenario"
              onClick={() => setScenarioOpen(false)}
            >
              ×
            </button>
            <span className="eyebrow">WHAT IF?</span>
            <h2>{selectedNode.name}</h2>
            <p>
              Run an isolated scenario. The Casa Rossi baseline will not change.
            </p>
            <label>
              {selectedNode.type === "MATERIAL"
                ? "Delivery delay"
                : "Duration delay"}{" "}
              <output>+{delay} days</output>
              <input
                type="range"
                min="0"
                max="30"
                value={delay}
                onChange={(event) => setDelay(Number(event.target.value))}
              />
            </label>
            <label>
              Estimated cost change <output>+{money.format(costDelta)}</output>
              <input
                type="range"
                min="0"
                max="2000"
                step="50"
                value={costDelta}
                onChange={(event) => setCostDelta(Number(event.target.value))}
              />
            </label>
            <button
              className="primary-action"
              onClick={() => void runScenario()}
              disabled={busy}
            >
              Simulate impact
            </button>
          </section>
        </div>
      )}
      {scenario && (
        <section className="scenario-result">
          <div>
            <span className="eyebrow">SCENARIO ACTIVE</span>
            <strong>{scenario.scenario}</strong>
          </div>
          <div>
            <span>Completion</span>
            <strong>
              {scenario.baseline.completionDate.slice(5)} <b>→</b>{" "}
              {scenario.scenarioResult.completionDate.slice(5)}
            </strong>
          </div>
          <div>
            <span>Delay</span>
            <strong className={scenario.impact.delayDays > 0 ? "warning" : ""}>
              {scenario.impact.delayDays >= 0 ? "+" : ""}
              {scenario.impact.delayDays} days
            </strong>
          </div>
          <div>
            <span>Cost impact</span>
            <strong>
              {scenario.impact.additionalCost >= 0 ? "+" : ""}
              {money.format(scenario.impact.additionalCost)}
            </strong>
          </div>
          <div>
            <span>Critical path</span>
            <strong
              className={scenario.impact.criticalPathChanged ? "warning" : ""}
            >
              {scenario.impact.criticalPathChanged ? "CHANGED" : "UNCHANGED"}
            </strong>
          </div>
          <div>
            <span>Affected chain</span>
            <strong>{scenario.affectedChain.length} tasks</strong>
          </div>
          <div className="scenario-toggle">
            <button
              className={scenarioView === "BASELINE" ? "selected" : ""}
              onClick={() => setScenarioView("BASELINE")}
            >
              Baseline
            </button>
            <button
              className={scenarioView === "SCENARIO" ? "selected" : ""}
              onClick={() => setScenarioView("SCENARIO")}
            >
              Scenario
            </button>
          </div>
          <button
            onClick={() => {
              setScenario(undefined);
              setScenarioView("BASELINE");
            }}
          >
            ×
          </button>
        </section>
      )}
    </main>
  );
}

function NodeDetails({
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

function EditPanel({
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

function CreateNodeModal({
  rooms,
  busy,
  onClose,
  onCreate,
}: {
  rooms: GraphNode[];
  busy: boolean;
  onClose: () => void;
  onCreate: (input: Record<string, unknown>) => Promise<void>;
}) {
  const [type, setType] = useState<"TASK" | "MATERIAL">("TASK");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [durationDays, setDurationDays] = useState(1);
  const [estimatedCost, setEstimatedCost] = useState(0);
  const [deliveryDays, setDeliveryDays] = useState(0);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="scenario-modal create-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="close" aria-label="Close creation" onClick={onClose}>
          ×
        </button>
        <span className="eyebrow">EXPAND LIVE GRAPH</span>
        <h2>Add a work package</h2>
        <p>
          The new node is instantiated in Wavebinder immediately. Add its
          dependency inputs from Edit mode next.
        </p>
        <label>
          Node type
          <select
            value={type}
            onChange={(event) =>
              setType(event.target.value as "TASK" | "MATERIAL")
            }
          >
            <option value="TASK">Task</option>
            <option value="MATERIAL">Material</option>
          </select>
        </label>
        <label>
          Name
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={
              type === "TASK"
                ? "e.g. Install backsplash"
                : "e.g. Backsplash tiles"
            }
          />
        </label>
        <label>
          Description
          <textarea
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <label>
          Room
          <select
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
          >
            {rooms.map((room) => (
              <option value={room.id} key={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </label>
        <div className="edit-grid">
          {type === "TASK" ? (
            <label>
              Planned days
              <input
                type="number"
                min="0"
                value={durationDays}
                onChange={(event) =>
                  setDurationDays(Number(event.target.value))
                }
              />
            </label>
          ) : (
            <label>
              Delivery days
              <input
                type="number"
                min="0"
                value={deliveryDays}
                onChange={(event) =>
                  setDeliveryDays(Number(event.target.value))
                }
              />
            </label>
          )}
          <label>
            Estimated cost
            <input
              type="number"
              min="0"
              value={estimatedCost}
              onChange={(event) => setEstimatedCost(Number(event.target.value))}
            />
          </label>
        </div>
        <button
          className="primary-action"
          disabled={busy || !name.trim()}
          onClick={() =>
            void onCreate({
              type,
              name,
              description,
              roomId,
              durationDays,
              estimatedCost,
              deliveryDays,
            })
          }
        >
          Create live node
        </button>
      </section>
    </div>
  );
}

function MaterialOptions({
  options,
  selectedOptionId,
  onSelect,
}: {
  options: MaterialOption[];
  selectedOptionId?: string;
  onSelect: (optionId: string) => void;
}) {
  return (
    <div className="material-options">
      <span className="eyebrow">MATERIAL OPTIONS</span>
      {options.map((option) => (
        <button
          key={option.id}
          className={selectedOptionId === option.id ? "selected" : ""}
          onClick={() => onSelect(option.id)}
        >
          <span>
            <strong>{option.label}</strong>
            <small>
              {option.deliveryDays} days · {money.format(option.estimatedCost)}
            </small>
          </span>
          <b>{option.available ? "AVAILABLE" : "ORDER"}</b>
        </button>
      ))}
    </div>
  );
}

function RuntimeInspector({
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
          `${node.id}__completed`,
          `${node.id}__in_progress`,
          `${node.id}__planned_duration`,
          `${node.id}__actual_duration`,
          `${node.id}__delay_days`,
          `${node.id}__manual_clear`,
          `${node.id}__ready`,
          `${node.id}__state`,
        ]
      : node.type === "MATERIAL"
        ? [
            `${node.id}__delivered`,
            `${node.id}__option`,
            `${node.id}__available`,
          ]
        : [`${node.id}__materials`];
  const inputs = (graph?.edges ?? [])
    .filter((edge) => edge.source === node.id && edge.type !== "LOCATED_IN")
    .map((edge) => {
      const upstream = graph?.nodes.find(
        (candidate) => candidate.id === edge.target,
      );
      const key =
        upstream?.type === "MATERIAL"
          ? `${edge.target}__available`
          : `${edge.target}__completed`;
      return {
        id: edge.id,
        label: upstream?.name ?? edge.target,
        value: pool[key],
      };
    });
  const roomBundle =
    node.type === "ROOM" && Array.isArray(pool[`${node.id}__materials`])
      ? (pool[`${node.id}__materials`] as RoomMaterialRequirement[])
      : [];
  return (
    <details className="runtime-inspector" open>
      <summary>
        <span>
          <span className="live-dot" />
          WAVEBINDER LIVE STATE
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
