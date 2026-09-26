import { gatedWorldInfo, parseStoryV2OrThrow, type NormalizedStoryV2 } from "@engine/index";
import { applyScanGate, restsOffIn, scanGatePlan, type ScanEntry, type ScanGateRow } from "./scanGatePlan";
import { noteScanGate, scanGateView, setScanGatingActive } from "./worldInfoMode";
import { releasePlan, worldInfoPlan, type WorldInfoBookPlan } from "./worldInfoGates";
import { bookKey } from "./worldInfoMatch";

const BOOKS = ["Shared", "Own A", "Own B", "shared"];
const COMMENTS = ["c1", "c2", "c3", "c4", "c5", "c6"];

const rng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
};

const pick = <T>(next: () => number, values: T[]): T => values[Math.floor(next() * values.length)];
const some = <T>(next: () => number, values: T[], max: number): T[] => [...new Set(Array.from({ length: Math.floor(next() * (max + 1)) }, () => pick(next, values)))];

const refs = (next: () => number) => some(next, BOOKS, 2).map((lorebook) => ({ lorebook, comments: some(next, COMMENTS, 3) })).filter((ref) => ref.comments.length);

const randomStory = (next: () => number, index: number): NormalizedStoryV2 => {
  const count = 2 + Math.floor(next() * 4);
  return parseStoryV2OrThrow({
    format: 2,
    id: `s${index}`,
    title: `Story ${index}`,
    description: "Generated.",
    qualities: [],
    checkpoints: Array.from({ length: count }, (_, position) => {
      const enable = refs(next);
      const disable = refs(next);
      const world_info = { ...(enable.length ? { enable } : {}), ...(disable.length ? { disable } : {}) };
      return { id: `cp${position}`, name: `CP ${position}`, objective: "x", type: "anchor", ...(position === 0 ? { start: true } : {}), ...(Object.keys(world_info).length ? { effects: { world_info } } : {}) };
    }),
    transitions: [],
    roster: [],
  });
};

// The file path as the manager runs it on a load (runtimeManager `loadStory`): apply the loaded
// story's path (applyWorldInfo: per book, disables then enables), then release every library story's
// gated entries except what the loaded story gates. Books resolve by file id, case-insensitively.
const filePath = (library: NormalizedStoryV2[], loaded: NormalizedStoryV2 | null, path: string[], start: Map<string, boolean>) => {
  const disabled = new Map(start);
  const write = (plans: WorldInfoBookPlan[]) => {
    for (const plan of plans) {
      for (const comment of plan.disable) disabled.set(`${bookKey(plan.lorebook)}|${comment}`, true);
      for (const comment of plan.enable) disabled.set(`${bookKey(plan.lorebook)}|${comment}`, false);
    }
  };
  if (loaded) write(worldInfoPlan(loaded, path));
  write(releasePlan(loaded ? [...library, loaded] : library, loaded));
  return disabled;
};

describe("scanGatePlan (v2.4 plan 05 T13 spike)", () => {
  it("gives every gated entry the state the file path leaves behind, over seeded libraries and paths", () => {
    let cases = 0;
    for (let seed = 1; seed <= 300; seed += 1) {
      const next = rng(seed);
      const library = Array.from({ length: 1 + Math.floor(next() * 4) }, (_, index) => randomStory(next, index));
      const loaded = next() < 0.2 ? null : pick(next, library);
      const path = loaded ? ["cp0", ...some(next, loaded.checkpoints.map((checkpoint) => checkpoint.id), 4)] : [];
      const every = new Set<string>();
      for (const [lorebook, comments] of gatedWorldInfo(library)) for (const comment of comments) every.add(`${bookKey(lorebook)}|${comment}`);
      const start = new Map([...every].map((key) => [key, next() < 0.5]));
      const expected = filePath(library, loaded, path, start);
      const gate = scanGatePlan(library, loaded, path);
      const actual = new Map<string, boolean>();
      for (const [key, book] of gate) for (const [comment, on] of book.entries) actual.set(`${key}|${comment}`, !on);
      expect([...actual.keys()].sort()).toEqual([...every].sort());
      for (const key of every) expect({ key, disabled: actual.get(key) }).toEqual({ key, disabled: expected.get(key) });
      cases += 1;
    }
    expect(cases).toBe(300);
  });

  it("no story turns every library gated entry off", () => {
    const next = rng(7);
    const library = [randomStory(next, 0), randomStory(next, 1)];
    const gate = scanGatePlan(library, null, []);
    expect([...gate.values()].every((book) => [...book.entries.values()].every((on) => on === false))).toBe(true);
  });
});

const copy = (world: string, uid: number, comment: string, extra: Record<string, unknown> = { disable: false }): ScanEntry => ({ world, uid, comment, ...extra });

describe("applyScanGate", () => {
  const gate = new Map([["ruins", { lorebook: "Ruins", entries: new Map([["On", true], ["Off", false], ["Twice", false], ["NoKey", false], ["Missing", true]]) }]]);

  it("switches the copies, never the file: off sets disable, on clears it only from the resting value", () => {
    const entries = [copy("Ruins", 1, "On", { disable: true }), copy("Ruins", 2, "Off"), copy("Other", 3, "Off")];
    const stats = applyScanGate([entries], gate, () => true);
    expect(entries.map((entry) => entry.disable)).toEqual([false, true, false]);
    expect(stats).toEqual(expect.objectContaining({ on: 1, off: 1 }));
  });

  it("compare-and-set: an entry that rests ON and was disabled by another listener stays disabled", () => {
    const entries = [copy("Ruins", 1, "On", { disable: true })];
    const stats = applyScanGate([entries], gate, () => false);
    expect(entries[0].disable).toBe(true);
    expect(stats.keptForeign).toBe(1);
  });

  it("never adds a disable key the copy lacks (the timed-effects hash, 05-H5)", () => {
    const entries = [copy("Ruins", 4, "NoKey", {})];
    const stats = applyScanGate([entries], gate, () => true);
    expect(Object.prototype.hasOwnProperty.call(entries[0], "disable")).toBe(false);
    expect(stats.missingKey).toBe(1);
  });

  it("takes only the first entry that carries a comment, as the file path does", () => {
    const entries = [copy("Ruins", 5, "Twice"), copy("Ruins", 6, "Twice")];
    applyScanGate([entries], gate, () => true);
    expect(entries.map((entry) => entry.disable)).toEqual([true, false]);
  });

  it("walks all four arrays and matches the book by file id, case-insensitively", () => {
    const chatLore = [copy("ruins", 7, "Off")];
    const personaLore = [copy("RUINS", 8, "On", { disable: true })];
    applyScanGate([[], [], chatLore, personaLore], gate, () => true);
    expect(chatLore[0].disable).toBe(true);
    expect(personaLore[0].disable).toBe(false);
  });

  it("reports, per gated entry, the state the scan loaded and the state it used (S5)", () => {
    const entries = [copy("Ruins", 1, "On", { disable: true }), copy("Ruins", 2, "Off"), copy("Ruins", 4, "NoKey", {})];
    const rows: ScanGateRow[] = [];
    applyScanGate([entries], gate, () => true, rows);
    expect(rows).toEqual([
      { lorebook: "Ruins", comment: "On", uid: 1, on: true, fileDisabled: true, effectiveDisabled: false },
      { lorebook: "Ruins", comment: "Off", uid: 2, on: false, fileDisabled: false, effectiveDisabled: true },
      { lorebook: "Ruins", comment: "NoKey", uid: 4, on: false, fileDisabled: null, effectiveDisabled: null },
    ]);
  });

  it("reads the normalised ledger by file id", () => {
    const restsOff = restsOffIn({ Ruins: ["On"] });
    expect(restsOff("ruins", "On")).toBe(true);
    expect(restsOff("Ruins", "Off")).toBe(false);
    expect(restsOff("Elsewhere", "On")).toBe(false);
  });
});

describe("scanGateView (S5)", () => {
  it("shows the last gated scan only while scan gating is active, and forgets it when it goes off", () => {
    noteScanGate({ chatId: "chat-a", owner: "story", rows: [] });
    expect(scanGateView()).toBeNull();
    setScanGatingActive(true);
    noteScanGate({ chatId: "chat-a", owner: "story", rows: [{ lorebook: "Ruins", comment: "On", uid: 1, fileDisabled: true, effectiveDisabled: false }] });
    expect(scanGateView()?.rows).toHaveLength(1);
    setScanGatingActive(false);
    expect(scanGateView()).toBeNull();
    setScanGatingActive(true);
    expect(scanGateView()).toBeNull();
    setScanGatingActive(false);
  });
});
