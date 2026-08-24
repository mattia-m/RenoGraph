import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NodeStatus } from "../shared/types.js";
import { RenovationStore } from "./store.js";
import { validateScenarioInput } from "./validation.js";

const port = Number(process.env.PORT ?? 3001);
const app = express();
app.use(cors());
app.use(express.json());
app.use((request, _response, next) => { if (request.path.startsWith("/api")) console.log(`${request.method} ${request.path}`); next(); });

let store: RenovationStore;
const getStore = () => {
  if (!store) throw new Error("STORE_NOT_READY");
  return store;
};
const route = (handler: (request: Request, response: Response) => unknown) => (request: Request, response: Response, next: NextFunction) => Promise.resolve(handler(request, response)).catch(next);
const ensureRenovation = (request: Request) => {
  if (request.params.id !== getStore().data.renovation.id) throw new Error("RENOVATION_NOT_FOUND");
};
const nodePatch = (body: Record<string, unknown> = {}) => Object.fromEntries(["name", "description", "durationDays", "estimatedCost", "actualCost", "status"].filter((key) => body[key] !== undefined).map((key) => [key, body[key]]));
const optionPatch = (body: Record<string, unknown> = {}) => Object.fromEntries(["label", "deliveryDays", "estimatedCost", "available"].filter((key) => body[key] !== undefined).map((key) => [key, body[key]]));

app.get("/api/health", (_request, response) => response.json({ ok: true, wavebinder: Boolean(store) }));
app.get("/api/renovations/:id", route((request, response) => { ensureRenovation(request); response.json(getStore().data); }));
app.get("/api/renovations/:id/graph", route((request, response) => { ensureRenovation(request); response.json(getStore().getGraph()); }));
app.get("/api/renovations/:id/summary", route((request, response) => { ensureRenovation(request); response.json(getStore().getSummary()); }));
app.get("/api/renovations/:id/ready", route((request, response) => { ensureRenovation(request); response.json(getStore().getReady()); }));
app.get("/api/renovations/:id/blocked", route((request, response) => { ensureRenovation(request); response.json(getStore().getBlocked()); }));
app.get("/api/renovations/:id/critical-path", route((request, response) => { ensureRenovation(request); response.json(getStore().getAnalysis()); }));
app.get("/api/renovations/:id/runtime/events", route((request, response) => { ensureRenovation(request); response.json({ events: getStore().getEvents(), runtime: getStore().getGraph().runtime }); }));
app.get("/api/renovations/:id/nodes/:nodeId", route((request, response) => { ensureRenovation(request); const node = getStore().getNode(String(request.params.nodeId)); if (!node) throw new Error("NODE_NOT_FOUND"); response.json({ node, blockers: getStore().getBlocked().find((item) => item.id === node.id)?.explanation ?? null }); }));
app.get("/api/renovations/:id/nodes/:nodeId/blockers", route((request, response) => { ensureRenovation(request); const node = getStore().getNode(String(request.params.nodeId)); if (!node) throw new Error("NODE_NOT_FOUND"); response.json(getStore().getBlocked().find((item) => item.id === node.id)?.explanation ?? { nodeId: node.id, status: "READY", blockedBy: [], rootBlockers: [] }); }));
app.patch("/api/renovations/:id/nodes/:nodeId", route((request, response) => { ensureRenovation(request); response.json(getStore().updateNode(String(request.params.nodeId), nodePatch(request.body))); }));
app.patch("/api/renovations/:id/nodes/:nodeId/options/:optionId", route((request, response) => { ensureRenovation(request); response.json(getStore().updateMaterialOption(String(request.params.nodeId), String(request.params.optionId), optionPatch(request.body))); }));
app.post("/api/renovations/:id/nodes/:nodeId/select-option", route((request, response) => { ensureRenovation(request); if (typeof request.body?.optionId !== "string") throw new Error("MATERIAL_OPTION_NOT_FOUND"); response.json(getStore().selectMaterialOption(String(request.params.nodeId), request.body.optionId)); }));
app.post("/api/renovations/:id/relationships", route(async (request, response) => { ensureRenovation(request); const { fromNodeId, toNodeId, type } = request.body ?? {}; if (typeof fromNodeId !== "string" || typeof toNodeId !== "string" || !["DEPENDS_ON", "LOCATED_IN", "REQUIRES_MATERIAL"].includes(type)) throw new Error("INVALID_RELATIONSHIP"); response.status(201).json(await getStore().addRelationship({ fromNodeId, toNodeId, type })); }));
app.delete("/api/renovations/:id/relationships/:relationshipId", route(async (request, response) => { ensureRenovation(request); await getStore().removeRelationship(String(request.params.relationshipId)); response.status(204).end(); }));
app.post("/api/renovations/:id/reset", route(async (request, response) => { ensureRenovation(request); await getStore().resetDemo(); response.json(getStore().getSummary()); }));
app.post("/api/renovations/:id/undo", route(async (request, response) => { ensureRenovation(request); await getStore().undo(); response.json(getStore().getSummary()); }));
for (const [action, status] of [["start", "IN_PROGRESS"], ["complete", "COMPLETED"], ["block", "BLOCKED"]] as const) {
  app.post(`/api/renovations/:id/nodes/:nodeId/${action}`, route((request, response) => { ensureRenovation(request); response.json(getStore().transition(String(request.params.nodeId), status as NodeStatus)); }));
}
app.post("/api/renovations/:id/scenarios", route(async (request, response) => { ensureRenovation(request); const { name, changes } = validateScenarioInput(request.body); response.json(await getStore().simulate(name, changes)); }));

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
app.use(express.static(frontend));
app.get("*splat", (_request, response) => response.sendFile(path.join(frontend, "index.html")));
app.use((error: Error, _request: Request, response: Response, _next: NextFunction) => {
  const status = error.message === "NODE_NOT_FOUND" || error.message === "RENOVATION_NOT_FOUND" || error.message === "RELATIONSHIP_NOT_FOUND" ? 404 : error.message === "DEPENDENCY_CYCLE" ? 409 : 400;
  response.status(status).json({ code: error.message, message: error.message });
});

RenovationStore.create().then((created) => {
  store = created;
  app.listen(port, () => console.log(`Renograph API listening on http://localhost:${port}`));
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
