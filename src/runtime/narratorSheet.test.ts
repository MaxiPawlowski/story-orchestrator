import { StoryEngine, type NormalizedStoryV2, type PrimitiveValue } from "@engine/index";
import { parseStoryV2OrThrow } from "@engine/validate";
import { composeGame } from "./widgets";
import { JUST_HAPPENED_HEADER, JUST_HAPPENED_MAX, narratorLines, SHEET_HEADER, WARN_HEADER } from "./narratorSheet";
import { createNarratorSheetPort, deliveryFloor, hasNarratedSheet, loadNarratorSheet } from "./narratorSheetPort";
import { CHECK_OUTCOME_HEADER } from "./storyCheckDraws";
import { rng } from "../../test/support/codexLab";

const is = (key: string) => ({ q: key, op: "==", v: true });
const bool = (key: string, display?: Record<string, unknown>) => ({ key, type: "bool", source: "extractor", rubric: `Whether ${key}.`, ...(display ? { display } : {}) });

const raw = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({
  format: 2, title: "Sheet lab", description: "Synthetic sheet.",
  roster: [{ id: "nar", name: "Narrator", view: "omniscient" }, { id: "guard", name: "Mara" }],
  qualities: [
    bool("lantern", { public: true, label: "Lantern", as: "item" }),
    bool("rope", { public: true, label: "Rope", as: "item", narrate: false }),
    bool("secret_plan"),
    bool("heard_rumour"),
    bool("paid"),
    { key: "health", type: "int", source: "extractor", rubric: "Health.", display: { public: true, label: "Health", as: "meter", min: 0, max: 10,
      bands: [{ max: 2, label: "Dying", warn: "One more wound could kill you." }, { max: 6, label: "Hurt" }, { label: "Fine" }] } },
    { key: "gold", type: "int", source: "extractor", rubric: "Gold.", display: { public: true, label: "Gold", as: "count" } },
  ],
  checkpoints: [
    { id: "start", name: "Start", player_name: "The landing", type: "intermediate", start: true, objective: "Arrive." },
    { id: "end", name: "End", player_name: "The far shore", type: "anchor", objective: "Finish." },
  ],
  transitions: [{ from: "start", to: "end", priority: 0, gate: is("paid") }],
  quests: [
    { id: "debt", title: "The ferryman's debt", kind: "side", visible_when: is("heard_rumour"), done_when: is("paid"), steps: [] },
    { id: "hidden_job", title: "The silent contract", kind: "side", visible_when: is("secret_plan"), done_when: is("paid"), steps: [] },
  ],
  milestones: [
    { id: "first", title: "Paid in full", when: { all: [is("paid")] } },
    { id: "deep", title: "The buried oath", secret: true, when: { all: [is("secret_plan")] } },
  ],
  ...patch,
});

const KEYS = ["lantern", "rope", "secret_plan", "heard_rumour", "paid"];

const writes = (random: ReturnType<typeof rng>): Array<{ q: string; v: PrimitiveValue }> => [
  ...KEYS.filter(() => random.next() < 0.2).map((key) => ({ q: key, v: true })),
  ...(random.next() < 0.4 ? [{ q: "health", v: Math.floor(random.next() * 11) }] : []),
  ...(random.next() < 0.3 ? [{ q: "gold", v: Math.floor(random.next() * 30) }] : []),
];

const play = (story: NormalizedStoryV2, seed: number, turns: number) => {
  const random = rng(seed);
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(story);
  for (let at = 1; at <= turns; at += 1) {
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: writes(random).map((delta) => ({ ...delta, source: "extractor" as const })) });
    engine.commitBoundary({ lastMessageId: at * 2, chatLength: at * 2 + 1 });
  }
  return engine;
};

const playerStrings = (story: NormalizedStoryV2, engine: StoryEngine): string => {
  const game = composeGame({ story, state: engine.serialize(), boundaryLog: engine.stateLog, checks: [], threads: { open: [], resolved: [] }, chat: [], castNames: {} }).player;
  return JSON.stringify(game);
};

const lineValue = (line: string) => line.replace(/^- /, "");

describe("18 Q7: the public sheet reaches the narrator", () => {
  const story = parseStoryV2OrThrow(raw());

  beforeAll(async () => { await loadNarratorSheet(); });

  test("S1: over 500 generated runs every narrated line is something the player view shows; nothing from a hidden quality, a hidden quest or a secret milestone", () => {
    let leaks = 0;
    let lines = 0;
    for (let seed = 1; seed <= 500; seed += 1) {
      const engine = play(story, seed, 1 + (seed % 9));
      const state = engine.serialize();
      const out = narratorLines(story, state, engine.stateLog.slice(-1));
      const shown = playerStrings(story, engine);
      const body = out.filter((line) => line.startsWith("- "));
      lines += body.length;
      leaks += body.filter((line) => {
        const text = lineValue(line);
        const parts = text.split(": ");
        const words = parts.length > 1 ? parts.slice(1) : parts;
        return words.some((word) => !shown.includes(word.replace(/^now /, "")));
      }).length;
      leaks += [/Rope/, /buried oath/, /secret_plan/].filter((pattern) => pattern.test(out.join("\n"))).length;
      leaks += ["The silent contract"].filter((title) => out.join("\n").includes(title) && !shown.includes(title)).length;
    }
    expect(leaks).toBe(0);
    expect(lines).toBeGreaterThan(500);
  });

  test("S1a: lines go to omniscient members only", () => {
    const engine = play(story, 3, 4);
    const port = createNarratorSheetPort({ story: () => story, state: () => engine.serialize(), log: () => engine.stateLog, chatId: () => "c1", refresh: () => {} });
    expect(port.lines("nar").length).toBeGreaterThan(0);
    expect(port.lines("guard")).toEqual([]);
    expect(port.lines("nobody")).toEqual([]);
  });

  test("S2: no narrated public quality gives no lines at all, and narrate everyone is refused (owner: narrator-only)", () => {
    const quiet = parseStoryV2OrThrow(raw({ qualities: [bool("paid"), bool("heard_rumour"), bool("secret_plan")] }));
    expect(hasNarratedSheet(quiet)).toBe(false);
    const engine = play(quiet, 4, 5);
    const port = createNarratorSheetPort({ story: () => quiet, state: () => engine.serialize(), log: () => engine.stateLog, chatId: () => "c1", refresh: () => {} });
    expect(port.lines("nar")).toEqual([]);
    expect(() => parseStoryV2OrThrow(raw({ qualities: [bool("paid"), bool("heard_rumour"), bool("secret_plan"), bool("lantern", { public: true, label: "Lantern", as: "item", narrate: "everyone" })] })))
      .toThrow(/only the narrator hears the sheet/);
  });

  test("S3: 20 turns with no shown-value change keep the block byte-identical", () => {
    const engine = play(story, 9, 2);
    const port = createNarratorSheetPort({ story: () => story, state: () => engine.serialize(), log: () => engine.stateLog, chatId: () => "c1", refresh: () => {} });
    port.requested();
    const blocks: string[] = [];
    for (let turn = 1; turn <= 20; turn += 1) {
      engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [] });
      engine.commitBoundary({ lastMessageId: 100 + turn * 2, chatLength: 101 + turn * 2 });
      port.requested();
      blocks.push(port.lines("nar").join("\n"));
    }
    expect(new Set(blocks).size).toBe(1);
    expect(blocks[0]).toContain(SHEET_HEADER);
  });

  test("S4: a quest move, a milestone and a band change reach every request of the next chain, a code-only boundary carries forward, none survive the following boundary", () => {
    const engine = play(story, 1, 0);
    const port = createNarratorSheetPort({ story: () => story, state: () => engine.serialize(), log: () => engine.stateLog, chatId: () => "c1", refresh: () => {} });
    const commit = (deltas: Array<{ q: string; v: PrimitiveValue }>, at: number) => {
      engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: deltas.map((delta) => ({ ...delta, source: "extractor" as const })) });
      engine.commitBoundary({ lastMessageId: at, chatLength: at + 1 });
    };
    const rows = () => { const lines = port.lines("nar"); const at = lines.indexOf(JUST_HAPPENED_HEADER); return at < 0 ? [] : lines.slice(at + 1); };
    commit([{ q: "health", v: 8 }], 2);
    port.requested();
    commit([{ q: "heard_rumour", v: true }, { q: "health", v: 4 }], 4);
    port.requested();
    const chain = [rows(), rows(), rows()];
    expect(chain.every((lines) => JSON.stringify(lines) === JSON.stringify(chain[0]))).toBe(true);
    expect(chain[0]).toHaveLength(2);
    expect(chain[0][0]).toMatch(/ferryman's debt/);
    expect(chain[0][1]).toBe("- Health: now Hurt");
    commit([{ q: "paid", v: true }], 5);
    commit([{ q: "health", v: 2 }], 6);
    const carried = rows();
    expect(carried.some((line) => /Paid in full/.test(line))).toBe(true);
    expect(carried.some((line) => /Health: now Dying/.test(line))).toBe(true);
    expect(carried.some((line) => /ferryman's debt/.test(line) && /Offered|offered/.test(line))).toBe(false);
    expect(carried.length).toBeLessThanOrEqual(JUST_HAPPENED_MAX);
    port.requested();
    commit([], 8);
    port.requested();
    expect(rows()).toEqual([]);
    expect(port.lines("nar")).toContain(WARN_HEADER);
  });

  test("S4: the delivery floor is the last boundary a request saw, or the one before", () => {
    expect(deliveryFloor([], 5)).toBe(4);
    expect(deliveryFloor([1, 3], 5)).toBe(3);
    expect(deliveryFloor([1, 5], 5)).toBe(1);
  });

  test("S5: rollback equals replay for rows and warn lines over 4 seeds", async () => {
    const same = [31, 32, 33, 34].filter((seed) => {
      const replay = play(story, seed, 5);
      const long = play(story, seed, 9);
      long.rollbackTo(replay.serialize().boundary);
      const view = (engine: StoryEngine) => createNarratorSheetPort({ story: () => story, state: () => engine.serialize(), log: () => engine.stateLog, chatId: () => "c1", refresh: () => {} }).lines("nar").join("\n");
      return view(long) === view(replay);
    });
    expect(same).toHaveLength(4);
  });

  test("warn bands: a warning shows on the sheet while the value sits in its band, and over-long or faction warnings are refused", () => {
    const engine = play(story, 1, 0);
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "health", v: 1, source: "extractor" }] });
    engine.commitBoundary({ lastMessageId: 2, chatLength: 3 });
    expect(playerStrings(story, engine)).toContain("One more wound could kill you.");
    const long = "x".repeat(81);
    const bands = [{ max: 2, label: "Dying", warn: long }, { label: "Fine" }];
    expect(() => parseStoryV2OrThrow(raw({ qualities: [bool("paid"), bool("heard_rumour"), bool("secret_plan"),
      { key: "health", type: "int", source: "extractor", rubric: "Health.", display: { public: true, label: "Health", as: "meter", min: 0, max: 10, bands } }] }))).toThrow(/at most 80 characters/);
  });

  test("the check-outcome header names only listed consequences", () => {
    expect(CHECK_OUTCOME_HEADER).toMatch(/Narrate only the outcomes and consequences listed\. A failure means the attempt did not succeed; do not add costs the list does not name\.$/);
  });
});
