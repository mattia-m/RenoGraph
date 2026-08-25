import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { ProjectListItem, RenovationData } from "../shared/types.js";
import { RenovationStore } from "./store.js";

export class PortfolioStore {
  private readonly projects = new Map<string, RenovationStore>();
  private constructor(private readonly projectsDir: string) {}

  static async create(): Promise<PortfolioStore> {
    const basePath = path.resolve(process.env.RENOGRAPH_DATA ?? "data/renovation.json");
    const portfolio = new PortfolioStore(path.resolve(process.env.RENOGRAPH_PROJECTS_DIR ?? path.join(path.dirname(basePath), "projects")));
    const base = await RenovationStore.create({ dataPath: basePath });
    portfolio.projects.set(base.data.renovation.id, base);
    if (existsSync(portfolio.projectsDir)) for (const file of readdirSync(portfolio.projectsDir).filter((name) => name.endsWith(".json"))) {
      const dataPath = path.join(portfolio.projectsDir, file);
      const saved = JSON.parse(readFileSync(dataPath, "utf8")) as RenovationData;
      const initialData: RenovationData = { renovation: saved.renovation, nodes: saved.nodes.filter((node) => node.type === "ROOM"), relationships: [], professionals: [], assignments: [], contractors: [], purchases: [], documents: [] };
      const store = await RenovationStore.create({ dataPath, initialData });
      portfolio.projects.set(store.data.renovation.id, store);
    }
    return portfolio;
  }

  get(id: string): RenovationStore { const store = this.projects.get(id); if (!store) throw new Error("RENOVATION_NOT_FOUND"); return store; }
  list(): ProjectListItem[] { return [...this.projects.values()].map((store) => { const summary = store.getSummary(); return { id: store.data.renovation.id, name: store.data.renovation.name, startDate: store.data.renovation.startDate, status: store.data.renovation.status, completionDate: summary.completionDate, progress: summary.progress }; }); }
  async createProject(input: { name: string; startDate: string; budget?: number }): Promise<RenovationStore> {
    if (!input.name?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || (input.budget !== undefined && (!Number.isFinite(input.budget) || input.budget < 0))) throw new Error("INVALID_RENOVATION");
    const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "renovation";
    let id = slug; let suffix = 2; while (this.projects.has(id)) id = `${slug}-${suffix++}`;
    const initialData: RenovationData = { renovation: { id, name: input.name.trim(), startDate: input.startDate, budget: input.budget, status: "PLANNING" }, nodes: [{ id: `${id}-space`, renovationId: id, type: "ROOM", name: "Project space", status: "PLANNED", position: { x: 40, y: 40 } }], relationships: [], professionals: [], assignments: [], contractors: [], purchases: [], documents: [] };
    mkdirSync(this.projectsDir, { recursive: true });
    const store = await RenovationStore.create({ dataPath: path.join(this.projectsDir, `${id}.json`), initialData });
    this.projects.set(id, store); return store;
  }
}
