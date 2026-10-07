import { parseStoryV2OrThrow, type NormalizedStoryV2 } from "@engine/index";
import type { HostScannableEntry } from "@services/STAPI";
import { applyLoreExclusive, loreExclusiveFor, type LoreExclusiveSources } from "./loreExclusive";
import { loreStoryKey } from "./loreSelect";

const story = (exclusive: boolean | "absent" = true): NormalizedStoryV2 => parseStoryV2OrThrow({
  format: 2,
  id: "lx",
  title: "Lore exclusive",
  description: "Fixture.",
  qualities: [],
  checkpoints: [{ id: "cp1", name: "One", objective: "x", type: "anchor", start: true, effects: { world_info: { enable: [{ lorebook: "Story Lore", comments: ["gated on"] }] } } }],
  transitions: [],
  roster: [],
  lore_select: { lorebooks: ["Story Lore"], ...(exclusive === "absent" ? {} : { exclusive }) },
});

const LX_KEY = loreStoryKey(story());

const entry = (uid: number, comment: string, patch: Partial<HostScannableEntry> = {}, world = "Story Lore"): HostScannableEntry => ({ world, uid, comment, content: comment, disable: false, ...patch });
const arrays = (): HostScannableEntry[][] => [[
  entry(1, "picked"),
  entry(2, "not picked"),
  entry(3, "constant", { constant: true }),
  entry(4, "gated on"),
  entry(5, "no key", {}),
  entry(6, "sticky", { sticky: 3 }),
  entry(7, "cooldown", { cooldown: 2 }),
  entry(8, "delay", { delay: 4 }),
  entry(9, "other book", {}, "Other Lore"),
  entry(10, "already off", { disable: true }),
], [], [], []];

const sources = (patch: Partial<LoreExclusiveSources> = {}): LoreExclusiveSources => ({
  useActive: () => true,
  scanActive: () => true,
  story: () => story(),
  chatId: () => "chat-1",
  messageId: () => 4,
  loud: () => true,
  vectorsScanWorldInfo: () => false,
  selection: () => ({ chatId: "chat-1", storyKey: LX_KEY, messageId: 4, picks: [{ world: "story lore", uid: 1 }] }),
  ...patch,
});

const disabled = (scan: HostScannableEntry[][]) => Object.fromEntries(scan.flat().map((item) => [item.comment, item.disable ?? null]));

const withoutKey = (scan: HostScannableEntry[][]) => {
  delete scan[0][4].disable;
  return scan;
};

describe("L5: exclusive lore-select on the scan copies", () => {
  it("switches off the unpicked entries of the lore-select books and nothing else", () => {
    const scan = withoutKey(arrays());
    const plan = loreExclusiveFor(sources());
    expect(plan.refusal).toBeNull();
    const stats = applyLoreExclusive(scan, plan);
    expect(disabled(scan)).toEqual({
      picked: false,
      "not picked": true,
      constant: false,
      "gated on": false,
      "no key": null,
      sticky: false,
      cooldown: false,
      delay: false,
      "other book": false,
      "already off": true,
    });
    expect(stats).toEqual({ suppressed: 1, picked: 1, constant: 1, gated: 1, timed: 3, missingKey: 1 });
  });

  it("X4: a gated-on entry the judge did not pick stays active", () => {
    const scan = arrays();
    applyLoreExclusive(scan, loreExclusiveFor(sources()));
    expect(scan[0][3]).toMatchObject({ comment: "gated on", disable: false });
  });

  it("X6: an entry with sticky, cooldown or delay authored is never suppressed (the timed-effects hash)", () => {
    const scan = arrays();
    applyLoreExclusive(scan, loreExclusiveFor(sources()));
    expect(scan[0].slice(5, 8).map((item) => item.disable)).toEqual([false, false, false]);
  });

  it.each([
    ["use-off", { useActive: () => false }],
    ["not-scan", { scanActive: () => false }],
    ["story-off", { story: () => story(false) }],
    ["story-off", { story: () => story("absent") }],
    ["not-loud", { loud: () => false }],
    ["vectors-wi", { vectorsScanWorldInfo: () => true }],
    ["no-selection", { selection: () => null }],
    ["no-selection", { selection: () => ({ chatId: "chat-2", storyKey: LX_KEY, messageId: 4, picks: [] }) }],
    ["no-selection", { selection: () => ({ chatId: "chat-1", storyKey: "other@0", messageId: 4, picks: [] }) }],
    ["no-selection", { selection: () => ({ chatId: "chat-1", storyKey: LX_KEY, messageId: 3, picks: [] }) }],
  ] as Array<[string, Partial<LoreExclusiveSources>]>)("X3/X5: refused (%s) leaves the keyword scan exactly as loaded", (reason, patch) => {
    const scan = arrays();
    const before = JSON.stringify(scan);
    const plan = loreExclusiveFor(sources(patch));
    expect(plan.refusal).toBe(reason);
    expect(applyLoreExclusive(scan, plan).suppressed).toBe(0);
    expect(JSON.stringify(scan)).toBe(before);
  });

  it("control: the same scan with the install-wide use off and the story flag on changes nothing (G-L5 extra column)", () => {
    const scan = arrays();
    const before = JSON.stringify(scan);
    applyLoreExclusive(scan, loreExclusiveFor(sources({ useActive: () => false })));
    expect(JSON.stringify(scan)).toBe(before);
  });
});
