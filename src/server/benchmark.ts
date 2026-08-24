import os from "node:os";
import { performance } from "node:perf_hooks";
import { simulate } from "./analysis.js";
import { RenovationRuntime, schedule } from "./graph.js";
import type { RenovationData } from "../shared/types.js";

const iterations = Number(process.env.BENCHMARK_ITERATIONS ?? 20);

function dataset(): RenovationData {
  const nodes = Array.from({ length: 100 }, (_, index) => ({ id: `task-${index}`, renovationId: "benchmark", type: "TASK" as const, name: `Task ${index}`, status: "PLANNED" as const, durationDays: (index % 5) + 1 }));
  const relationships = Array.from({ length: 200 }, (_, index) => {
    const from = (index % 99) + 1;
    const to = Math.max(0, from - ((index % 4) + 1));
    return { id: `edge-${index}`, renovationId: "benchmark", fromNodeId: `task-${from}`, toNodeId: `task-${to}`, type: "DEPENDS_ON" as const };
  });
  return { renovation: { id: "benchmark", name: "Benchmark", startDate: "2026-01-01", status: "PLANNING" }, nodes, relationships };
}

function percentile(values: number[], point: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * point))];
}

async function measure(operation: () => void | Promise<void>) {
  const values: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const start = performance.now();
    await operation();
    values.push(performance.now() - start);
  }
  return { medianMs: Number(percentile(values, 0.5).toFixed(2)), p95Ms: Number(percentile(values, 0.95).toFixed(2)) };
}

const baseline = dataset();
const results: Record<string, unknown> = {
  environment: { node: process.version, platform: process.platform, cpu: os.cpus()[0]?.model, iterations },
  dataset: { nodes: baseline.nodes.length, relationships: baseline.relationships.length },
  schedule: await measure(() => { schedule(baseline); }),
};

if (process.env.WAVEBINDER_LICENSE) {
  results.wavebinderRuntimeConstruction = await measure(async () => {
    const runtime = new RenovationRuntime(structuredClone(baseline));
    await runtime.ready();
    runtime.refresh();
    runtime.dispose();
  });
  results.scenario = await measure(async () => {
    await simulate(baseline, "benchmark", [{ nodeId: "task-50", durationDeltaDays: 3 }]);
  });
} else {
  results.wavebinderRuntimeConstruction = "skipped: WAVEBINDER_LICENSE is not configured";
  results.scenario = "skipped: WAVEBINDER_LICENSE is not configured";
}

console.log(JSON.stringify(results, null, 2));
