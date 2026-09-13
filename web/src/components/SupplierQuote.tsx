import { useEffect, useRef, useState } from "react";
import { api } from "../api/renovationApi.js";
export function SupplierQuote({
  renovationId,
  nodeId,
  optionId,
}: {
  renovationId: string;
  nodeId: string;
  optionId?: string;
}) {
  const [state, setState] = useState("idle");
  const [message, setMessage] = useState("");
  const mounted = useRef(true);
  const controller = useRef<AbortController | undefined>(undefined);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  const refresh = async (fail = false) => {
    setState("loading");
    setMessage("");
    controller.current = new AbortController();
    try {
      await api(`/renovations/${renovationId}/nodes/${nodeId}/supplier-quote`, {
        method: "POST",
        body: JSON.stringify({ fail }),
        signal: controller.current.signal,
      });
      if (mounted.current) {
        setState("success");
        setMessage("Updated · 3-day delivery · €1,250");
      }
    } catch (error) {
      if (mounted.current) {
        setState("error");
        setMessage(
          error instanceof Error && error.message === "SUPPLIER_STALE_RETRY"
            ? "The project changed while this quote loaded. Retry for the current selection."
            : "The supplier is unavailable. Your project has not changed. Please retry.",
        );
      }
    }
  };
  return (
    <section className="supplier-quote" aria-label="Supplier quote">
      <div className="supplier-quote-heading">
        <h3>Supplier quote</h3>
        <span className="supplier-quote-badge">Demo data</span>
      </div>
      <p className="supplier-quote-description">
        Update the price and delivery time for this option.
      </p>
      <div className="supplier-quote-actions">
        <button
          className="supplier-quote-primary"
          disabled={!optionId || state === "loading"}
          onClick={() => void refresh()}
        >
          {state === "loading"
            ? "Getting quote…"
            : state === "error"
              ? "Retry quote"
              : "Update quote"}
        </button>
        <button
          className="supplier-quote-secondary"
          disabled={!optionId || state === "loading"}
          onClick={() => void refresh(true)}
        >
          Test outage
        </button>
      </div>
      {message && (
        <p className={`supplier-quote-status ${state}`} role="status">
          {message}
        </p>
      )}
    </section>
  );
}
