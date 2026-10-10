import { parseStoryV2OrThrow, type NormalizedStoryV2 } from "@engine/index";
import type { HostScannableEntry } from "@services/STAPI";
import { applyLoreExclusive, type LoreExclusivePlan } from "./loreExclusive";
import { applyLorePlacement, lorePlacementFor, WI_POSITION_AT_DEPTH, type LorePlacementSources } from "./lorePlacement";
import { clampLateLoreDepth, defaultWorldInfoSettings, readGlobalSettings } from "./settingsModel";

const raw = (position?: unknown) => ({
  format: 2,
  id: "lp",
  title: "Lore placement",
  description: "Fixture.",
  qualities: [],
  checkpoints: [{ id: "cp1", name: "One", objective: "x", type: "anchor", start: true }],
  transitions: [],
  roster: [],
  requirements: { lorebooks: ["Story Lore"] },
  lore_select: { lorebooks: ["Select Lore"], ...(position ? { position } : {}) },
});

const story = (position?: "authored" | "depth"): NormalizedStoryV2 => parseStoryV2OrThrow(raw(position));

const entry = (uid: number, world: string, position: number, order: number, patch: Partial<HostScannableEntry> = {}): HostScannableEntry => ({
  world, uid, comment: `${world} ${uid}`, content: `${world} ${uid} text`, disable: false, constant: false, position, order, depth: 4, role: null, ...patch,
});

const arrays = (): HostScannableEntry[][] => [[
  entry(1, "Story Lore", 1, 120),
  entry(2, "Story Lore", 0, 150),
  entry(3, "Story Lore", 1, 90),
  entry(4, "Story Lore", 1, 100, { constant: true }),
  entry(5, "Story Lore", 4, 100, { depth: 2 }),
  entry(6, "story lore", 0, 80),
  entry(7, "Story Lore", 1, 70, { disable: true }),
  entry(8, "Story Lore", 2, 70),
  entry(9, "Select Lore", 1, 60),
  entry(10, "User Lore", 1, 110),
  entry(11, "Story Orchestrator - Lore placement - chat-1", 1, 50),
], [entry(12, "Character Lore", 0, 40)], [], []];

const sources = (patch: Partial<LorePlacementSources> = {}): LorePlacementSources => ({
  enabled: () => true,
  depth: () => 4,
  story: () => story(),
  chatId: () => "chat-1",
  ownedChat: () => "chat-1",
  ...patch,
});

const sortFn = (a: HostScannableEntry, b: HostScannableEntry) => Number(b.order) - Number(a.order);

function assemble(scan: HostScannableEntry[][]) {
  const before: string[] = [];
  const after: string[] = [];
  const depth = new Map<string, string[]>();
  for (const item of scan.flat().filter((row) => row.disable !== true).sort(sortFn)) {
    if (item.position === 0) before.unshift(item.content);
    else if (item.position === 1) after.unshift(item.content);
    else if (item.position === 4) {
      const key = `${String(item.depth)}:${String(item.role ?? 0)}`;
      depth.set(key, [item.content, ...(depth.get(key) ?? [])]);
    }
  }
  const atDepth = [...depth.entries()].sort(([a], [b]) => Number(b.split(":")[0]) - Number(a.split(":")[0])).flatMap(([, rows]) => rows);
  return { before, after, depth, atDepth };
}

describe("late lore placement on the scan copies", () => {
  it("moves the story's per-turn entries to depth and keeps their order and text", () => {
    const control = assemble(arrays());
    const scan = arrays();
    const stats = applyLorePlacement(scan, lorePlacementFor(sources()));
    const moved = assemble(scan);
    expect(stats).toEqual({ moved: 5, before: 2, after: 3, constant: 1 });
    const story = (rows: string[]) => rows.filter((text) => /^(story|select) lore/i.test(text));
    expect(story(moved.before)).toEqual([]);
    expect(story(moved.after)).toEqual(["Story Lore 4 text"]);
    expect(moved.depth.get("5:0")).toEqual(story(control.before));
    expect(moved.depth.get("4:0")).toEqual(story(control.after).filter((text) => text !== "Story Lore 4 text"));
    expect(moved.atDepth.filter((text) => story([text]).length)).toEqual([...story(control.before), ...story(control.after).filter((text) => text !== "Story Lore 4 text"), "Story Lore 5 text"]);
    expect(moved.after).toContain("User Lore 10 text");
    expect(moved.after).toContain("Story Orchestrator - Lore placement - chat-1 11 text");
    expect(moved.before).toEqual(["Character Lore 12 text"]);
    const byUid = new Map(scan.flat().map((row) => [row.uid, row]));
    expect(byUid.get(5)).toMatchObject({ position: 4, depth: 2 });
    expect(byUid.get(7)).toMatchObject({ position: 1, disable: true });
    expect(byUid.get(8)).toMatchObject({ position: 2 });
    expect(byUid.get(1)).toMatchObject({ position: WI_POSITION_AT_DEPTH, depth: 4, role: 0 });
    expect(byUid.get(2)).toMatchObject({ position: WI_POSITION_AT_DEPTH, depth: 5, role: 0 });
    expect(scan.flat().map((row) => row.content)).toEqual(arrays().flat().map((row) => row.content));
    expect(scan.flat().map((row) => row.order)).toEqual(arrays().flat().map((row) => row.order));
  });

  it("is the same on every scan, so ST's entry hash (and sticky/cooldown) stays stable", () => {
    const first = arrays();
    const second = arrays();
    applyLorePlacement(first, lorePlacementFor(sources()));
    applyLorePlacement(second, lorePlacementFor(sources()));
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("moves only entries the exclusive pass left on", () => {
    const scan = arrays();
    const plan: LoreExclusivePlan = { refusal: null, books: new Set(["story lore"]), picks: new Set(["story lore|1"]), gated: new Set() };
    applyLoreExclusive(scan, plan);
    const stats = applyLorePlacement(scan, lorePlacementFor(sources()));
    expect(stats.moved).toBe(2);
    expect(scan.flat().filter((row) => row.position === WI_POSITION_AT_DEPTH && row.disable !== true).map((row) => row.uid).sort((a, b) => a - b)).toEqual([1, 9]);
  });

  it("refuses with the setting off, a story that keeps authored positions, and a chat the story does not own", () => {
    for (const [patch, refusal] of [
      [{ enabled: () => false }, "setting-off"],
      [{ story: () => story("authored") }, "story-off"],
      [{ ownedChat: () => "chat-2" }, "not-owned"],
      [{ chatId: () => null }, "not-owned"],
      [{ story: () => null }, "not-owned"],
    ] as const) {
      const scan = arrays();
      const plan = lorePlacementFor(sources(patch));
      expect(plan.refusal).toBe(refusal);
      expect(applyLorePlacement(scan, plan).moved).toBe(0);
      expect(scan).toEqual(arrays());
    }
    expect(lorePlacementFor(sources({ story: () => story("depth") })).refusal).toBeNull();
  });

  it("clamps the depth and the install default is on at depth 4", () => {
    expect(defaultWorldInfoSettings()).toMatchObject({ lateLore: true, lateLoreDepth: 4 });
    expect(readGlobalSettings({ worldInfo: { lateLore: false, lateLoreDepth: 99 } }).worldInfo).toMatchObject({ lateLore: false, lateLoreDepth: 20 });
    expect(clampLateLoreDepth(-3)).toBe(0);
    expect(clampLateLoreDepth("x")).toBe(4);
    const plan = lorePlacementFor(sources({ depth: () => 0 }));
    const scan = arrays();
    applyLorePlacement(scan, plan);
    expect(scan.flat().find((row) => row.uid === 2)).toMatchObject({ depth: 1 });
  });

  it("rejects an unknown lore_select.position", () => {
    expect(() => parseStoryV2OrThrow(raw("before"))).toThrow(/lore_select.position/);
  });
});
