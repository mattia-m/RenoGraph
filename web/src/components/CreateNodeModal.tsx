import { useState } from "react";
import type { GraphNode } from "../../../src/shared/types.js";

export function CreateNodeModal({
  rooms,
  busy,
  onClose,
  onCreate,
}: {
  rooms: GraphNode[];
  busy: boolean;
  onClose: () => void;
  onCreate: (input: Record<string, unknown>) => Promise<void>;
}) {
  const [type, setType] = useState<"TASK" | "MATERIAL">("TASK");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [durationDays, setDurationDays] = useState(1);
  const [estimatedCost, setEstimatedCost] = useState(0);
  const [deliveryDays, setDeliveryDays] = useState(0);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="scenario-modal create-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="close" aria-label="Close creation" onClick={onClose}>
          ×
        </button>
        <span className="eyebrow">EXPAND LIVE GRAPH</span>
        <h2>Add a work package</h2>
        <p>
          The new node is instantiated in Wavebinder immediately. Add its
          dependency inputs from Edit mode next.
        </p>
        <label>
          Node type
          <select
            value={type}
            onChange={(event) =>
              setType(event.target.value as "TASK" | "MATERIAL")
            }
          >
            <option value="TASK">Task</option>
            <option value="MATERIAL">Material</option>
          </select>
        </label>
        <label>
          Name
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={
              type === "TASK"
                ? "e.g. Install backsplash"
                : "e.g. Backsplash tiles"
            }
          />
        </label>
        <label>
          Description
          <textarea
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <label>
          Room
          <select
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
          >
            {rooms.map((room) => (
              <option value={room.id} key={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </label>
        <div className="edit-grid">
          {type === "TASK" ? (
            <label>
              Planned days
              <input
                type="number"
                min="0"
                value={durationDays}
                onChange={(event) =>
                  setDurationDays(Number(event.target.value))
                }
              />
            </label>
          ) : (
            <label>
              Delivery days
              <input
                type="number"
                min="0"
                value={deliveryDays}
                onChange={(event) =>
                  setDeliveryDays(Number(event.target.value))
                }
              />
            </label>
          )}
          <label>
            Estimated cost
            <input
              type="number"
              min="0"
              value={estimatedCost}
              onChange={(event) => setEstimatedCost(Number(event.target.value))}
            />
          </label>
        </div>
        <button
          className="primary-action"
          disabled={busy || !name.trim()}
          onClick={() =>
            void onCreate({
              type,
              name,
              description,
              roomId,
              durationDays,
              estimatedCost,
              deliveryDays,
            })
          }
        >
          Create live node
        </button>
      </section>
    </div>
  );
}
