import { parseStoryOrThrow, type NormalizedStory } from "@engine/index";
import type { HostScannableEntry } from "@services/STAPI";
import { loreChanceDraw } from "./chance";
import { applyLoreChance, loreChanceFor, passesChance, weightedGroups, type LoreChanceSources } from "./loreChance";
import { applyLorePlacement, lorePlacementFor } from "./lorePlacement";
import { bookKey } from "./worldInfoMatch";

const story = (): NormalizedStory => parseStoryOrThrow({
  id: "lc",
  title: "Lore chance",
  description: "Fixture.",
  qualities: [],
  checkpoints: [{ id: "cp1", name: "One", objective: "x", type: "anchor", start: true }],
  transitions: [],
  roster: [],
  requirements: { lorebooks: ["Story Lore"] },
});

const entry = (uid: number, world: string, patch: Partial<HostScannableEntry> = {}): HostScannableEntry => ({
  world, uid, comment: `${world} ${uid}`, content: `${world} ${uid} text`, disable: false, constant: false, position: 1, order: 100, depth: 4,
  useProbability: true, probability: 50, ...patch,
});

const scan = (): HostScannableEntry[][] => [[
  entry(1, "Story Lore"),
  entry(2, "Story Lore", { probability: 100 }),
  entry(3, "Story Lore", { useProbability: false, probability: 10 }),
  entry(4, "Story Lore", { sticky: 2 }),
  entry(5, "Story Lore", { disable: true }),
  entry(6, "User Lore"),
  entry(7, "story lore", { probability: 0 }),
], [], [], []];

const ids = { chatId: "chat-1", storyId: "lc" };

const sources = (boundary: number, patch: Partial<LoreChanceSources> = {}): LoreChanceSources => ({
  enabled: () => true,
  story,
  chatId: () => "chat-1",
  ownedChat: () => "chat-1",
  roll: (book, uid) => loreChanceDraw(ids, boundary, book, uid),
  ...patch,
});

const outcome = (arrays: HostScannableEntry[][]) => arrays.flat().map((row) => `${row.uid}:${row.disable === true ? "off" : "on"}:${row.useProbability === true ? "roll" : "fixed"}`);

describe("v3.0 42a F1: story lorebook trigger chance is seeded per boundary", () => {
  it("defect: a swipe on the same boundary sees the same lore, decided before ST's Math.random roll", () => {
    const first = scan();
    const swipe = scan();
    applyLoreChance(first, loreChanceFor(sources(7)));
    applyLoreChance(swipe, loreChanceFor(sources(7)));
    expect(outcome(first)).toEqual(outcome(swipe));
    const story = first.flat().filter((row) => bookKey(row.world) === "story lore" && row.disable !== true);
    expect(story.filter((row) => row.useProbability === true && Number(row.probability) < 100 && Number(row.sticky ?? 0) === 0)).toEqual([]);
  });

  it("resolves only story-book entries that roll, skips sticky, disabled and other books", () => {
    const arrays = scan();
    const stats = applyLoreChance(arrays, loreChanceFor(sources(3)));
    expect(stats).toMatchObject({ rolled: 2, sticky: 1 });
    expect(stats.passed + stats.failed).toBe(2);
    const byUid = new Map(arrays.flat().map((row) => [row.uid, row]));
    expect(byUid.get(2)).toMatchObject({ useProbability: true, disable: false });
    expect(byUid.get(3)).toMatchObject({ useProbability: false, disable: false });
    expect(byUid.get(4)).toMatchObject({ useProbability: true, disable: false });
    expect(byUid.get(5)).toMatchObject({ useProbability: true, disable: true });
    expect(byUid.get(6)).toMatchObject({ useProbability: true, disable: false });
    expect(byUid.get(7)).toMatchObject({ disable: true });
  });

  it("fires a 50% entry within binomial bounds across 400 boundaries", () => {
    let fired = 0;
    for (let boundary = 0; boundary < 400; boundary += 1) {
      const arrays = [[entry(1, "Story Lore")]];
      applyLoreChance(arrays, loreChanceFor(sources(boundary)));
      if (arrays[0][0].disable !== true) fired += 1;
    }
    expect(fired).toBeGreaterThan(170);
    expect(fired).toBeLessThan(230);
  });

  it("matches ST's pass rule: roll * 100 <= probability", () => {
    expect(passesChance(50, 0.5)).toBe(true);
    expect(passesChance(50, 0.51)).toBe(false);
    expect(passesChance(0, 0.2)).toBe(false);
  });

  it("refuses off the story chat, with the switch off, or without a seed", () => {
    expect(loreChanceFor(sources(1, { enabled: () => false })).refusal).toBe("setting-off");
    expect(loreChanceFor(sources(1, { ownedChat: () => "other" })).refusal).toBe("not-owned");
    const arrays = scan();
    applyLoreChance(arrays, loreChanceFor(sources(1, { roll: () => null })));
    expect(outcome(arrays)).toEqual(outcome(scan()));
  });

  it("a failed roll keeps the entry out of late placement; a passed roll is placed", () => {
    const arrays = scan();
    applyLoreChance(arrays, loreChanceFor(sources(11)));
    const placement = applyLorePlacement(arrays, lorePlacementFor({ enabled: () => true, depth: () => 4, story, chatId: () => "chat-1", ownedChat: () => "chat-1" }));
    const live = arrays.flat().filter((row) => bookKey(row.world) === "story lore" && row.disable !== true);
    expect(placement.moved).toBe(live.length);
  });

  it("names inclusion groups that pick at random", () => {
    expect(weightedGroups([
      entry(1, "Story Lore", { group: "weather" }),
      entry(2, "Story Lore", { group: "weather, mood" }),
      entry(3, "Story Lore", { group: "mood", groupOverride: true }),
      entry(4, "Story Lore", { group: "alone" }),
    ])).toEqual(["weather"]);
    const arrays = [[entry(1, "Story Lore", { group: "g" }), entry(2, "Story Lore", { group: "g" }), entry(3, "User Lore", { group: "h" }), entry(4, "User Lore", { group: "h" })]];
    expect(applyLoreChance(arrays, loreChanceFor(sources(1))).weightedGroups).toEqual(["g"]);
  });
});
