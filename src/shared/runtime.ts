export const runtimeName = (id: string, field: string): string =>
  `${id}__${field}`;
export interface RuntimeEvent {
  nodeId: string;
  status: string;
  at: string;
  mutationId: string;
  source: string;
  kind: "FACT" | "DERIVED";
  before: unknown;
  after: unknown;
}
