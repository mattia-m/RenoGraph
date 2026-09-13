import "./env.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import { createApp } from "./app.js";
import { PortfolioStore } from "./portfolio.js";
import { simulate } from "./analysis.js";
import { createDemoData } from "./seed.js";
import type { GraphResponse, Summary } from "../shared/types.js";
const licensed = Boolean(process.env.WAVEBINDER_LICENSE);
test(
  "licensed HTTP workspace: receipt, SSE, undo, supplier race/outage, lifecycle",
  { skip: !licensed },
  async (t) => {
    const directory = mkdtempSync(path.join(tmpdir(), "renograph-http-"));
    const oldData = process.env.RENOGRAPH_DATA,
      oldProjects = process.env.RENOGRAPH_PROJECTS_DIR;
    process.env.RENOGRAPH_DATA = path.join(directory, "project.json");
    process.env.RENOGRAPH_PROJECTS_DIR = path.join(directory, "projects");
    const portfolio = await PortfolioStore.create();
    const server = createApp(portfolio).listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const root = `${base}/api/renovations/casa-rossi`;
    t.after(async () => {
      server.closeAllConnections();
      server.close();
      await portfolio.dispose();
      rmSync(directory, { recursive: true, force: true });
      if (oldData === undefined) delete process.env.RENOGRAPH_DATA;
      else process.env.RENOGRAPH_DATA = oldData;
      if (oldProjects === undefined) delete process.env.RENOGRAPH_PROJECTS_DIR;
      else process.env.RENOGRAPH_PROJECTS_DIR = oldProjects;
    });
    const post = (url: string, body: unknown, method = "POST") =>
      fetch(root + url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    const snapshot = async () => {
      const response = await fetch(root + "/workspace");
      assert.equal(response.status, 200);
      const value = (await response.json()) as {
        revision: number;
        graph: GraphResponse;
        summary: Summary;
      };
      assert.equal(
        value.summary.blockedTasks,
        value.graph.nodes.filter(
          (node) => node.type === "TASK" && node.status === "BLOCKED",
        ).length,
      );
      assert.equal(
        value.summary.readyTasks,
        value.graph.nodes.filter(
          (node) => node.type === "TASK" && node.status === "READY",
        ).length,
      );
      return value;
    };
    const initial = await snapshot();
    const abort = new AbortController();
    const stream = await fetch(root + "/stream", { signal: abort.signal });
    const reader = stream.body!.getReader();
    assert.match(
      new TextDecoder().decode((await reader.read()).value),
      /event: revision/,
    );
    const purchaseResponse = await post("/purchases", {
      description: "Bathroom tiles",
      amount: 1250,
      status: "ORDERED",
      materialId: "bathroom-tiles",
    });
    assert.equal(purchaseResponse.status, 201);
    const purchase = await purchaseResponse.json();
    assert.match(
      new TextDecoder().decode((await reader.read()).value),
      /revision/,
    );
    abort.abort();
    assert.equal(
      (await post(`/purchases/${purchase.id}`, { status: "RECEIVED" }, "PATCH"))
        .status,
      200,
    );
    const received = await snapshot();
    assert.equal(
      received.graph.nodes.find((node) => node.id === "bathroom-tiles")?.status,
      "COMPLETED",
    );
    assert.ok(
      received.summary.criticalPathDurationDays <=
        initial.summary.criticalPathDurationDays,
    );
    assert.equal(
      received.graph.runtime?.instanceId,
      initial.graph.runtime?.instanceId,
    );
    const room = received.graph.runtime?.dataPool[
      "bathroom__materials"
    ] as Array<{ materialId: string; delivered: boolean }>;
    assert.equal(
      room.find((item) => item.materialId === "bathroom-tiles")?.delivered,
      true,
    );
    assert.equal((await post("/undo", {})).status, 200);
    assert.notEqual(
      (await snapshot()).graph.nodes.find(
        (node) => node.id === "bathroom-tiles",
      )?.status,
      "COMPLETED",
    );
    const quote = await post("/nodes/bathroom-tiles/supplier-quote", {});
    assert.equal(quote.status, 200, await quote.text());
    const quoted = await snapshot();
    const material = quoted.graph.nodes.find(
      (node) => node.id === "bathroom-tiles",
    )!;
    assert.equal(
      material.options?.find(
        (option) => option.id === material.selectedOptionId,
      )?.deliveryDays,
      3,
    );
    const inFlight = post("/nodes/bathroom-tiles/supplier-quote", {});
    await new Promise((resolve) => setTimeout(resolve, 50));
    await post("/nodes/bathroom-tiles/select-option", { optionId: "express" });
    assert.equal((await inFlight).status, 503);
    const revision = (await snapshot()).revision;
    assert.equal(
      (await post("/nodes/bathroom-tiles/supplier-quote", { fail: true }))
        .status,
      503,
    );
    assert.equal((await snapshot()).revision, revision);
    assert.equal(
      (await post("/nodes/bathroom-tiles/supplier-quote", {})).status,
      200,
    );
    assert.equal((await fetch(base + "/api/health")).status, 200);
    const store = portfolio.get("casa-rossi");
    await portfolio.dispose();
    await portfolio.dispose();
    assert.equal(store.runtime.runtimeInfo().ready, false);
    assert.equal((await fetch(base + "/api/health")).status, 503);
  },
);

test(
  "licensed scenario records post-initialization readiness-only propagation",
  { skip: !licensed },
  async () => {
    const data = createDemoData();
    const result = await simulate(data, "Permit hold", [
      { nodeId: "bathroom-plumbing", newStatus: "BLOCKED" },
    ]);
    assert.equal(result.graph.runtime?.snapshot, true);
    assert.ok(
      result.affectedNodes.some(
        (node) =>
          node.id === "bathroom-plumbing" && node.afterStatus === "BLOCKED",
      ),
    );
    assert.ok(
      result.propagation?.some(
        (event) => event.source === "scenario" && event.kind === "FACT",
      ),
    );
    assert.ok(
      result.propagation?.some(
        (event) => event.source === "scenario" && event.kind === "DERIVED",
      ),
    );
    assert.equal(
      data.nodes.find((node) => node.id === "bathroom-plumbing")?.manualBlocker,
      undefined,
    );
  },
);

test("licensed scenario includes indirectly unblocked work with no schedule shift", { skip: !licensed }, async () => {
  const data = createDemoData();
  const electrical = data.nodes.find((node) => node.id === "bathroom-electrical")!;
  electrical.status = "COMPLETED"; electrical.actualDurationDays = electrical.durationDays;
  const result = await simulate(data, "Plumbing complete", [{ nodeId: "bathroom-plumbing", newStatus: "COMPLETED", actualDurationDays: 4 }]);
  const affected = result.affectedNodes.find((node) => node.id === "bathroom-waterproofing");
  assert.equal(affected?.scheduleDeltaDays, 0);
  assert.equal(affected?.beforeStatus, "BLOCKED"); assert.equal(affected?.afterStatus, "READY");
});
