import { parseStoryOrThrow } from "@engine/index";
import { appendSequenceBreakers } from "@utils/samplerKeys";
import { DRY_NAMES_APPLIED, DRY_NAMES_CAPPED, dryBreakerNames, dryNamesHandler, type DryNamesDeps } from "./dryNames";
import type { SamplerRequest } from "./samplerOverlay";

const story = parseStoryOrThrow({
  id: "dock", title: "Dock", description: "",
  qualities: [{ key: "done", type: "bool", source: "extractor", rubric: "Done?" }],
  checkpoints: [{ id: "a", name: "A", objective: "", type: "anchor", start: true }],
  transitions: [],
  roster: [{ id: "mara", name: "Mara Vey" }, { id: "bram", name: "Bram", aliases: ["the Smith"] }],
});

const loud: SamplerRequest = { api: "textgen", chatId: "c1", type: null, dryRun: false, open: true, innermost: "normal" };

const harness = (overrides: Partial<DryNamesDeps> = {}) => {
  const journal: string[] = [];
  const handle = dryNamesHandler({
    enabled: () => true, storyChat: () => "c1", story: () => story, player: () => "Max", drafted: () => null, onStage: () => [],
    journal: (summary) => { journal.push(summary); }, ...overrides,
  });
  return { handle, journal };
};

describe("DRY name breakers", () => {
  it("names the cast's full and given names, aliases and the player; the drafted member, the player, then the stage first", () => {
    expect(dryBreakerNames(story, "Max")).toEqual(["Max", "Mara Vey", "Mara", "Vey", "Bram", "the Smith"]);
    expect(dryBreakerNames(story, "Max", "Bram", ["Mara Vey"])).toEqual(["Bram", "the Smith", "Max", "Mara Vey", "Mara", "Vey"]);
  });

  it("appends to an array breaker list and never replaces what the preset sent", () => {
    const payload: Record<string, unknown> = { dry_sequence_breakers: ["\n", ":", "Bram"] };
    const { handle, journal } = harness();
    expect(handle(payload, loud)).toEqual(["Max", "Mara Vey", "Mara", "Vey", "the Smith"]);
    expect(payload.dry_sequence_breakers).toEqual(["\n", ":", "Bram", "Max", "Mara Vey", "Mara", "Vey", "the Smith"]);
    expect(journal).toEqual([DRY_NAMES_APPLIED]);
  });

  it("is idempotent and keeps a JSON string list a JSON string", () => {
    const payload: Record<string, unknown> = { dry_sequence_breakers: "[\"\\n\", \"*\"]" };
    const { handle } = harness();
    handle(payload, loud);
    const once = payload.dry_sequence_breakers;
    expect(handle(payload, loud)).toEqual([]);
    expect(payload.dry_sequence_breakers).toBe(once);
    expect(JSON.parse(String(once))).toEqual(["\n", "*", "Max", "Mara Vey", "Mara", "Vey", "Bram", "the Smith"]);
  });

  it("leaves a request without the key, a quiet or dry-run request, another chat, chat completion, or the switch off alone", () => {
    const cases: Array<[Record<string, unknown>, SamplerRequest, Partial<DryNamesDeps>]> = [
      [{ temperature: 1 }, loud, {}],
      [{ dry_sequence_breakers: [] }, { ...loud, type: "quiet" }, {}],
      [{ dry_sequence_breakers: [] }, { ...loud, dryRun: true }, {}],
      [{ dry_sequence_breakers: [] }, { ...loud, chatId: "c2" }, {}],
      [{ dry_sequence_breakers: [] }, { ...loud, api: "chat" }, {}],
      [{ dry_sequence_breakers: [] }, loud, { enabled: () => false }],
    ];
    for (const [payload, request, overrides] of cases) {
      const before = JSON.stringify(payload);
      expect(harness(overrides).handle(payload, request)).toEqual([]);
      expect(JSON.stringify(payload)).toBe(before);
    }
  });

  it("refuses a comma list it cannot parse instead of guessing", () => {
    const payload: Record<string, unknown> = { dry_sequence_breakers: "a,b" };
    expect(appendSequenceBreakers(payload, ["Mara"])).toEqual({ added: [], dropped: [], form: null });
    expect(payload.dry_sequence_breakers).toBe("a,b");
  });

  it("never sends llama.cpp more than 64 distinct breakers on a large cast, the preset's own first", () => {
    const big = parseStoryOrThrow({
      id: "crowd", title: "Crowd", description: "",
      qualities: [{ key: "done", type: "bool", source: "extractor", rubric: "Done?" }],
      checkpoints: [{ id: "a", name: "A", objective: "", type: "anchor", start: true }],
      transitions: [],
      roster: Array.from({ length: 30 }, (_, i) => ({ id: `m${i}`, name: `Given${i} Family${i}`, aliases: [`Title${i}`] })),
    });
    const preset = ["\n", ":", "\"", "*", "\n"];
    const payload: Record<string, unknown> = { dry_sequence_breakers: JSON.stringify(preset) };
    const { handle, journal } = harness({ story: () => big, drafted: () => "Given7 Family7", onStage: () => ["Given3 Family3"] });
    const added = handle(payload, loud);
    const sent = JSON.parse(String(payload.dry_sequence_breakers)) as string[];
    expect(new Set(sent).size).toBe(64);
    expect(sent.slice(0, preset.length)).toEqual(preset);
    expect(added.slice(0, 5)).toEqual(["Given7 Family7", "Title7", "Max", "Given3 Family3", "Title3"]);
    expect(added).toHaveLength(60);
    expect(journal).toEqual([DRY_NAMES_APPLIED, DRY_NAMES_CAPPED]);
  });

  it("appends nothing when the preset alone fills the cap", () => {
    const preset = [...Array.from({ length: 64 }, (_, i) => `b${i}`), "b0"];
    const payload: Record<string, unknown> = { dry_sequence_breakers: [...preset] };
    const { handle, journal } = harness();
    expect(handle(payload, loud)).toEqual([]);
    expect(payload.dry_sequence_breakers).toEqual(preset);
    expect(journal).toEqual([DRY_NAMES_CAPPED]);
    expect(appendSequenceBreakers({ dry_sequence_breakers: ["a", "b"] }, ["c", "d", "e"], 3)).toEqual({ added: ["c"], dropped: ["d", "e"], form: "array" });
  });
});
