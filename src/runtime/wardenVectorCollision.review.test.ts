import { CONTINUITY_TIMEOUT_MS, createJudgeGate, defaultJudgeSettings, PAIR_JACCARD_FLOOR, type JudgeRequest, type JudgeResponse } from "@judge/index";
import { buildJaccardMatchSets, DEFAULT_DEDUP_THRESHOLDS, type MemoryEntry } from "@memory/index";
import { buildConsolidationMatches } from "./consolidationMatches";
import type { VectorHost } from "./hostPorts";
import { JudgeRuntime } from "./judge";
import { VECTOR_INSERT_CHUNK, yieldingVectorHost, type VectorQuiet } from "./vectorYield";
import { testOwnership } from "../../test/findings/testOwnership";

const wardenRequest: JudgeRequest = { state: { reply: "x" }, questions: { contradicts: { type: "noul", instructions: "Does `reply` contradict a fact?" } } };

const heldTransport = () => {
  const pending: Array<() => void> = [];
  const transport = (_request: JudgeRequest): Promise<JudgeResponse> => new Promise((resolve) => {
    pending.push(() => resolve({ model: "jev-1.13.0", answers: { contradicts: { type: "noul", noul: 0.1 } } }));
  });
  return { pending, transport };
};

const runtimeOver = (transport: (request: JudgeRequest) => Promise<JudgeResponse>) => new JudgeRuntime({
  getSettings: () => ({ ...defaultJudgeSettings(), enabled: true }),
  transport,
  status: async () => ({ configured: true, maxInFlight: 2 }),
  record: () => undefined,
  context: () => ({ boundary: 0, messageId: 0 }),
  ownership: testOwnership(),
  gate: createJudgeGate({ retryMs: 1 }),
});

const recordingHost = () => {
  const requests: string[] = [];
  const host: VectorHost = {
    source: "transformers",
    capabilityState: async () => "present",
    vectorInsert: async (_collection, items) => { requests.push(`insert:${items.length}`); },
    vectorQuery: async () => { requests.push("query"); return []; },
    vectorPurge: async () => { requests.push("purge"); },
  };
  return { requests, host };
};

const group = (size: number): MemoryEntry[] => Array.from({ length: size }, (_, index) => ({ id: `m${index}`, text: `the north gate fact ${index}`, type: "fact", tier: "facts", createdAt: index }) as unknown as MemoryEntry);

const flush = async () => {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
};

describe("F-B1c-2: consolidation's vector work never runs on ST's server while a judge call is open", () => {
  it("holds every vector request while a warden call is open, and sends them once it settles", async () => {
    const judge = heldTransport();
    const runtime = runtimeOver(judge.transport);
    const { requests, host } = recordingHost();
    const yielding = yieldingVectorHost(host, () => () => runtime.whenIdle(60_000));
    const warden = runtime.ask("warden", wardenRequest, { timeoutMs: CONTINUITY_TIMEOUT_MS });
    await flush();
    const consolidation = buildConsolidationMatches(yielding, group(9), PAIR_JACCARD_FLOOR);
    await flush();
    expect(judge.pending).toHaveLength(1);
    expect(requests).toEqual([]);
    judge.pending[0]();
    expect((await warden).answers).not.toBeNull();
    await consolidation;
    expect(requests.filter((request) => request.startsWith("insert"))).toEqual(["insert:4", "insert:4", "insert:1"]);
    expect(requests.filter((request) => request === "query")).toHaveLength(27);
  });

  it("control: with nothing to yield to, the same consolidation goes to the server while the warden call is still open", async () => {
    const judge = heldTransport();
    const runtime = runtimeOver(judge.transport);
    const { requests, host } = recordingHost();
    const warden = runtime.ask("warden", wardenRequest, { timeoutMs: CONTINUITY_TIMEOUT_MS });
    await flush();
    await buildConsolidationMatches(host, group(9), PAIR_JACCARD_FLOOR);
    expect(judge.pending).toHaveLength(1);
    expect(requests[0]).toBe("insert:9");
    judge.pending[0]();
    await warden;
  });

  it("a judge call that opens mid-consolidation holds the next vector request, never one already sent", async () => {
    const judge = heldTransport();
    const runtime = runtimeOver(judge.transport);
    const { requests, host } = recordingHost();
    let opened: Promise<unknown> | null = null;
    const watching: VectorHost = {
      ...host,
      vectorInsert: async (collection, items, source) => {
        await host.vectorInsert(collection, items, source);
        if (!opened) opened = runtime.ask("warden", wardenRequest, { timeoutMs: CONTINUITY_TIMEOUT_MS });
      },
    };
    const consolidation = buildConsolidationMatches(yieldingVectorHost(watching, () => () => runtime.whenIdle(60_000)), group(9), null);
    for (let index = 0; index < 5 && !judge.pending.length; index += 1) await flush();
    await flush();
    expect(requests).toEqual(["insert:4"]);
    judge.pending[0]();
    await opened;
    await consolidation;
    expect(requests.filter((request) => request.startsWith("insert"))).toEqual(["insert:4", "insert:4", "insert:1"]);
  });

  it("waits no longer than the bound when a judge call never settles", async () => {
    jest.useFakeTimers();
    try {
      const judge = heldTransport();
      const runtime = runtimeOver(judge.transport);
      void runtime.ask("warden", wardenRequest, { timeoutMs: 600_000 });
      await flush();
      let idle: boolean | null = null;
      void runtime.whenIdle(15_000).then((value) => { idle = value; });
      jest.advanceTimersByTime(14_999);
      await flush();
      expect(idle).toBeNull();
      jest.advanceTimersByTime(1);
      await flush();
      expect(idle).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it("answers at once when no judge call is open", async () => {
    const runtime = runtimeOver(heldTransport().transport);
    await expect(runtime.whenIdle(15_000)).resolves.toBe(true);
  });
});

describe("F-B1c-2: one embedding pass per consolidation group", () => {
  it("vectors: the judged walk's wider candidates reuse the same embedding pass (one insert, 3 queries an entry)", async () => {
    const { requests, host } = recordingHost();
    const result = await buildConsolidationMatches(host, group(9), PAIR_JACCARD_FLOOR);
    expect(requests.filter((request) => request.startsWith("insert"))).toEqual(["insert:9"]);
    expect(requests.filter((request) => request === "query")).toHaveLength(27);
    expect(result.wider).toBe(result.matches);
  });

  it("no vectors: the wider candidates are still the lower Jaccard band", async () => {
    const { requests, host } = recordingHost();
    const absent: VectorHost = { ...host, capabilityState: async () => "absent" };
    const entries = group(9);
    const result = await buildConsolidationMatches(absent, entries, PAIR_JACCARD_FLOOR);
    expect(requests).toEqual([]);
    expect(result.matches).toEqual(buildJaccardMatchSets(entries, DEFAULT_DEDUP_THRESHOLDS));
    expect(result.wider).toEqual(buildJaccardMatchSets(entries, { ...DEFAULT_DEDUP_THRESHOLDS, jaccardSameTopic: PAIR_JACCARD_FLOOR }));
    const unjudged = await buildConsolidationMatches(absent, entries, null);
    expect(unjudged.wider).toBe(unjudged.matches);
  });

  it("a failing vectors API falls back to Jaccard for both sets", async () => {
    const { host } = recordingHost();
    const failing: VectorHost = { ...host, vectorInsert: async () => { throw new Error("vector insert failed: 500"); } };
    const entries = group(9);
    const result = await buildConsolidationMatches(failing, entries, PAIR_JACCARD_FLOOR);
    expect(result.matches).toEqual(buildJaccardMatchSets(entries, DEFAULT_DEDUP_THRESHOLDS));
    expect(result.wider).toEqual(buildJaccardMatchSets(entries, { ...DEFAULT_DEDUP_THRESHOLDS, jaccardSameTopic: PAIR_JACCARD_FLOOR }));
  });
});

describe("yieldingVectorHost", () => {
  it("splits an insert into chunks of VECTOR_INSERT_CHUNK and settles before each request; purge and the capability probe are not held", async () => {
    const { requests, host } = recordingHost();
    const waits: string[] = [];
    const quiet: VectorQuiet = async () => { waits.push(`wait-before-${requests.length}`); };
    const yielding = yieldingVectorHost(host, () => quiet);
    await yielding.vectorInsert("c", Array.from({ length: VECTOR_INSERT_CHUNK * 2 + 1 }, (_, index) => ({ hash: index, text: `t${index}`, index })), "transformers");
    await yielding.vectorQuery("c", "t0", 5, 0.5, "transformers");
    await yielding.vectorPurge("c");
    await yielding.capabilityState("vectors");
    expect(requests).toEqual([`insert:${VECTOR_INSERT_CHUNK}`, `insert:${VECTOR_INSERT_CHUNK}`, "insert:1", "query", "purge"]);
    expect(waits).toEqual(["wait-before-0", "wait-before-1", "wait-before-2", "wait-before-3"]);
  });

  it("an empty insert sends nothing", async () => {
    const { requests, host } = recordingHost();
    await yieldingVectorHost(host, () => null).vectorInsert("c", [], "transformers");
    expect(requests).toEqual([]);
  });
});
