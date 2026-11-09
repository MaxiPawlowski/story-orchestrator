import { StoryEngine, parseStoryOrThrow, type PrimitiveValue } from "@engine/index";
import type { EpistemicEntry } from "@memory/types";
import { heldSecrets, withoutSecretLines } from "@memory/heldSecrets";
import { deriveRefs } from "./consequences";
import { buildStoryRecord, openItems, recordLabel, restingRecord, type StoryRecordSources } from "./storyRecord";
import type { EffectLedgerRow } from "./effectTypes";

const KEYS = ["asked", "taken", "freed", "bargained", "fled", "violent"];
const bool = (key: string) => ({ key, type: "bool", source: "extractor", rubric: `Whether ${key} is true.` });
const is = (key: string) => ({ q: key, op: "==", v: true });

const story = parseStoryOrThrow({
  title: "Record lab", description: "Synthetic.",
  roster: [{ id: "miller", name: "Miller" }, { id: "boy", name: "Boy" }],
  qualities: [...KEYS.map(bool), { key: "coins", type: "int", source: "code", rubric: "Coins." }],
  checkpoints: [{ id: "start", name: "Start", type: "anchor", start: true, objective: "Begin." }, { id: "mill", name: "The mill", type: "anchor", objective: "Talk." }],
  transitions: [{ from: "start", to: "mill", gate: is("asked"), priority: 0 }],
  quests: [{
    id: "rescue", title: "The miller's son", kind: "side", offered_when: is("asked"), visible_when: is("taken"), steps: [],
    resolutions: [
      { id: "freed", label: "Freed him; he knows the smugglers' cave", when: is("freed"), consequences: [
        { id: "thanks", set: { coins: { add: 5 } }, effects: { world_info: { enable: [{ lorebook: "Book", comments: ["Cave"] }] } } },
        { id: "blood", when: is("violent"), set: { coins: { add: -1 } } },
      ] },
      { id: "abandoned", label: "Left him", when: is("fled") },
    ],
    precedence: ["abandoned", "freed"],
  }],
});

const lcg = (seed: number) => {
  let state = seed;
  return () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
};

const play = (turns: Array<Record<string, PrimitiveValue>>) => {
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(story);
  turns.forEach((turn, index) => {
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: Object.entries(turn).map(([q, v]) => ({ q, v, source: "extractor" as const })) });
    engine.commitBoundary({ lastMessageId: (index + 1) * 2, chatLength: (index + 1) * 2 + 1 });
  });
  return engine;
};

const sourcesOf = (engine: StoryEngine, ledger: EffectLedgerRow[] = []): StoryRecordSources => ({
  story, log: engine.stateLog, refs: engine.stateLog.flatMap((entry) => deriveRefs(story, entry)), ledger, roster: ["miller", "boy"],
});

const ledgerRow = (id: string, originId: string, boundary: number): EffectLedgerRow => ({
  id, effect: "world_info", target: { kind: "wi", book: "Book", uid: 1, entry: "Cave" }, before: null, after: null, checkpointId: null, boundary, messageId: boundary * 2,
  at: "t", status: "applied", origin: { kind: "quest", id: originId, boundary, messageId: boundary * 2 },
});

describe("v3.0 54: the story record", () => {
  test("rows name the event, the effects it switched on and what it opened or closed", () => {
    const engine = play([{ asked: true, taken: true }, { freed: true }]);
    const rows = buildStoryRecord(sourcesOf(engine, [ledgerRow("wi-1", "rescue:freed:thanks", 2)]));
    const kinds = rows.map((row) => `${row.boundary}:${row.event.kind}:${row.event.id}`);
    expect(kinds).toEqual(["1:transition:start->mill#0", "1:quest:rescue", "2:resolution:rescue", "2:consequence:rescue:freed:thanks"]);
    expect(rows[3].effects).toEqual(["wi-1"]);
    expect(rows[1].opens).toEqual(["quest:rescue"]);
    expect(rows[2].closes).toEqual(["quest:rescue"]);
    expect(openItems(rows)).toEqual([]);
    expect(Object.values(rows[2].audience)).toEqual(["unknown", "unknown"]);
    expect(recordLabel(story, rows[3])).toBe("The miller's son (freed): thanks");
  });

  test("a cause is only the evidenced deciding line; anything else is unknown", () => {
    const rows = buildStoryRecord(sourcesOf(play([{ asked: true, taken: true }, { freed: true }])));
    expect(rows.every((row) => row.causes.length === 0)).toBe(true);
  });

  test("a range keeps only its boundaries", () => {
    const rows = buildStoryRecord(sourcesOf(play([{ asked: true, taken: true }, { freed: true }])), { from: 2 });
    expect(rows.every((row) => row.boundary >= 2)).toBe(true);
  });

  test("record(rollback) == record(replay) over 200 seeds", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const random = lcg(seed * 31);
      const turns = Array.from({ length: 24 }, () => Object.fromEntries(KEYS.filter(() => random() < 0.3).map((key) => [key, random() < 0.7])));
      const full = play(turns);
      const cut = 1 + Math.floor(random() * (turns.length - 1));
      const reopened = new StoryEngine({ now: () => 0 });
      reopened.loadStory(story);
      reopened.hydrate(full.serialize(), full.serializeHistory());
      reopened.rollbackTo(cut);
      expect(buildStoryRecord(sourcesOf(reopened))).toEqual(buildStoryRecord(sourcesOf(play(turns.slice(0, cut)))));
    }
  });

  test("planted held secret: the resting view carries no secret text, the author view keeps it", () => {
    const secret = {
      id: "secret-cave", subject: "Boy", tag: "hiding", hiddenFrom: "Miller", content: "the boy knows the smugglers' cave", messageId: 1, createdAt: 1,
      provenance: { validity: "live" },
    } as unknown as EpistemicEntry;
    const secrets = heldSecrets([secret], ["Miller", "Boy"]);
    expect(secrets).toHaveLength(1);
    const rows = buildStoryRecord(sourcesOf(play([{ asked: true, taken: true }, { freed: true }])));
    const label = (row: (typeof rows)[number]) => recordLabel(story, row);
    expect(rows.map(label).some((text) => text.includes("smugglers' cave"))).toBe(true);
    const resting = restingRecord(rows, label, (text) => withoutSecretLines(text, secrets, null));
    expect(resting.some((row) => row.text.includes("smugglers' cave"))).toBe(false);
    expect(resting.length).toBe(rows.length - 1);
  });

  test("build time p95 <= 5 ms over a 300-boundary log", () => {
    const random = lcg(7);
    const turns = Array.from({ length: 300 }, () => Object.fromEntries(KEYS.filter(() => random() < 0.3).map((key) => [key, random() < 0.7])));
    const engine = play(turns);
    const log = Array.from({ length: 300 }, (_, index) => ({ ...engine.stateLog[index % engine.stateLog.length], boundary: index + 1 }));
    const sources: StoryRecordSources = { ...sourcesOf(engine), log, refs: log.flatMap((entry) => deriveRefs(story, entry)) };
    expect(sources.log).toHaveLength(300);
    for (let warm = 0; warm < 10; warm += 1) buildStoryRecord(sources);
    const once = () => {
      const start = performance.now();
      buildStoryRecord(sources);
      return performance.now() - start;
    };
    const times = Array.from({ length: 100 }, () => Math.min(once(), once(), once())).sort((left, right) => left - right);
    expect(times[Math.floor(times.length * 0.95) - 1]).toBeLessThanOrEqual(5);
  });
});
