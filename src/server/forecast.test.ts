import assert from "node:assert/strict";
import test from "node:test";
import { analyze, summary } from "./forecast.js";
import type {
  ForecastInputs,
  RenovationData,
  TaskForecast,
} from "../shared/types.js";

test("scheduling and costs consume projected durations, delivery and costs", () => {
  const data: RenovationData = {
    renovation: {
      id: "p",
      name: "P",
      status: "PLANNING",
      startDate: "2026-01-01",
    },
    nodes: [
      {
        id: "A",
        renovationId: "p",
        type: "TASK",
        name: "A",
        status: "PLANNED",
        durationDays: 100,
        estimatedCost: 999,
      },
      {
        id: "B",
        renovationId: "p",
        type: "TASK",
        name: "B",
        status: "PLANNED",
        durationDays: 100,
        estimatedCost: 999,
      },
      {
        id: "M",
        renovationId: "p",
        type: "MATERIAL",
        name: "M",
        status: "PLANNED",
        estimatedCost: 999,
      },
    ],
    relationships: [
      {
        id: "e1",
        renovationId: "p",
        fromNodeId: "B",
        toNodeId: "A",
        type: "DEPENDS_ON",
      },
      {
        id: "e2",
        renovationId: "p",
        fromNodeId: "A",
        toNodeId: "M",
        type: "REQUIRES_MATERIAL",
      },
    ],
  };
  const task = (effectiveDuration: number): TaskForecast => ({
    status: "READY",
    plannedDuration: 100,
    actualDuration: null,
    delayDays: 0,
    effectiveDuration,
    durationVariance: 0,
    manuallyBlocked: false,
    estimatedCost: 10,
    actualCost: 5,
  });
  const inputs: ForecastInputs = {
    tasks: { A: task(3), B: task(2) },
    materials: {
      M: {
        materialId: "M",
        materialName: "M",
        selectedOptionId: "x",
        selectedOptionLabel: "X",
        available: true,
        delivered: false,
        deliveryDays: 7,
        estimatedCost: 20,
        actualCost: 4,
      },
    },
  };
  const analysis = analyze(data, inputs);
  assert.equal(analysis.durationDays, 12);
  assert.equal(
    analysis.schedule.find((entry) => entry.nodeId === "B")?.earliestStart,
    10,
  );
  const totals = summary(data, analysis, inputs);
  assert.equal(totals.estimatedCost, 40);
  assert.equal(totals.actualCost, 14);
  assert.equal(totals.readyTasks, 2);
  assert.equal(data.nodes[0].durationDays, 100);
});
