import { parseStoryOrThrow } from "@engine/index";
import { appendSequenceBreakers } from "@utils/samplerKeys";
import { DRY_NAMES_APPLIED, dryBreakerNames, dryNamesHandler, type DryNamesDeps } from "./dryNames";
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
    enabled: () => true, storyChat: () => "c1", story: () => story, player: () => "Max",
    journal: (summary) => { journal.push(summary); }, ...overrides,
  });
  return { handle, journal };
};

describe("DRY name breakers", () => {
  it("names the cast's full and given names, aliases and the player", () => {
    expect(dryBreakerNames(story, "Max")).toEqual(["Mara Vey", "Mara", "Vey", "Bram", "the Smith", "Max"]);
  });

  it("appends to an array breaker list and never replaces what the preset sent", () => {
    const payload: Record<string, unknown> = { dry_sequence_breakers: ["\n", ":", "Bram"] };
    const { handle, journal } = harness();
    expect(handle(payload, loud)).toEqual(["Mara Vey", "Mara", "Vey", "the Smith", "Max"]);
    expect(payload.dry_sequence_breakers).toEqual(["\n", ":", "Bram", "Mara Vey", "Mara", "Vey", "the Smith", "Max"]);
    expect(journal).toEqual([DRY_NAMES_APPLIED]);
  });

  it("is idempotent and keeps a JSON string list a JSON string", () => {
    const payload: Record<string, unknown> = { dry_sequence_breakers: "[\"\\n\", \"*\"]" };
    const { handle } = harness();
    handle(payload, loud);
    const once = payload.dry_sequence_breakers;
    expect(handle(payload, loud)).toEqual([]);
    expect(payload.dry_sequence_breakers).toBe(once);
    expect(JSON.parse(String(once))).toEqual(["\n", "*", "Mara Vey", "Mara", "Vey", "Bram", "the Smith", "Max"]);
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
    expect(appendSequenceBreakers(payload, ["Mara"])).toEqual({ added: [], form: null });
    expect(payload.dry_sequence_breakers).toBe("a,b");
  });
});
