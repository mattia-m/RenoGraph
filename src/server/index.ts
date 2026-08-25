import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NodeStatus } from "../shared/types.js";
import { PortfolioStore } from "./portfolio.js";
import { validateScenarioInput } from "./validation.js";

const port = Number(process.env.PORT ?? 3001);
const app = express();
app.use(cors());
app.use(express.json());
app.use((request, _response, next) => { if (request.path.startsWith("/api")) console.log(`${request.method} ${request.path}`); next(); });

let portfolio: PortfolioStore;
const getStore = (request: Request) => {
  if (!portfolio) throw new Error("STORE_NOT_READY");
  return portfolio.get(String(request.params.id));
};
const route = (handler: (request: Request, response: Response) => unknown) => (request: Request, response: Response, next: NextFunction) => Promise.resolve(handler(request, response)).catch(next);
const ensureRenovation = (request: Request) => getStore(request);
const nodePatch = (body: Record<string, unknown> = {}) => Object.fromEntries(["name", "description", "durationDays", "actualDurationDays", "delayDays", "manualBlocker", "estimatedCost", "actualCost", "status"].filter((key) => body[key] !== undefined).map((key) => [key, body[key]]));
const optionPatch = (body: Record<string, unknown> = {}) => Object.fromEntries(["label", "deliveryDays", "estimatedCost", "available"].filter((key) => body[key] !== undefined).map((key) => [key, body[key]]));

app.get("/api/health", (_request, response) => response.json({ ok: true, wavebinder: Boolean(portfolio) }));
app.get("/api/renovations", route((_request, response) => response.json(portfolio.list())));
app.post("/api/renovations", route(async (request, response) => response.status(201).json((await portfolio.createProject(request.body)).data)));
app.get("/api/renovations/:id", route((request, response) => { response.json(getStore(request).data); }));
app.get("/api/renovations/:id/graph", route((request, response) => response.json(getStore(request).getGraph())));
app.get("/api/renovations/:id/summary", route((request, response) => response.json(getStore(request).getSummary())));
app.get("/api/renovations/:id/ready", route((request, response) => response.json(getStore(request).getReady())));
app.get("/api/renovations/:id/blocked", route((request, response) => response.json(getStore(request).getBlocked())));
app.get("/api/renovations/:id/critical-path", route((request, response) => response.json(getStore(request).getAnalysis())));
app.get("/api/renovations/:id/runtime/events", route((request, response) => response.json({ events: getStore(request).getEvents(), runtime: getStore(request).getGraph().runtime })));
app.get("/api/renovations/:id/operations", route((request, response) => response.json(getStore(request).getOperations())));
app.post("/api/renovations/:id/professionals", route((request, response) => response.status(201).json(getStore(request).addProfessional(request.body))));
app.post("/api/renovations/:id/assignments", route((request, response) => response.status(201).json(getStore(request).assignProfessional(request.body?.taskId, request.body?.professionalId))));
app.delete("/api/renovations/:id/assignments/:assignmentId", route((request, response) => { getStore(request).removeAssignment(String(request.params.assignmentId)); response.status(204).end(); }));
app.post("/api/renovations/:id/contractors", route((request, response) => response.status(201).json(getStore(request).addContractor(request.body))));
app.post("/api/renovations/:id/purchases", route((request, response) => response.status(201).json(getStore(request).addPurchase(request.body))));
app.patch("/api/renovations/:id/purchases/:purchaseId", route((request, response) => response.json(getStore(request).updatePurchase(String(request.params.purchaseId), request.body?.status))));
app.post("/api/renovations/:id/documents", route((request, response) => response.status(201).json(getStore(request).addDocument(request.body))));
app.get("/api/renovations/:id/nodes/:nodeId", route((request, response) => { const node = getStore(request).getNode(String(request.params.nodeId)); if (!node) throw new Error("NODE_NOT_FOUND"); response.json({ node, blockers: getStore(request).getBlocked().find((item) => item.id === node.id)?.explanation ?? null }); }));
app.post("/api/renovations/:id/nodes", route(async (request, response) => response.status(201).json(await getStore(request).addNode(request.body))));
app.get("/api/renovations/:id/nodes/:nodeId/blockers", route((request, response) => { const node = getStore(request).getNode(String(request.params.nodeId)); if (!node) throw new Error("NODE_NOT_FOUND"); response.json(getStore(request).getBlocked().find((item) => item.id === node.id)?.explanation ?? { nodeId: node.id, status: "READY", blockedBy: [], rootBlockers: [] }); }));
app.patch("/api/renovations/:id/nodes/:nodeId", route((request, response) => response.json(getStore(request).updateNode(String(request.params.nodeId), nodePatch(request.body)))));
app.patch("/api/renovations/:id/nodes/:nodeId/options/:optionId", route((request, response) => response.json(getStore(request).updateMaterialOption(String(request.params.nodeId), String(request.params.optionId), optionPatch(request.body)))));
app.post("/api/renovations/:id/nodes/:nodeId/select-option", route((request, response) => { if (typeof request.body?.optionId !== "string") throw new Error("MATERIAL_OPTION_NOT_FOUND"); response.json(getStore(request).selectMaterialOption(String(request.params.nodeId), request.body.optionId)); }));
app.post("/api/renovations/:id/relationships", route(async (request, response) => { const { fromNodeId, toNodeId, type } = request.body ?? {}; if (typeof fromNodeId !== "string" || typeof toNodeId !== "string" || !["DEPENDS_ON", "LOCATED_IN", "REQUIRES_MATERIAL"].includes(type)) throw new Error("INVALID_RELATIONSHIP"); response.status(201).json(await getStore(request).addRelationship({ fromNodeId, toNodeId, type })); }));
app.delete("/api/renovations/:id/relationships/:relationshipId", route(async (request, response) => { await getStore(request).removeRelationship(String(request.params.relationshipId)); response.status(204).end(); }));
app.post("/api/renovations/:id/reset", route(async (request, response) => { await getStore(request).resetDemo(); response.json(getStore(request).getSummary()); }));
app.post("/api/renovations/:id/undo", route(async (request, response) => { await getStore(request).undo(); response.json(getStore(request).getSummary()); }));
for (const [action, status] of [["start", "IN_PROGRESS"], ["complete", "COMPLETED"], ["block", "BLOCKED"]] as const) {
  app.post(`/api/renovations/:id/nodes/:nodeId/${action}`, route((request, response) => response.json(getStore(request).transition(String(request.params.nodeId), status as NodeStatus, request.body?.actualDurationDays))));
}
app.post("/api/renovations/:id/scenarios", route(async (request, response) => { const { name, changes } = validateScenarioInput(request.body); response.json(await getStore(request).simulate(name, changes)); }));

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
app.use(express.static(frontend));
app.get("*splat", (_request, response) => response.sendFile(path.join(frontend, "index.html")));
app.use((error: Error, _request: Request, response: Response, _next: NextFunction) => {
  const status = error.message === "NODE_NOT_FOUND" || error.message === "RENOVATION_NOT_FOUND" || error.message === "RELATIONSHIP_NOT_FOUND" ? 404 : error.message === "DEPENDENCY_CYCLE" ? 409 : 400;
  response.status(status).json({ code: error.message, message: error.message });
});

PortfolioStore.create().then((created) => {
  portfolio = created;
  app.listen(port, () => console.log(`Renograph API listening on http://localhost:${port}`));
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
