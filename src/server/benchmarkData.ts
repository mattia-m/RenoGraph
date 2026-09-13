import type { RenovationData } from "../shared/types.js";
export function benchmarkData(): RenovationData {
  const nodes = Array.from({ length: 100 }, (_, index) => ({
    id: `task-${index}`,
    renovationId: "benchmark",
    type: "TASK" as const,
    name: `Task ${index}`,
    status: "PLANNED" as const,
    durationDays: (index % 5) + 1,
  }));
  const relationships: RenovationData["relationships"] = [];
  for (let gap = 1; relationships.length < 200; gap++)
    for (let from = gap; from < 100 && relationships.length < 200; from++)
      relationships.push({
        id: `edge-${from}-${from - gap}`,
        renovationId: "benchmark",
        fromNodeId: `task-${from}`,
        toNodeId: `task-${from - gap}`,
        type: "DEPENDS_ON",
      });
  return {
    renovation: {
      id: "benchmark",
      name: "Benchmark",
      startDate: "2026-01-01",
      status: "PLANNING",
    },
    nodes,
    relationships,
  };
}
