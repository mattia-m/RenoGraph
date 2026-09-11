import { MarkerType, type Edge } from "@xyflow/react";
import type { GraphResponse } from "../../src/shared/types.js";

export function buildFlowEdges(
  graph: GraphResponse | undefined,
  visibleIds: Set<string>,
  highlight: boolean,
): Edge[] {
  if (!graph) return [];
  const visible = (edge: { source: string; target: string }) =>
    visibleIds.has(edge.source) && visibleIds.has(edge.target);
  const dependencies: Edge[] = graph.edges.filter(visible).map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: "smoothstep",
    animated: highlight && edge.criticalState === "ACTIVE",
    className:
      edge.criticalState === "HISTORICAL"
        ? "historical-edge"
        : highlight && edge.criticalState === "ACTIVE"
          ? "critical-edge"
          : "normal-edge",
  }));
  const resources: Edge[] = (graph.resourceEdges ?? [])
    .filter(visible)
    .map((edge) => {
      const active = highlight && edge.criticalState === "ACTIVE";
      const historical = edge.criticalState === "HISTORICAL";
      const color = historical ? "#91a3aa" : active ? "#e27455" : "#77c9d4";
      const previous =
        graph.nodes.find((node) => node.id === edge.source)?.name ??
        edge.source;
      const next =
        graph.nodes.find((node) => node.id === edge.target)?.name ??
        edge.target;
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: "crew-out",
        targetHandle: "crew-in",
        type: "smoothstep",
        label: `${edge.professionalName} · ${edge.trade}`,
        ariaLabel: `Shared crew: ${edge.professionalName}. ${previous} before ${next}.`,
        animated: active,
        className: `resource-edge${active ? " resource-critical" : ""}${historical ? " resource-historical" : ""}`,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color,
          width: 18,
          height: 18,
        },
        labelStyle: { fill: color, fontSize: 11, fontWeight: 600 },
        labelBgStyle: { fill: "#142127", fillOpacity: 0.96 },
        labelBgPadding: [7, 4] as [number, number],
        labelBgBorderRadius: 4,
        zIndex: 1,
      };
    });
  return [...dependencies, ...resources];
}
