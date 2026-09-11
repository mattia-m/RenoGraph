import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { RenovationStore, type StoreRuntime } from "./store.js";
import { createDemoData } from "./seed.js";
import { deriveDomainStatuses } from "./domain.js";
import { analyze, summary } from "./forecast.js";
import type { RenovationData } from "../shared/types.js";

// This double tests transaction boundaries and cleanup, not Wavebinder propagation.
class TestRuntime implements StoreRuntime {
  disposed = false;
  beforeReady?: () => Promise<void>;
  failReady = false;
  constructor(
    public data: RenovationData,
    private count: number,
  ) {}
  async ready() {
    await this.beforeReady?.();
    if (this.failReady) throw new Error("TEST_RUNTIME_FAILURE");
  }
  refresh() {}
  deriveStatuses() {
    deriveDomainStatuses(this.data);
  }
  forecast() {
    const analysis = analyze(this.data);
    return { analysis, summary: summary(this.data, analysis) };
  }
  recentEvents() {
    return [];
  }
  runtimeInfo() {
    return {
      ready: !this.disposed,
      nodeCount: 0,
      dependencyCount: 0,
      derivedNodeCount: 0,
      complexNodeCount: 0,
      multiNodeCount: 0,
      listNodeCount: 0,
      subscriptionCount: 0,
      instanceId: String(this.count),
      role: "baseline" as const,
      createdAt: "",
      rebuildCount: this.count,
      eventCount: 0,
      lastEvent: undefined,
      dataPool: {},
    };
  }
  dispose() {
    this.disposed = true;
  }
}
async function fixture(t: TestContext) {
  const directory = mkdtempSync(path.join(tmpdir(), "renograph-store-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const runtimes: TestRuntime[] = [];
  const control: { configure?: (runtime: TestRuntime) => void } = {};
  const dataPath = path.join(directory, "project.json");
  const store = await RenovationStore.create({
    dataPath,
    initialData: createDemoData(),
    runtimeFactory: (data, metadata) => {
      const runtime = new TestRuntime(data, metadata.rebuildCount);
      control.configure?.(runtime);
      runtimes.push(runtime);
      return runtime;
    },
  });
  return { store, dataPath, runtimes, control };
}

test("reads retain the committed graph during rebuild and following edits are serialized", async (t) => {
  const { store, runtimes, control } = await fixture(t);
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  control.configure = (runtime) => {
    runtime.beforeReady = () => {
      entered();
      return gate;
    };
  };
  const previous = store.data;
  const rebuilding = store.addNode({
    type: "TASK",
    name: "New work",
    durationDays: 2,
  });
  await started;
  const editing = store.updateNode("bathroom-plumbing", {
    estimatedCost: 1234,
  });
  assert.equal(store.data, previous);
  assert.equal(store.getNode("new-work"), undefined);
  assert.equal(store.runtime, runtimes[0]);
  release();
  await Promise.all([rebuilding, editing]);
  assert.equal(store.getNode("new-work")?.name, "New work");
  assert.equal(store.getNode("bathroom-plumbing")?.estimatedCost, 1234);
  assert.equal(runtimes[0].disposed, true);
  assert.equal(store.runtime, runtimes[1]);
});

test("failed rebuilds preserve data, runtime, disk and history, and dispose candidates", async (t) => {
  const { store, dataPath, runtimes, control } = await fixture(t);
  const previous = store.data;
  const disk = readFileSync(dataPath, "utf8");
  control.configure = (runtime) => {
    runtime.failReady = true;
  };
  await assert.rejects(
    store.addNode({ type: "TASK", name: "Failed", durationDays: 1 }),
    /TEST_RUNTIME_FAILURE/,
  );
  assert.equal(store.data, previous);
  assert.equal(store.runtime, runtimes[0]);
  assert.equal(readFileSync(dataPath, "utf8"), disk);
  assert.equal(store.getGraph().runtime.canUndo, false);
  assert.equal(runtimes[1].disposed, true);
  assert.equal(runtimes[0].disposed, false);
  control.configure = undefined;
  await store.updateNode("bathroom-plumbing", { name: "Still usable" });
  assert.equal(store.getNode("bathroom-plumbing")?.name, "Still usable");
});

test("persistence failure leaves the previous runtime active", async (t) => {
  const { store, dataPath, runtimes } = await fixture(t);
  const previous = store.data;
  renameSync(dataPath, `${dataPath}.backup`);
  mkdirSync(dataPath);
  await assert.rejects(
    store.removeRelationship(store.data.relationships[0].id),
  );
  assert.equal(store.data, previous);
  assert.equal(store.runtime, runtimes[0]);
  assert.equal(runtimes[0].disposed, false);
  assert.equal(runtimes[1].disposed, true);
  assert.equal(store.getGraph().runtime.canUndo, false);
});

test("failed undo retains its history entry and failed reset retains current data", async (t) => {
  const { store, control } = await fixture(t);
  await store.updateNode("bathroom-plumbing", { name: "Edited plumbing" });
  const edited = store.data;
  control.configure = (runtime) => {
    runtime.failReady = true;
  };
  await assert.rejects(store.undo(), /TEST_RUNTIME_FAILURE/);
  assert.equal(store.data, edited);
  assert.equal(store.getGraph().runtime.canUndo, true);
  await assert.rejects(store.resetDemo(), /TEST_RUNTIME_FAILURE/);
  assert.equal(store.data, edited);
  control.configure = undefined;
  await store.undo();
  assert.equal(store.getNode("bathroom-plumbing")?.name, "Bathroom plumbing");
  assert.equal(store.getGraph().runtime.canUndo, false);
});

test("ordinary edit failures leave facts and history unchanged", async (t) => {
  const { store, dataPath } = await fixture(t);
  const previous = store.data;
  await assert.rejects(
    store.updateNode("bathroom-plumbing", { status: "COMPLETED" }),
    /ACTUAL_DURATION_REQUIRED/,
  );
  assert.equal(store.data, previous);
  renameSync(dataPath, `${dataPath}.backup`);
  mkdirSync(dataPath);
  await assert.rejects(
    store.updateNode("bathroom-plumbing", { durationDays: 40 }),
  );
  assert.equal(store.data, previous);
  assert.equal(store.runtime.data, previous);
  assert.equal(store.getGraph().runtime.canUndo, false);
});
