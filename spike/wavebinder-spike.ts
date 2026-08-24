import { WaveBinder } from "wave-binder";

const customFunctions: any[] = [
  {
    name: "allDependenciesCompleted",
    implementation: (first: number, second: number) => Number(first === 1 && second === 1),
  },
];

const nodes: any[] = [
  {
    name: "demolitionCompleted",
    type: "SINGLE",
    path: "/demolitionCompleted",
    la: { type: "USER_SELECTION" },
    defaultValue: 0,
    dep: [],
  },
  {
    name: "plumbingCompleted",
    type: "SINGLE",
    path: "/plumbingCompleted",
    la: { type: "USER_SELECTION" },
    defaultValue: 0,
    dep: [],
  },
  {
    name: "waterproofingReady",
    type: "SINGLE",
    path: "/waterproofingReady",
    la: { type: "CUSTOM_FUNCTION", functionName: "allDependenciesCompleted" },
    dep: [
      {
        nodeName: "demolitionCompleted",
        parameterName: "demolition",
        isOptional: false,
        onUpdate: true,
      },
      {
        nodeName: "plumbingCompleted",
        parameterName: "plumbing",
        isOptional: false,
        onUpdate: true,
      },
    ],
  },
];

const license = process.env.WAVEBINDER_LICENSE
  ? JSON.parse(process.env.WAVEBINDER_LICENSE)
  : {
    payload: {
      customer: "Renograph",
      licenseId: "spike",
      features: ["spike"],
      expiry: "2099-12-31T00:00:00.000Z",
    },
    payloadRaw: "renograph-spike",
    signature: "",
  };

const binder = new WaveBinder(license, nodes, new Map(), customFunctions);
binder.tangleNodes();

await binder.waitUntilReady().catch(() => undefined);

if (!binder.isReady()) {
  console.log(JSON.stringify({
    blocked: true,
    reason: "Wavebinder rejected the spike license. Set WAVEBINDER_LICENSE to the contest-issued license JSON.",
  }, null, 2));
  binder.nukeNodes();
  process.exit(0);
}

const demolition = binder.getNodeByName("demolitionCompleted");
const plumbing = binder.getNodeByName("plumbingCompleted");
const waterproofing = binder.getNodeByName("waterproofingReady");

const values: unknown[] = [];
const subscription = waterproofing.subscribe((value: unknown) => values.push(value));

demolition.next(1);
plumbing.next(1);

const finalValue = waterproofing.getNodeValue();
const snapshot = binder.getDataPool();

if (finalValue !== 1 || snapshot.waterproofingReady !== 1) {
  throw new Error("Wavebinder did not propagate both upstream completions to the derived node.");
}

console.log(JSON.stringify({
  propagation: {
    values,
    finalValue,
    snapshot,
  },
  api: {
    ready: binder.isReady(),
    nodeCount: binder.getNodes().length,
    supportsTeardown: typeof binder.nukeNodes === "function",
  },
}, null, 2));

subscription.unsubscribe();
binder.nukeNodes();
