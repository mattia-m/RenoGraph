import { useEffect, useMemo, useState, useRef } from "react";
import { buildFlowEdges } from "../graphPresentation.js";
import type {
  GraphNode,
  GraphResponse,
  NodeStatus,
  ProjectListItem,
  RenovationData,
  ScenarioResult,
  Summary,
} from "../../../src/shared/types.js";
import { api } from "../api/renovationApi.js";
import type { OperationsData } from "../OperationsModals.js";
import type { FlowNode } from "../components/GraphNodeCard.js";

import type { RuntimeEvent } from "../../../src/shared/runtime.js";

export function useRenovationWorkspace() {
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
  const [filter, setFilter] = useState<
    "ALL" | NodeStatus | "TASK" | "MATERIAL" | "ROOM"
  >("ALL");
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

  const activeProject = useRef(renovationId);
  activeProject.current = renovationId;
  const requestVersion = useRef(0);
  const controller = useRef<AbortController | undefined>(undefined);
  const revision = useRef<number>(-1);
  const [connection, setConnection] = useState("Connecting");
  const load = async () => {
    if (activeProject.current !== renovationId) return;
    const version = ++requestVersion.current;
    controller.current?.abort();
    controller.current = new AbortController();
    try {
      const snapshot = await api<{
        revision: number;
        graph: GraphResponse;
        summary: Summary;
        events: RuntimeEvent[];
        projects: ProjectListItem[];
        renovation: RenovationData["renovation"];
        operations: OperationsData;
      }>(`/renovations/${renovationId}/workspace`, {
        signal: controller.current.signal,
      });
      if (
        version !== requestVersion.current ||
        activeProject.current !== renovationId
      )
        return;
      if (revision.current >= 0 && revision.current !== snapshot.revision) {
        setScenario(undefined);
        setScenarioView("BASELINE");
      }
      revision.current = snapshot.revision;
      setGraph(snapshot.graph);
      setSummary(snapshot.summary);
      setEvents(snapshot.events);
      setProjects(snapshot.projects);
      setRenovation(snapshot.renovation);
      setOperations(snapshot.operations);
      setSelected((current) =>
        current
          ? snapshot.graph.nodes.find((node) => node.id === current.id)
          : undefined,
      );
    } catch (cause) {
      if (
        version !== requestVersion.current ||
        activeProject.current !== renovationId ||
        (cause instanceof Error && cause.name === "AbortError")
      )
        return;
      setError(
        cause instanceof Error ? cause.message : "Unable to load workspace",
      );
    }
  };
  useEffect(() => {
    setGraph(undefined);
    setSelected(undefined);
    setScenario(undefined);
    revision.current = -1;
    setConnection("Connecting");
    void load();
    const stream = new EventSource(`/api/renovations/${renovationId}/stream`);
    stream.onopen = () => {
      setConnection("Live");
      void load();
    };
    stream.onerror = () => setConnection("Reconnecting");
    stream.addEventListener("revision", () => void load());
    return () => {
      stream.close();
      controller.current?.abort();
      requestVersion.current += 1;
    };
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
        .filter(
          (node) =>
            filter === "ALL" || node.status === filter || node.type === filter,
        )
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
  const flowEdges = useMemo(
    () =>
      buildFlowEdges(
        displayedGraph,
        new Set(flowNodes.map((node) => node.id)),
        showCritical,
      ),
    [displayedGraph, showCritical, flowNodes],
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
      const capturedRevision = revision.current;
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
      if (
        activeProject.current !== renovationId ||
        revision.current !== capturedRevision
      )
        return;
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

  return {
    connection,
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
  };
}
