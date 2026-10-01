import { StoryEngine, parseStoryV2OrThrow } from "@engine/index";
import { callExtractionReply } from "@extraction/client";
import { ModelCallError } from "@extraction/modelError";
import { viaReply } from "../../test/support/modelCall";
import { runSharedRead } from "@extraction/sharedRead";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null, getContext: () => ({ chat: [], extensionSettings: {} }) }));
jest.mock("@extraction/client", () => ({ ...jest.requireActual("@extraction/client"), callExtractionReply: jest.fn() }));

const story = () => parseStoryV2OrThrow({
  format: 2,
  id: "finish-reason",
  title: "Finish reason",
  description: "v2.4 plan 03 D6",
  qualities: [{ key: "crossed", type: "bool", source: "extractor", rubric: "Crossed?" }],
  checkpoints: [
    { id: "bank", name: "Bank", objective: "Cross", type: "anchor", start: true },
    { id: "island", name: "Island", objective: "Rest", type: "anchor" },
  ],
  transitions: [{ id: "cross", from: "bank", to: "island", priority: 0, gate: { q: "crossed", op: "==", v: true } }],
  roster: [],
});

const GOOD = 'DELTA crossed value=true evidence="crossed"\nFACT importance=2 text="The river is crossed" evidence="crossed"';

const read = async (...replies: Array<{ text: string; finish: "stop" | "length" | "unknown" } | Error>) => {
  const mock = callExtractionReply as jest.Mock;
  mock.mockReset();
  for (const reply of replies) {
    if (reply instanceof Error) mock.mockRejectedValueOnce(reply);
    else mock.mockResolvedValueOnce(reply);
  }
  const s = story();
  const engine = new StoryEngine();
  engine.loadStory(s);
  return runSharedRead({
    story: s,
    state: engine.serialize(),
    priority: 0,
    reason: "finish",
    scope: [{ quality: s.qualityByKey.crossed, key: "crossed", hints: [] }] as never,
    window: { from: 0, to: 0, messages: [{ speaker: "User", text: "crossed", id: 0 }] } as never,
    model: viaReply(callExtractionReply),
    ask: { role: "read", pass: "read" },
  });
};

describe("runSharedRead reads the finish reason (v2.4 plan 03 D6)", () => {
  it("length is refused whole, after one more ask", async () => {
    const result = await read({ text: GOOD, finish: "length" }, { text: GOOD, finish: "length" });
    expect(callExtractionReply).toHaveBeenCalledTimes(2);
    expect(result.audit.acceptedDeltas).toEqual([]);
    expect(result.audit.rejected.map((entry) => entry.reason)).toEqual(["truncated response"]);
    expect(result.facts).toEqual([]);
  });

  it("a truncated first answer is replaced by a whole second one", async () => {
    const result = await read({ text: GOOD, finish: "length" }, { text: GOOD, finish: "stop" });
    expect(result.audit.acceptedDeltas.map((entry) => entry.delta.q)).toEqual(["crossed"]);
    expect(result.facts).toHaveLength(1);
    expect(callExtractionReply).toHaveBeenNthCalledWith(2, expect.any(String), expect.anything(), expect.objectContaining({ maxTokens: 4096 }));
    expect(callExtractionReply).toHaveBeenNthCalledWith(1, expect.any(String), expect.anything(), expect.objectContaining({ maxTokens: 2048 }));
  });

  it("control: a reply that stopped on its own is read, however long it is", async () => {
    const long = `${GOOD}\n${"x".repeat(4000)}`;
    const result = await read({ text: long, finish: "stop" });
    expect(callExtractionReply).toHaveBeenCalledTimes(1);
    expect(result.audit.acceptedDeltas.map((entry) => entry.delta.q)).toEqual(["crossed"]);
  });

  it("control: with no finish reason the character heuristic still refuses an overlong reply", async () => {
    const long = `${GOOD}\n${"x".repeat(10000)}`;
    const result = await read({ text: long, finish: "unknown" }, { text: long, finish: "unknown" });
    expect(result.audit.rejected.map((entry) => entry.reason)).toContain("oversized response");
  });

  it("a degenerate loop is refused whole, never parsed into memory", async () => {
    const loop = [GOOD, ...Array.from({ length: 5 }, () => "The river is wide and cold.")].join("\n");
    const result = await read({ text: loop, finish: "stop" }, { text: loop, finish: "stop" });
    expect(result.audit.rejected.map((entry) => entry.reason)).toContain("degenerate response");
    expect(result.audit.acceptedDeltas).toEqual([]);
    expect(result.facts).toEqual([]);
  });

  it("a lapse during the re-ask is not swallowed into a refusal", async () => {
    await expect(read({ text: GOOD, finish: "length" }, new ModelCallError("lapsed", "the request was cancelled"))).rejects.toMatchObject({ kind: "lapsed" });
    expect(callExtractionReply).toHaveBeenCalledTimes(2);
  });
});
