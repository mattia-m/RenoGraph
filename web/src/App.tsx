import { useEffect, useMemo, useState } from "react";
import { Background, Controls, Handle, MiniMap, Position, ReactFlow } from "@xyflow/react";
import type { Edge, Node, NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { GraphNode, GraphResponse, MaterialOption, NodeStatus, ScenarioResult, Summary } from "../../src/shared/types.js";

const renovationId = "casa-rossi";
const money = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const statusMeta: Record<NodeStatus, { icon: string; label: string }> = {
  COMPLETED: { icon: "✓", label: "Completed" }, READY: { icon: "→", label: "Ready" }, IN_PROGRESS: { icon: "◉", label: "In progress" }, BLOCKED: { icon: "!", label: "Blocked" }, PLANNED: { icon: "○", label: "Planned" },
};

type GraphNodeData = Record<string, unknown> & GraphNode & { onSelect?: (node: GraphNode) => void; scenarioDelta?: number };
type FlowNode = Node<GraphNodeData>;
type RuntimeEvent = { nodeId: string; status: string; at: string };

function RenovationNodeCard({ data }: NodeProps<FlowNode>) {
  const meta = statusMeta[data.status];
  return <>
    <Handle type="target" position={Position.Top} className="handle" />
    <button className={`graph-card ${data.type.toLowerCase()} ${data.status.toLowerCase()} ${data.critical ? "critical" : ""}`} onClick={() => data.onSelect?.(data)}>
      <span className="card-kicker"><span className="status-icon">{meta.icon}</span>{data.type}</span>
      <strong>{data.name}</strong>
      <span className="card-meta">{data.durationDays ? `${data.durationDays} days` : data.type === "MATERIAL" ? "material" : "space"}{data.estimatedCost ? ` · ${money.format(data.estimatedCost)}` : ""}</span>
      {data.critical && <span className="critical-badge">CRITICAL</span>}
      {data.scenarioDelta !== undefined && data.scenarioDelta !== 0 && <span className="delta-badge">+{data.scenarioDelta}d</span>}
    </button>
    <Handle type="source" position={Position.Bottom} className="handle" />
  </>;
}

const nodeTypes = { renovation: RenovationNodeCard };

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { headers: { "Content-Type": "application/json" }, ...options });
  if (!response.ok) throw new Error((await response.json()).message ?? "Request failed");
  return response.json();
}

export function App() {
  const [graph, setGraph] = useState<GraphResponse>();
  const [summary, setSummary] = useState<Summary>();
  const [selected, setSelected] = useState<GraphNode>();
  const [showCritical, setShowCritical] = useState(false);
  const [filter, setFilter] = useState<"ALL" | NodeStatus>("ALL");
  const [scenario, setScenario] = useState<ScenarioResult>();
  const [scenarioView, setScenarioView] = useState<"BASELINE" | "SCENARIO">("BASELINE");
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [delay, setDelay] = useState(14);
  const [costDelta, setCostDelta] = useState(350);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [events, setEvents] = useState<RuntimeEvent[]>([]);

  const load = async () => {
    try {
      const [nextGraph, nextSummary, runtime] = await Promise.all([api<GraphResponse>(`/renovations/${renovationId}/graph`), api<Summary>(`/renovations/${renovationId}/summary`), api<{ events: RuntimeEvent[] }>(`/renovations/${renovationId}/runtime/events`)]);
      setGraph(nextGraph); setSummary(nextSummary); setEvents(runtime.events); setSelected((current) => current ? nextGraph.nodes.find((node) => node.id === current.id) : undefined);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load Renograph"); }
  };
  useEffect(() => { void load(); }, []);

  const displayedGraph = scenario && scenarioView === "SCENARIO" ? scenario.graph : graph;
  const flowNodes = useMemo<FlowNode[]>(() => (displayedGraph?.nodes ?? []).filter((node) => filter === "ALL" || node.status === filter).map((node) => ({ id: node.id, type: "renovation", position: node.position ?? { x: 0, y: 0 }, data: { ...node, onSelect: setSelected, scenarioDelta: scenarioView === "BASELINE" ? scenario?.affectedNodes.find((affected) => affected.id === node.id)?.scheduleDeltaDays : undefined } })), [displayedGraph, filter, scenario, scenarioView]);
  const visibleIds = new Set(flowNodes.map((node) => node.id));
  const flowEdges = useMemo<Edge[]>(() => (displayedGraph?.edges ?? []).filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)).map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, type: "smoothstep", animated: showCritical && edge.critical, className: showCritical && edge.critical ? "critical-edge" : "normal-edge" })), [displayedGraph, showCritical, filter]);

  const dependencies = selected ? displayedGraph?.edges.filter((edge) => edge.source === selected.id) ?? [] : [];
  const dependents = selected ? displayedGraph?.edges.filter((edge) => edge.target === selected.id) ?? [] : [];

  const transition = async (action: "start" | "complete" | "block") => {
    if (!selected) return;
    setBusy(true); setError(undefined);
    try { await api(`/renovations/${renovationId}/nodes/${selected.id}/${action}`, { method: "POST" }); setScenario(undefined); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Action failed"); } finally { setBusy(false); }
  };
  const runScenario = async () => {
    if (!selected) return;
    setBusy(true); setError(undefined);
    try {
      const result = await api<ScenarioResult>(`/renovations/${renovationId}/scenarios`, { method: "POST", body: JSON.stringify({ name: `${selected.name} delayed`, changes: [{ nodeId: selected.id, durationDeltaDays: delay, estimatedCostDelta: costDelta }] }) });
      setScenario(result); setScenarioView("BASELINE"); setScenarioOpen(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Simulation failed"); } finally { setBusy(false); }
  };
  const selectMaterialOption = async (optionId: string) => {
    if (!selected) return;
    setBusy(true); setError(undefined);
    try { await api(`/renovations/${renovationId}/nodes/${selected.id}/select-option`, { method: "POST", body: JSON.stringify({ optionId }) }); setScenario(undefined); setScenarioView("BASELINE"); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Material selection failed"); } finally { setBusy(false); }
  };
  const resetDemo = async () => {
    setBusy(true); setError(undefined);
    try { await api(`/renovations/${renovationId}/reset`, { method: "POST" }); setScenario(undefined); setScenarioView("BASELINE"); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Reset failed"); } finally { setBusy(false); }
  };

  if (error && !graph) return <main className="fatal"><span className="eyebrow">RENOGRAPH / STARTUP</span><h1>Graph unavailable</h1><p>{error}</p><p className="muted">Start the API with a valid <code>WAVEBINDER_LICENSE</code>.</p></main>;
  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">R</span><div><strong>RENOGRAPH</strong><span>renovation intelligence</span></div></div>
      <div className="project-title"><span className="eyebrow">ACTIVE RENOVATION</span><h1>Casa Rossi <span>/ complete renovation</span></h1></div>
      <div className="header-state"><span className="live-dot" />LIVE GRAPH</div>
    </header>
    {error && graph && <div className="inline-error">{error}</div>}
    <section className="metrics">
      <div className="metric progress-metric"><span className="eyebrow">OVERALL PROGRESS</span><strong>{Math.round((summary?.progress ?? 0) * 100)}<small>%</small></strong><div className="progress-track"><i style={{ width: `${(summary?.progress ?? 0) * 100}%` }} /></div></div>
      <div className="metric"><span className="eyebrow">ESTIMATED COST</span><strong>{money.format(summary?.estimatedCost ?? 0)}</strong><span className="metric-note">of {money.format(summary?.budget ?? 0)} budget</span></div>
      <div className="metric"><span className="eyebrow">PROJECTED END</span><strong>{summary?.completionDate ? new Date(`${summary.completionDate}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "--"}</strong><span className="metric-note">target 30 Sep 2026</span></div>
      <div className="metric"><span className="eyebrow">CRITICAL PATH</span><strong>{summary?.criticalPathDurationDays ?? 0}<small>d</small></strong><span className="metric-note">{graph?.analysis.criticalPath.length ?? 0} activities</span></div>
    </section>
    <div className="workspace">
      <aside className="sidebar left-sidebar">
        <div className="panel-heading"><span className="eyebrow">FILTER GRAPH</span><span className="count">{graph?.nodes.length ?? 0}</span></div>
        <div className="filter-list">{(["ALL", "TASK", "ROOM", "MATERIAL"] as const).map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item as typeof filter)}><span className={`filter-dot ${item.toLowerCase()}`} />{item === "ALL" ? "All nodes" : `${item[0]}${item.slice(1).toLowerCase()}s`}<span>{item === "ALL" ? graph?.nodes.length : graph?.nodes.filter((node) => node.type === item).length}</span></button>)}</div>
        <div className="panel-heading status-heading"><span className="eyebrow">SIGNALS</span></div>
        <button className={`signal-row ${showCritical ? "active" : ""}`} onClick={() => setShowCritical((value) => !value)}><span className="signal-line" />Critical path<span>{graph?.analysis.criticalPath.length ?? 0}</span></button>
        {(["READY", "BLOCKED", "IN_PROGRESS"] as const).map((status) => <button key={status} className={`signal-row ${filter === status ? "active" : ""}`} onClick={() => setFilter(status)}><span className={`signal-status ${status.toLowerCase()}`}>{statusMeta[status].icon}</span>{statusMeta[status].label}<span>{graph?.nodes.filter((node) => node.status === status).length ?? 0}</span></button>)}
        <div className="sidebar-note"><span className="wave-icon">~</span><p>Wavebinder is maintaining dependency state in real time.</p></div><div className="event-timeline"><span className="eyebrow">LAST PROPAGATIONS</span>{events.slice(0, 4).map((event, index) => <div className="event-row" key={`${event.at}-${index}`}><span className="event-pulse" />{event.nodeId.replaceAll("-", " ")}<b>{event.status}</b></div>)}</div>
      </aside>
      <section className="graph-panel"><div className="graph-toolbar"><div><span className="eyebrow">DEPENDENCY MAP</span><strong>What determines the finish?</strong></div><div className="runtime-chip"><span className="live-dot" />WAVEBINDER <b>{graph?.runtime?.nodeCount ?? 0}</b> nodes <b>{graph?.runtime?.dependencyCount ?? 0}</b> links <small>C{graph?.runtime?.complexNodeCount ?? 0} / M{graph?.runtime?.multiNodeCount ?? 0} / L{graph?.runtime?.listNodeCount ?? 0} / S{graph?.runtime?.subscriptionCount ?? 0}</small></div><div className="toolbar-actions"><button className={showCritical ? "selected" : ""} onClick={() => setShowCritical((value) => !value)}><span className="critical-symbol">◆</span> {showCritical ? "Critical highlighted" : "Highlight critical"}</button><button onClick={() => { setScenario(undefined); void load(); }}>Refresh</button><button onClick={() => void resetDemo()}>Reset demo</button></div></div><div className="graph-canvas">{graph ? <ReactFlow nodes={flowNodes} edges={flowEdges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.2 }} minZoom={0.2} maxZoom={1.5} proOptions={{ hideAttribution: true }}><Background color="#27323a" gap={24} size={1} /><Controls showInteractive={false} /><MiniMap nodeColor={(node) => node.data?.status === "COMPLETED" ? "#9abf47" : node.data?.status === "BLOCKED" ? "#e27455" : "#e7a75e"} maskColor="rgba(16,22,27,.72)" /></ReactFlow> : <div className="loading">Building live graph...</div>}</div></section>
      <aside className="sidebar right-sidebar">
        {selected ? <><NodeDetails node={selected} allNodes={graph?.nodes ?? []} dependencies={dependencies.map((edge) => graph?.nodes.find((node) => node.id === edge.target)).filter(Boolean) as GraphNode[]} dependents={dependents.map((edge) => graph?.nodes.find((node) => node.id === edge.source)).filter(Boolean) as GraphNode[]} onAction={transition} onScenario={() => setScenarioOpen(true)} onOption={selectMaterialOption} busy={busy} />{selected.type === "MATERIAL" && selected.options && <MaterialOptions options={selected.options} selectedOptionId={selected.selectedOptionId} onSelect={selectMaterialOption} />}</> : <div className="empty-details"><span className="empty-glyph">+</span><h2>Select a node</h2><p>Inspect readiness, dependencies, blockers and schedule impact.</p></div>}
      </aside>
    </div>
    <footer className="statusbar"><div><span className="status-status ready">→</span><strong>{summary?.readyTasks ?? 0}</strong><span>READY</span></div><div><span className="status-status blocked">!</span><strong>{summary?.blockedTasks ?? 0}</strong><span>BLOCKED</span></div><div><span className="status-status critical">◆</span><strong>{summary?.criticalPathDurationDays ?? 0}</strong><span>CRITICAL DAYS</span></div><div className="footer-end"><span>PROJECTED END</span><strong>{summary?.completionDate ?? "--"}</strong></div></footer>
    {scenarioOpen && selected && <div className="modal-backdrop" onClick={() => setScenarioOpen(false)}><section className="scenario-modal" onClick={(event) => event.stopPropagation()}><button className="close" onClick={() => setScenarioOpen(false)}>×</button><span className="eyebrow">WHAT IF?</span><h2>{selected.name}</h2><p>Run an isolated scenario. The Casa Rossi baseline will not change.</p><label>Duration delay <output>+{delay} days</output><input type="range" min="0" max="30" value={delay} onChange={(event) => setDelay(Number(event.target.value))} /></label><label>Estimated cost change <output>+{money.format(costDelta)}</output><input type="range" min="0" max="2000" step="50" value={costDelta} onChange={(event) => setCostDelta(Number(event.target.value))} /></label><button className="primary-action" onClick={() => void runScenario()} disabled={busy}>Simulate impact</button></section></div>}
    {scenario && <section className="scenario-result"><div><span className="eyebrow">SCENARIO ACTIVE</span><strong>{scenario.scenario}</strong></div><div><span>Completion</span><strong>{scenario.baseline.completionDate.slice(5)} <b>→</b> {scenario.scenarioResult.completionDate.slice(5)}</strong></div><div><span>Delay</span><strong className={scenario.impact.delayDays > 0 ? "warning" : ""}>{scenario.impact.delayDays >= 0 ? "+" : ""}{scenario.impact.delayDays} days</strong></div><div><span>Cost impact</span><strong>{scenario.impact.additionalCost >= 0 ? "+" : ""}{money.format(scenario.impact.additionalCost)}</strong></div><div><span>Critical path</span><strong className={scenario.impact.criticalPathChanged ? "warning" : ""}>{scenario.impact.criticalPathChanged ? "CHANGED" : "UNCHANGED"}</strong></div><div><span>Affected chain</span><strong>{scenario.affectedChain.length} tasks</strong></div><div className="scenario-toggle"><button className={scenarioView === "BASELINE" ? "selected" : ""} onClick={() => setScenarioView("BASELINE")}>Baseline</button><button className={scenarioView === "SCENARIO" ? "selected" : ""} onClick={() => setScenarioView("SCENARIO")}>Scenario</button></div><button onClick={() => { setScenario(undefined); setScenarioView("BASELINE"); }}>×</button></section>}
  </main>;
}

function NodeDetails({ node, allNodes, dependencies, dependents, onAction, onScenario, onOption, busy }: { node: GraphNode; allNodes: GraphNode[]; dependencies: GraphNode[]; dependents: GraphNode[]; onAction: (action: "start" | "complete" | "block") => void; onScenario: () => void; onOption: (optionId: string) => void; busy: boolean }) {
  const meta = statusMeta[node.status];
  return <div className="details-content"><div className="details-top"><span className={`type-pill ${node.type.toLowerCase()}`}>{node.type}</span><span className={`status-pill ${node.status.toLowerCase()}`}>{meta.icon} {meta.label}</span></div><h2>{node.name}</h2><p className="description">{node.description}</p><div className="detail-stats"><div><span className="eyebrow">DURATION</span><strong>{node.durationDays ? `${node.durationDays} days` : "--"}</strong></div><div><span className="eyebrow">EST. COST</span><strong>{node.estimatedCost ? money.format(node.estimatedCost) : "--"}</strong></div></div>{node.critical && <div className="critical-callout"><span>◆</span><div><strong>Critical activity</strong><p>Any delay here can move the projected completion.</p></div></div>}{node.status === "BLOCKED" && <div className="blocker-callout"><span>!</span><div><strong>Waiting on {node.blockedBy?.length ?? 0} direct dependencies</strong><p>Root blockers: {node.rootBlockers?.map((id) => graphNodeName(id, allNodes)).join(", ") || "none"}</p></div></div>}<div className="detail-section"><span className="eyebrow">DEPENDS ON <b>{dependencies.length}</b></span>{dependencies.length ? dependencies.map((item) => <div className="linked-row" key={item.id}><span className={`mini-dot ${item.status.toLowerCase()}`} />{item.name}<span className="link-status">{statusMeta[item.status].icon}</span></div>) : <p className="muted">No upstream dependencies</p>}</div><div className="detail-section"><span className="eyebrow">UNLOCKS <b>{dependents.length}</b></span>{dependents.slice(0, 4).map((item) => <div className="linked-row" key={item.id}><span className={`mini-dot ${item.status.toLowerCase()}`} />{item.name}</div>)}</div><div className="detail-actions">{node.type === "MATERIAL" && node.status !== "COMPLETED" && <button onClick={() => onAction("complete")} disabled={busy}>Mark delivered</button>}{node.type === "TASK" && node.status === "READY" && <button onClick={() => onAction("start")} disabled={busy}>Start work</button>}{node.type === "TASK" && node.status === "IN_PROGRESS" && <button onClick={() => onAction("complete")} disabled={busy}>Mark complete</button>}{node.type === "TASK" && (node.status === "READY" || node.status === "IN_PROGRESS") && <button className="quiet-danger" onClick={() => onAction("block")} disabled={busy}>Block</button>}{node.type === "TASK" && <button className="scenario-button" onClick={onScenario}>Simulate change <span>↗</span></button>}</div></div>;
}

function MaterialOptions({ options, selectedOptionId, onSelect }: { options: MaterialOption[]; selectedOptionId?: string; onSelect: (optionId: string) => void }) {
  return <div className="material-options"><span className="eyebrow">MATERIAL OPTIONS</span>{options.map((option) => <button key={option.id} className={selectedOptionId === option.id ? "selected" : ""} onClick={() => onSelect(option.id)}><span><strong>{option.label}</strong><small>{option.deliveryDays} days · {money.format(option.estimatedCost)}</small></span><b>{option.available ? "AVAILABLE" : "ORDER"}</b></button>)}</div>;
}

function graphNodeName(id: string, nodes: GraphNode[]): string { return nodes.find((node) => node.id === id)?.name ?? id; }
