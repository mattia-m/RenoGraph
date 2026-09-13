import "./env.js";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { simulate } from "./analysis.js";
import { RenovationRuntime, schedule } from "./graph.js";
import type { RenovationData } from "../shared/types.js";

const iterations = Number(process.env.BENCHMARK_ITERATIONS ?? 20);
if (!Number.isInteger(iterations) || iterations < 1) throw new Error("BENCHMARK_ITERATIONS must be a positive integer");

import { benchmarkData as dataset } from "./benchmarkData.js";

function percentile(values: number[], point: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * point))];
}

async function measure(operation: () => void | Promise<void>) {
  await operation(); // warm up outside the measured samples
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
  const live = new RenovationRuntime(structuredClone(baseline));
  try {
    await live.ready(); const before = live.runtimeInfo().eventCount;
    results.factPropagation = await measure(() => { live.beginMutation("benchmark"); live.data.nodes[50].durationDays! += 1; live.refresh(); live.deriveStatuses(); live.forecast(); });
    results.propagationEventsIncludingWarmup = live.runtimeInfo().eventCount - before;
    results.runtime = { nodes: live.runtimeInfo().nodeCount, dependencies: live.runtimeInfo().dependencyCount };
  } finally { live.dispose(); }
  results.scenario = await measure(async () => {
    await simulate(baseline, "benchmark", [{ nodeId: "task-50", durationDeltaDays: 3 }]);
  });
} else {
  results.wavebinderRuntimeConstruction = "skipped: WAVEBINDER_LICENSE is not configured";
  results.scenario = "skipped: WAVEBINDER_LICENSE is not configured";
}

console.log(JSON.stringify(results, null, 2));
