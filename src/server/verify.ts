import "./env.js";
import { spawnSync } from "node:child_process";
if (!process.env.WAVEBINDER_LICENSE) { console.error("Verification requires WAVEBINDER_LICENSE. No licensed tests may be skipped."); process.exit(1); }
for (const args of [["run", "typecheck"], ["test"], ["run", "benchmark"]]) {
  const result = spawnSync("npm", args, { stdio: "inherit", env: { ...process.env, BENCHMARK_ITERATIONS: process.env.BENCHMARK_ITERATIONS ?? "3" } });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
