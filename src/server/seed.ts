import type { RenovationData, RenovationNode, Relationship } from "../shared/types.js";

const renovationId = "casa-rossi";
const rooms = [
  ["apartment", "Apartment", 30, 30],
  ["bathroom", "Bathroom", 300, 80],
  ["kitchen", "Kitchen", 620, 80],
  ["living-room", "Living room", 940, 80],
] as const;

const taskDefinitions = [
  ["bathroom-demolition", "Bathroom demolition", "bathroom", 2, 850, "COMPLETED"],
  ["bathroom-plumbing", "Bathroom plumbing", "bathroom", 4, 2100, "PLANNED"],
  ["bathroom-electrical", "Bathroom electrical", "bathroom", 3, 1400, "PLANNED"],
  ["bathroom-waterproofing", "Waterproofing", "bathroom", 2, 900, "PLANNED"],
  ["bathroom-tiling", "Bathroom tiling", "bathroom", 3, 1500, "PLANNED"],
  ["bathroom-grouting", "Grouting", "bathroom", 1, 450, "PLANNED"],
  ["bathroom-fixtures", "Install fixtures", "bathroom", 2, 1100, "PLANNED"],
  ["kitchen-demolition", "Kitchen demolition", "kitchen", 2, 900, "PLANNED"],
  ["kitchen-plumbing", "Kitchen plumbing", "kitchen", 3, 1600, "PLANNED"],
  ["kitchen-electrical", "Kitchen electrical", "kitchen", 3, 1300, "PLANNED"],
  ["kitchen-flooring", "Kitchen flooring", "kitchen", 4, 2200, "PLANNED"],
  ["kitchen-painting", "Kitchen painting", "kitchen", 2, 800, "PLANNED"],
  ["kitchen-installation", "Kitchen installation", "kitchen", 3, 3200, "PLANNED"],
  ["living-electrical", "Living room electrical", "living-room", 3, 1250, "PLANNED"],
  ["living-plastering", "Living room plastering", "living-room", 4, 1900, "PLANNED"],
  ["living-flooring", "Living room flooring", "living-room", 4, 2600, "PLANNED"],
  ["living-painting", "Living room painting", "living-room", 3, 1050, "PLANNED"],
  ["windows", "Replace windows", "apartment", 5, 4800, "PLANNED"],
  ["heating", "Heating upgrade", "apartment", 4, 3600, "PLANNED"],
  ["final-painting", "Final painting", "apartment", 3, 1800, "PLANNED"],
  ["final-inspection", "Final inspection", "apartment", 1, 300, "PLANNED"],
] as const;

const materialDefinitions = [
  ["bathroom-tiles", "Bathroom tiles", "bathroom", "BLOCKED"],
  ["bathroom-fixtures-material", "Bathroom fixtures", "bathroom", "COMPLETED"],
  ["kitchen-tiles", "Kitchen tiles", "kitchen", "COMPLETED"],
  ["kitchen-cabinets", "Kitchen cabinets", "kitchen", "BLOCKED"],
  ["flooring-material", "Oak flooring", "living-room", "COMPLETED"],
  ["paint-material", "Interior paint", "apartment", "COMPLETED"],
  ["window-material", "Window units", "apartment", "BLOCKED"],
  ["heating-material", "Heating equipment", "apartment", "COMPLETED"],
] as const;

function materialOptions(id: string, index: number) {
  const express = id === "bathroom-tiles";
  return [
    { id: "standard", label: "Standard", deliveryDays: express ? 14 : 5, estimatedCost: 500 + index * 85, available: !express },
    { id: "express", label: "Express delivery", deliveryDays: 2, estimatedCost: 650 + index * 85, available: express },
    { id: "premium", label: "Premium finish", deliveryDays: 9, estimatedCost: 950 + index * 85, available: false },
  ];
}

export function createDemoData(): RenovationData {
  const nodes: RenovationNode[] = [
    ...rooms.map(([id, name, x, y]) => ({ id, renovationId, type: "ROOM" as const, name, status: "PLANNED" as const, position: { x, y } })),
    ...taskDefinitions.map(([id, name, room, durationDays, estimatedCost, status], index) => ({
      id, renovationId, type: "TASK" as const, name, status: status as RenovationNode["status"], durationDays, estimatedCost,
      description: `Renovation work package for ${name.toLowerCase()}.`,
      position: { x: 80 + (index % 7) * 230, y: 210 + Math.floor(index / 7) * 180 },
    })),
    ...materialDefinitions.map(([id, name, room, status], index) => ({
      id, renovationId, type: "MATERIAL" as const, name, status: status as RenovationNode["status"], estimatedCost: materialOptions(id, index)[0].estimatedCost,
      options: materialOptions(id, index), selectedOptionId: "standard",
      description: `Required material: ${name.toLowerCase()}.`,
      position: { x: 80 + index * 230, y: 820 },
    })),
  ];
  const relationships: Relationship[] = [];
  let edge = 1;
  const depends = (fromNodeId: string, toNodeId: string) => relationships.push({ id: `edge-${edge++}`, renovationId, fromNodeId, toNodeId, type: "DEPENDS_ON" });
  const located = (task: string, room: string) => relationships.push({ id: `edge-${edge++}`, renovationId, fromNodeId: task, toNodeId: room, type: "LOCATED_IN" });
  const requires = (task: string, material: string) => relationships.push({ id: `edge-${edge++}`, renovationId, fromNodeId: task, toNodeId: material, type: "REQUIRES_MATERIAL" });
  taskDefinitions.forEach(([id, , room]) => located(id, room));
  [
    ["bathroom-plumbing", "bathroom-demolition"], ["bathroom-electrical", "bathroom-demolition"], ["bathroom-waterproofing", "bathroom-plumbing"],
    ["bathroom-waterproofing", "bathroom-electrical"], ["bathroom-tiling", "bathroom-waterproofing"], ["bathroom-grouting", "bathroom-tiling"], ["bathroom-fixtures", "bathroom-grouting"],
    ["kitchen-plumbing", "kitchen-demolition"], ["kitchen-electrical", "kitchen-demolition"], ["kitchen-flooring", "kitchen-demolition"], ["kitchen-painting", "kitchen-electrical"], ["kitchen-installation", "kitchen-flooring"], ["kitchen-installation", "kitchen-plumbing"], ["kitchen-installation", "kitchen-painting"],
    ["living-plastering", "living-electrical"], ["living-flooring", "living-plastering"], ["living-painting", "living-flooring"],
    ["final-painting", "living-painting"], ["final-painting", "kitchen-painting"], ["final-painting", "bathroom-fixtures"], ["final-inspection", "final-painting"], ["final-inspection", "windows"], ["final-inspection", "heating"],
  ].forEach(([from, to]) => depends(from, to));
  [
    ["bathroom-tiling", "bathroom-tiles"], ["bathroom-fixtures", "bathroom-fixtures-material"], ["kitchen-installation", "kitchen-cabinets"], ["kitchen-flooring", "kitchen-tiles"], ["living-flooring", "flooring-material"], ["final-painting", "paint-material"], ["windows", "window-material"], ["heating", "heating-material"],
  ].forEach(([task, material]) => requires(task, material));
  return {
    renovation: { id: renovationId, name: "Casa Rossi", startDate: "2026-09-08", targetEndDate: "2026-09-30", budget: 25000, status: "IN_PROGRESS" },
    nodes,
    relationships,
  };
}
