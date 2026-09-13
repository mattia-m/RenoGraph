import "./env.js";
import { WaveBinder } from "wave-binder";
export interface SupplierQuote {
  optionId: string;
  deliveryDays: number;
  estimatedCost: number;
  available: boolean;
  source: string;
}
type Proto = ConstructorParameters<typeof WaveBinder>[1][number];
// One disposable GET runtime per request: the pinned library does not cancel prior HTTP loads.
// The store additionally rejects stale results before touching its persistent forecast facts.
export async function loadSupplierQuote(
  baseUrl: string,
  optionId: string,
  fail = false,
  signal?: AbortSignal,
): Promise<SupplierQuote> {
  const raw = process.env.WAVEBINDER_LICENSE;
  if (!raw) throw new Error("WAVEBINDER_LICENSE is required");
  const binder = new WaveBinder(
    JSON.parse(raw),
    [
      {
        name: "supplier_quote",
        path: "/supplier_quote",
        type: "SINGLE",
        dep: [],
        la: {
          type: "GET" as Proto["la"]["type"],
          addr: `/api/supplier-fixture/${encodeURIComponent(optionId)}${fail ? "?fail=1" : ""}`,
          service: { target: baseUrl, secure: false },
        },
      },
    ],
    new Map(),
    [],
  );
  let subscription: { unsubscribe(): void } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    if (signal?.aborted) throw new Error("SUPPLIER_CANCELLED");
    binder.tangleNodes();
    await binder.waitUntilReady();
    if (signal?.aborted) throw new Error("SUPPLIER_CANCELLED");
    return await new Promise<SupplierQuote>((resolve, reject) => {
      abort = () => reject(new Error("SUPPLIER_CANCELLED"));
      signal?.addEventListener("abort", abort, { once: true });
      timer = setTimeout(
        () => reject(new Error("SUPPLIER_UNAVAILABLE_RETRY")),
        5000,
      );
      subscription = binder
        .getNodeByName("supplier_quote")
        .subscribe((value: unknown) => {
          if (value == null) return;
          const quote = value as Partial<SupplierQuote>;
          if (
            quote.optionId !== optionId ||
            !Number.isFinite(quote.deliveryDays) ||
            quote.deliveryDays! < 0 ||
            !Number.isFinite(quote.estimatedCost) ||
            quote.estimatedCost! < 0 ||
            typeof quote.available !== "boolean" ||
            typeof quote.source !== "string"
          ) {
            reject(new Error("SUPPLIER_INVALID_RESPONSE"));
            return;
          }
          resolve(structuredClone(quote as SupplierQuote));
        });
    });
  } finally {
    if (timer) clearTimeout(timer);
    if (abort) signal?.removeEventListener("abort", abort);
    subscription?.unsubscribe();
    binder.nukeNodes();
  }
}
