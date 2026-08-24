import { WaveBinder, MultiNode, ComplexNode } from "wave-binder";

const binder = new WaveBinder(JSON.parse(process.env.WAVEBINDER_LICENSE ?? "{}"), [
  {
    name: "tileOptions",
    type: "MULTI",
    path: "/tileOptions",
    la: { type: "CUSTOM_FUNCTION", functionName: "options" },
    dep: [],
  },
  {
    name: "taskState",
    type: "COMPLEX",
    path: "/taskState",
    la: { type: "CUSTOM_FUNCTION", functionName: "state" },
    dep: [],
    protos: [
      { name: "status", type: "SINGLE", path: "/status", la: { type: "USER_SELECTION" }, dep: [] },
      { name: "duration", type: "SINGLE", path: "/duration", la: { type: "USER_SELECTION" }, dep: [] },
    ],
  },
 ] as any, new Map(), [
  { name: "options", implementation: () => [{ id: "standard", label: "Standard", days: 7 }, { id: "premium", label: "Premium", days: 14 }] },
  { name: "state", implementation: () => ({ status: "READY", duration: 3 }) },
]);
binder.tangleNodes();
await binder.waitUntilReady();
const options = binder.getNodeByName("tileOptions") as MultiNode;
const state = binder.getNodeByName("taskState") as ComplexNode;
options.setSelection(1);
console.log(JSON.stringify({ options: options.choices, value: options.getNodeValue(), selection: options.selection, state: state.getNodeValue(), fields: state.fields.map((field) => (field as any).node.name) }, null, 2));
binder.nukeNodes();
