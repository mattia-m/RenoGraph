import { useEffect, useMemo, useState } from "react";
import { Background, Controls, MiniMap, ReactFlow } from "@xyflow/react";
import type { Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type {
  GraphNode,
  GraphResponse,
  NodeStatus,
  ProjectListItem,
  RenovationData,
  ScenarioResult,
  Summary,
} from "../../../src/shared/types.js";
import {
  NewProjectModal,
  OperationsModal,
  type OperationsData,
} from "../OperationsModals.js";
import { CreateNodeModal } from "../components/CreateNodeModal.js";
import { EditPanel } from "../components/NodeEditor.js";
import { MaterialOptions } from "../components/MaterialOptions.js";
import { NodeDetails } from "../components/NodeDetails.js";
import { RuntimeInspector } from "../components/RuntimeInspector.js";
import { api } from "../api/renovationApi.js";
import { nodeTypes } from "../components/GraphNodeCard.js";
import { useRenovationWorkspace } from "../hooks/useRenovationWorkspace.js";

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

type RuntimeEvent = { nodeId: string; status: string; at: string };

export function WorkspaceView() {
  const {
    renovationId,
    projects,
    renovation,
    operations,
    operationsOpen,
    setOperationsOpen,
    projectOpen,
    setProjectOpen,
    graph,
    summary,
    selected,
    setSelected,
    showCritical,
    setShowCritical,
    filter,
    setFilter,
    scenario,
    setScenario,
    scenarioView,
    setScenarioView,
    scenarioOpen,
    setScenarioOpen,
    delay,
    setDelay,
    costDelta,
    setCostDelta,
    busy,
    error,
    events,
    editMode,
    setEditMode,
    createOpen,
    setCreateOpen,
    completionOpen,
    setCompletionOpen,
    actualDuration,
    setActualDuration,
    load,
    switchProject,
    createProject,
    displayedGraph,
    selectedNode,
    flowNodes,
    flowEdges,
    dependencies,
    dependents,
    transition,
    runScenario,
    selectMaterialOption,
    resetDemo,
    mutate,
    saveNode,
    saveOption,
    addDependency,
    removeDependency,
    undo,
    createNode,
  } = useRenovationWorkspace();
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
