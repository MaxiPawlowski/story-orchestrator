import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseStoryV2OrThrow } from "@engine/index";
import type { ChainRead } from "@judge/index";
import { callExtractionModel } from "@extraction/index";
import { generateReviewedBeats } from "./generate";
import { findStubExpansionCandidate, planExpansion } from "./planner";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null, sendConnectionProfileRequest: async (...args: unknown[]) => ({ ok: true, text: await mockSend(...args), finish: "stop" }) }));

const mockSend = jest.fn();
const send = mockSend;
const root = join(__dirname, "..", "..");
const story = parseStoryV2OrThrow(JSON.parse(readFileSync(join(root, "test/fixtures/background-generation.story.json"), "utf-8")));
const good = readFileSync(join(root, "test/goldens/background-generator1.response.txt"), "utf-8");
const input = () => planExpansion(story, { values: { key_found: false, approach: "unknown" } }, findStubExpansionCandidate(story, "start")!, "", []);
const client = { profileId: "p1" };
const chain = (patch: Partial<ChainRead> = {}): ChainRead => ({ contradicts: 0.05, advances: 0.9, newCharacter: 0.05, shape: 0.5, ...patch });

beforeEach(() => send.mockReset());

describe("extraction client temperature (v2.2 plan 07)", () => {
  it("keeps 0.1 by default and passes an explicit one through", async () => {
    send.mockResolvedValue("ok");
    await callExtractionModel("p", { profileId: "p1" });
    await callExtractionModel("p", { profileId: "p1", temperature: 0.7 });
    expect(send.mock.calls.map((call) => call[3].samplers.temperature)).toEqual([0.1, 0.7]);
  });
});

describe("judge critic (v2.2 plan 07)", () => {
  it("replaces the LLM critic when it answers, and needs review when it fails the chain", async () => {
    send.mockResolvedValue(good);
    const passed = await generateReviewedBeats(story, input(), client, { critic: async () => ({ pass: true, issues: [], raw: "JUDGE", judge: chain() }) });
    expect(passed.verdict).toMatchObject({ pass: true, raw: "JUDGE" });
    expect(passed.needsReview).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
    send.mockClear();
    const failed = await generateReviewedBeats(story, input(), client, { critic: async () => ({ pass: false, issues: ["x"], raw: "JUDGE" }) });
    expect(failed.needsReview).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("falls back to today's LLM critic when the judge gives no answer", async () => {
    send.mockResolvedValueOnce(good).mockResolvedValueOnce('{"pass": true, "issues": []}');
    const result = await generateReviewedBeats(story, input(), client, { critic: async () => null });
    expect(send).toHaveBeenCalledTimes(2);
    expect(result.verdict.raw).not.toBe("JUDGE");
  });
});

describe("variants (v2.2 plan 07)", () => {
  const variants = (reads: Array<ChainRead | null>, pick: "code" | "llm" = "code") => {
    let call = 0;
    return { n: reads.length, temperature: 0.7, pick, read: async () => reads[call++] ?? null };
  };

  it("generates N chains one at a time at the variant temperature, and code picks the best passing one", async () => {
    send.mockResolvedValue(good);
    const result = await generateReviewedBeats(story, input(), client, { variants: variants([chain({ advances: 0.6 }), chain({ advances: 0.95 }), chain({ contradicts: 0.9, advances: 1 })]) });
    expect(send.mock.calls.map((call) => call[3].samplers.temperature)).toEqual([0.7, 0.7, 0.7]);
    expect(result.variants).toMatchObject({ generated: 3, survivors: 3, picked: 1, picker: "code" });
    expect(result.variants?.timesMs).toHaveLength(3);
    expect(result.verdict).toMatchObject({ pass: true, raw: "JUDGE" });
  });

  it("asks the LLM between the judge's top two in llm mode, and keeps the code pick when it cannot parse", async () => {
    send.mockResolvedValueOnce(good).mockResolvedValueOnce(good).mockResolvedValueOnce("PICK: B");
    const llm = await generateReviewedBeats(story, input(), client, { variants: variants([chain({ advances: 0.95 }), chain({ advances: 0.6 })], "llm") });
    expect(llm.variants).toMatchObject({ picked: 1, picker: "llm" });
    send.mockReset();
    send.mockResolvedValueOnce(good).mockResolvedValueOnce(good).mockResolvedValueOnce("both are fine");
    const fallback = await generateReviewedBeats(story, input(), client, { variants: variants([chain({ advances: 0.95 }), chain({ advances: 0.6 })], "llm") });
    expect(fallback.variants).toMatchObject({ picked: 0, picker: "code", pickFallback: "llm" });
  });

  it("needs review when no chain passes the judge, and runs today's LLM critic when the judge is down", async () => {
    send.mockResolvedValue(good);
    const rejected = await generateReviewedBeats(story, input(), client, { variants: variants([chain({ contradicts: 0.9 }), chain({ newCharacter: 0.9, advances: 0.95 })]) });
    expect(rejected.needsReview).toBe(true);
    expect(rejected.variants?.picked).toBe(1);
    send.mockReset();
    send.mockResolvedValueOnce(good).mockResolvedValueOnce(good).mockResolvedValueOnce('{"pass": true, "issues": []}');
    const down = await generateReviewedBeats(story, input(), client, { variants: variants([null, null]) });
    expect(down.variants).toMatchObject({ picked: 0, pickFallback: "judge" });
    expect(down.verdict.raw).not.toBe("JUDGE");
  });

  it("keeps today's failure path when no chain survives the code checks", async () => {
    send.mockResolvedValue("not json");
    const result = await generateReviewedBeats(story, input(), client, { variants: variants([chain(), chain()]) });
    expect(result.needsReview).toBe(true);
    expect(result.variants).toMatchObject({ generated: 2, survivors: 0, picked: null });
  });
});
