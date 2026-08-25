import { useState } from "react";
import type {
  Contractor,
  GraphNode,
  GraphResponse,
  Professional,
  ProjectDocument,
  Purchase,
  TaskAssignment,
} from "../../src/shared/types.js";

const money = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export type OperationsData = {
  professionals: Professional[];
  assignments: TaskAssignment[];
  contractors: Contractor[];
  purchases: Purchase[];
  documents: ProjectDocument[];
  resourceConflicts: GraphResponse["analysis"]["resourceConflicts"];
};

type Mutation = (path: string, options: RequestInit) => Promise<void>;

export function NewProjectModal({
  busy,
  onClose,
  onCreate,
}: {
  busy: boolean;
  onClose: () => void;
  onCreate: (input: {
    name: string;
    startDate: string;
    budget?: number;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [budget, setBudget] = useState(25000);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="scenario-modal create-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="close"
          aria-label="Close project creation"
          onClick={onClose}
        >
          ×
        </button>
        <span className="eyebrow">NEW RENOVATION</span>
        <h2>Create a live project</h2>
        <p>
          Starts with one project space. Add tasks, materials, dependencies and
          people from there.
        </p>
        <label>
          Project name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Start date
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </label>
        <label>
          Budget
          <input
            type="number"
            min="0"
            value={budget}
            onChange={(event) => setBudget(Number(event.target.value))}
          />
        </label>
        <button
          className="primary-action"
          disabled={busy || !name.trim()}
          onClick={() => void onCreate({ name, startDate, budget })}
        >
          Create and open project
        </button>
      </section>
    </div>
  );
}

export function OperationsModal({
  renovationId,
  operations,
  nodes,
  busy,
  onClose,
  onMutate,
}: {
  renovationId: string;
  operations: OperationsData;
  nodes: GraphNode[];
  busy: boolean;
  onClose: () => void;
  onMutate: Mutation;
}) {
  const tasks = nodes.filter((node) => node.type === "TASK");
  const materials = nodes.filter((node) => node.type === "MATERIAL");
  const [professionalName, setProfessionalName] = useState("");
  const [trade, setTrade] = useState("");
  const [available, setAvailable] = useState(0);
  const [taskId, setTaskId] = useState(tasks[0]?.id ?? "");
  const [professionalId, setProfessionalId] = useState(
    operations.professionals[0]?.id ?? "",
  );
  const [contractorName, setContractorName] = useState("");
  const [contractorTrade, setContractorTrade] = useState("");
  const [purchase, setPurchase] = useState("");
  const [amount, setAmount] = useState(0);
  const [materialId, setMaterialId] = useState(materials[0]?.id ?? "");
  const [documentName, setDocumentName] = useState("");
  const [documentKind, setDocumentKind] =
    useState<ProjectDocument["kind"]>("QUOTE");
  const [reference, setReference] = useState("");
  const post = (path: string, body: unknown) =>
    onMutate(`/renovations/${renovationId}/${path}`, {
      method: "POST",
      body: JSON.stringify(body),
    });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="operations-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="close"
          aria-label="Close project operations"
          onClick={onClose}
        >
          ×
        </button>
        <span className="eyebrow">PROJECT OPERATIONS</span>
        <h2>People, purchasing & paperwork</h2>
        <div className="operations-grid">
          <section>
            <h3>Professionals & crew conflicts</h3>
            {operations.professionals.map((item) => (
              <div className="workflow-row" key={item.id}>
                <b>{item.name}</b>
                <span>
                  {item.trade} · available day {item.availableFromDay}
                </span>
              </div>
            ))}
            {operations.resourceConflicts.map((item) => (
              <div
                className="conflict-row"
                key={`${item.professionalId}-${item.delayedTaskId}`}
              >
                Crew conflict delays {nodeName(item.delayedTaskId, nodes)} by{" "}
                {item.delayDays}d
              </div>
            ))}
            <div className="inline-form">
              <input
                placeholder="Professional name"
                value={professionalName}
                onChange={(event) => setProfessionalName(event.target.value)}
              />
              <input
                placeholder="Trade"
                value={trade}
                onChange={(event) => setTrade(event.target.value)}
              />
              <input
                type="number"
                min="0"
                title="Available from project day"
                value={available}
                onChange={(event) => setAvailable(Number(event.target.value))}
              />
              <button
                disabled={busy || !professionalName || !trade}
                onClick={() =>
                  void post("professionals", {
                    name: professionalName,
                    trade,
                    availableFromDay: available,
                  })
                }
              >
                Add
              </button>
            </div>
            <div className="inline-form">
              <select
                value={taskId}
                onChange={(event) => setTaskId(event.target.value)}
              >
                {tasks.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <select
                value={professionalId}
                onChange={(event) => setProfessionalId(event.target.value)}
              >
                {operations.professionals.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <button
                disabled={!taskId || !professionalId}
                onClick={() =>
                  void post("assignments", { taskId, professionalId })
                }
              >
                Assign
              </button>
            </div>
            {operations.assignments.map((item) => (
              <div className="workflow-row" key={item.id}>
                <span>
                  {nodeName(item.taskId, nodes)} →{" "}
                  {
                    operations.professionals.find(
                      (professional) => professional.id === item.professionalId,
                    )?.name
                  }
                </span>
                <button
                  onClick={() =>
                    void onMutate(
                      `/renovations/${renovationId}/assignments/${item.id}`,
                      { method: "DELETE" },
                    )
                  }
                >
                  Remove
                </button>
              </div>
            ))}
          </section>
          <section>
            <h3>Contractors</h3>
            {operations.contractors.map((item) => (
              <div className="workflow-row" key={item.id}>
                <b>{item.name}</b>
                <span>
                  {item.trade}
                  {item.contact ? ` · ${item.contact}` : ""}
                </span>
              </div>
            ))}
            <div className="inline-form">
              <input
                placeholder="Company or contractor"
                value={contractorName}
                onChange={(event) => setContractorName(event.target.value)}
              />
              <input
                placeholder="Trade"
                value={contractorTrade}
                onChange={(event) => setContractorTrade(event.target.value)}
              />
              <button
                disabled={!contractorName || !contractorTrade}
                onClick={() =>
                  void post("contractors", {
                    name: contractorName,
                    trade: contractorTrade,
                  })
                }
              >
                Add
              </button>
            </div>
          </section>
          <section>
            <h3>Purchases</h3>
            {operations.purchases.map((item) => (
              <div className="workflow-row" key={item.id}>
                <b>{item.description}</b>
                <span>
                  {money.format(item.amount)} · {item.status}
                </span>
                <select
                  value={item.status}
                  onChange={(event) =>
                    void onMutate(
                      `/renovations/${renovationId}/purchases/${item.id}`,
                      {
                        method: "PATCH",
                        body: JSON.stringify({ status: event.target.value }),
                      },
                    )
                  }
                >
                  <option>REQUESTED</option>
                  <option>ORDERED</option>
                  <option>RECEIVED</option>
                </select>
              </div>
            ))}
            <div className="inline-form">
              <input
                placeholder="Purchase"
                value={purchase}
                onChange={(event) => setPurchase(event.target.value)}
              />
              <input
                type="number"
                min="0"
                value={amount}
                onChange={(event) => setAmount(Number(event.target.value))}
              />
              <select
                value={materialId}
                onChange={(event) => setMaterialId(event.target.value)}
              >
                <option value="">No material link</option>
                {materials.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <button
                disabled={!purchase}
                onClick={() =>
                  void post("purchases", {
                    description: purchase,
                    amount,
                    status: "REQUESTED",
                    materialId: materialId || undefined,
                  })
                }
              >
                Request
              </button>
            </div>
          </section>
          <section>
            <h3>Documents</h3>
            {operations.documents.map((item) => (
              <div className="workflow-row" key={item.id}>
                <b>{item.name}</b>
                <span>
                  {item.kind}
                  {item.reference ? ` · ${item.reference}` : ""}
                </span>
              </div>
            ))}
            <div className="inline-form">
              <input
                placeholder="Document name"
                value={documentName}
                onChange={(event) => setDocumentName(event.target.value)}
              />
              <select
                value={documentKind}
                onChange={(event) =>
                  setDocumentKind(event.target.value as ProjectDocument["kind"])
                }
              >
                <option>QUOTE</option>
                <option>CONTRACT</option>
                <option>PERMIT</option>
                <option>INVOICE</option>
                <option>OTHER</option>
              </select>
              <input
                placeholder="Local reference / URL"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
              />
              <button
                disabled={!documentName}
                onClick={() =>
                  void post("documents", {
                    name: documentName,
                    kind: documentKind,
                    reference,
                  })
                }
              >
                Record
              </button>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function nodeName(id: string, nodes: GraphNode[]): string {
  return nodes.find((node) => node.id === id)?.name ?? id;
}
