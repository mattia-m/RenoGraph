export type NodeType = "ROOM" | "TASK" | "MATERIAL";
export type NodeStatus = "PLANNED" | "READY" | "IN_PROGRESS" | "COMPLETED" | "BLOCKED";
export type RelationshipType = "DEPENDS_ON" | "LOCATED_IN" | "REQUIRES_MATERIAL";

export interface Renovation {
  id: string;
  name: string;
  startDate: string;
  targetEndDate?: string;
  budget?: number;
  status: "PLANNING" | "IN_PROGRESS" | "COMPLETED";
}

export interface RenovationNode {
  id: string;
  renovationId: string;
  type: NodeType;
  name: string;
  description?: string;
  status: NodeStatus;
  durationDays?: number;
  estimatedCost?: number;
  actualCost?: number;
  actualDurationDays?: number;
  delayDays?: number;
  manualBlocker?: string;
  plannedStart?: string;
  plannedEnd?: string;
  position?: { x: number; y: number };
  options?: MaterialOption[];
  selectedOptionId?: string;
}

export interface Professional {
  id: string;
  name: string;
  trade: string;
  availableFromDay: number;
  availableToDay?: number;
}

export interface TaskAssignment { id: string; taskId: string; professionalId: string; }
export interface Contractor { id: string; name: string; trade: string; contact?: string; }
export interface Purchase { id: string; description: string; status: "REQUESTED" | "ORDERED" | "RECEIVED"; amount: number; materialId?: string; contractorId?: string; }
export interface ProjectDocument { id: string; name: string; kind: "QUOTE" | "CONTRACT" | "PERMIT" | "INVOICE" | "OTHER"; nodeId?: string; contractorId?: string; reference?: string; }

export interface MaterialOption {
  id: string;
  label: string;
  deliveryDays: number;
  estimatedCost: number;
  available: boolean;
}

export interface RoomMaterialRequirement {
  materialId: string;
  materialName: string;
  selectedOptionId: string;
  selectedOptionLabel: string;
  available: boolean;
  delivered: boolean;
  deliveryDays: number;
  estimatedCost: number;
  requiredByTaskIds: string[];
}

export interface Relationship {
  id: string;
  renovationId: string;
  fromNodeId: string;
  toNodeId: string;
  type: RelationshipType;
}

export interface RenovationData {
  renovation: Renovation;
  nodes: RenovationNode[];
  relationships: Relationship[];
  professionals?: Professional[];
  assignments?: TaskAssignment[];
  contractors?: Contractor[];
  purchases?: Purchase[];
  documents?: ProjectDocument[];
}

export interface ScheduleEntry {
  nodeId: string;
  earliestStart: number;
  earliestFinish: number;
  latestStart: number;
  latestFinish: number;
  slack: number;
  critical: boolean;
  materialReadyDay: number;
  materialConstraints: Array<{ materialId: string; deliveryDays: number }>;
  effectiveDurationDays: number;
  resourceReadyDay: number;
  resourceDelayDays: number;
  professionalIds: string[];
}

export interface Analysis {
  schedule: ScheduleEntry[];
  durationDays: number;
  criticalPath: string[];
  completionDate: string;
  resourceConflicts: Array<{ professionalId: string; taskIds: string[]; delayedTaskId: string; delayDays: number }>;
}

export interface ProjectListItem { id: string; name: string; startDate: string; status: Renovation["status"]; completionDate: string; progress: number; }

export interface BlockerExplanation {
  nodeId: string;
  status: "BLOCKED" | "READY";
  blockedBy: string[];
  rootBlockers: string[];
}

export interface GraphNode extends RenovationNode {
  label: string;
  critical: boolean;
  blockedBy?: string[];
  rootBlockers?: string[];
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: Array<Relationship & { source: string; target: string; critical: boolean }>;
  analysis: Analysis;
  runtime?: {
    ready: boolean;
    nodeCount: number;
    dependencyCount: number;
    derivedNodeCount: number;
    complexNodeCount: number;
    multiNodeCount: number;
    listNodeCount: number;
    subscriptionCount: number;
    instanceId: string;
    role: "baseline" | "scenario";
    createdAt: string;
    rebuildCount: number;
    eventCount: number;
    lastEvent?: string;
    dataPool: Record<string, unknown>;
    canUndo?: boolean;
  };
}

export interface Summary {
  progress: number;
  budget?: number;
  estimatedCost: number;
  actualCost: number;
  completionDate: string;
  readyTasks: number;
  blockedTasks: number;
  criticalPathDurationDays: number;
  totalTasks: number;
}

export interface ScenarioChange {
  nodeId: string;
  durationDeltaDays?: number;
  newDurationDays?: number;
  newStatus?: NodeStatus;
  estimatedCostDelta?: number;
  deliveryDeltaDays?: number;
  newDeliveryDays?: number;
}

export interface ScenarioResult {
  scenario: string;
  baseline: { completionDate: string; estimatedCost: number };
  scenarioResult: { completionDate: string; estimatedCost: number };
  impact: { delayDays: number; additionalCost: number; criticalPathChanged: boolean };
  affectedNodes: Array<{ id: string; name: string; scheduleDeltaDays: number }>;
  affectedChain: string[];
  graph: GraphResponse;
}
