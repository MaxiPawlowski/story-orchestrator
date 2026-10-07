import { readFileSync } from "fs";
import { join } from "path";
import { StoryEngine, parseStoryV2OrThrow } from "@engine/index";
import { unitDraw } from "@engine/chance";
import { chanceGateValues } from "./chance";
import {
  CHANCE_DRAW_LIMIT, composeRolls, createChance, recordChanceDraw, reconstructQualityRolls, rollbackChanceDraws, sanitizeChance, type ChanceRuntimeState,
} from "./rolls";

const story = parseStoryV2OrThrow(JSON.parse(readFileSync(join(__dirname, "../../test/fixtures/sp7-chance.story.json"), "utf8")));
const STORY_ID = "sp7-chance";
const BOUNDARIES = 120;
const CUTS = 60;
const SEEDS = [11, 23, 37, 51];

const ids = (chatId: string) => ({ chatId, storyId: STORY_ID });

const freshEngine = (chatId: string) => {
  const engine = new StoryEngine({ now: () => 0, derive: (view) => chanceGateValues(story.qualities, ids(chatId), view) });
  engine.loadStory(story);
  return engine;
};

const drive = (engine: StoryEngine, seed: number, from: number, to: number) => {
  for (let index = from; index < to; index += 1) {
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, turnRange: { from: index, to: index }, deltas: [{ q: "tried", v: unitDraw(["rolls-input", seed, index]) < 0.5, source: "extractor" }] });
    engine.commitBoundary({ lastMessageId: index, chatLength: index + 1 });
  }
};

const rollsOf = (engine: StoryEngine, chatId: string) => reconstructQualityRolls(story, ids(chatId), engine.stateLog, engine.serialize());

describe("v2.7 06 C9 (b): quality rolls are reconstructed, not recorded", () => {
  it("every reconstructed roll is the value the engine's seeded draw wrote into the blackboard", () => {
    const engine = freshEngine("chat-a");
    drive(engine, 11, 0, BOUNDARIES);
    const rolls = rollsOf(engine, "chat-a");
    let checked = 0;
    for (const entry of engine.stateLog) {
      const drawnAt = entry.before.checkpointStartedBoundary;
      const lock = rolls.find((roll) => roll.key === "lock_gives" && roll.boundary === drawnAt);
      const clue = rolls.find((roll) => roll.key === "clue_die" && roll.boundary === drawnAt);
      expect(lock?.outcome === "success").toBe(entry.after.blackboard.values.lock_gives);
      expect(clue?.draw).toBe(entry.after.blackboard.values.clue_die);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("anchors each checkpoint's draw at the message its entry committed", () => {
    const engine = freshEngine("chat-a");
    drive(engine, 23, 0, 40);
    const entered = engine.stateLog.filter((entry) => entry.fired);
    expect(entered.length).toBeGreaterThan(0);
    for (const entry of entered) {
      expect(rollsOf(engine, "chat-a").filter((roll) => roll.boundary === entry.boundary).map((roll) => roll.messageId)).toEqual([entry.context.lastMessageId, entry.context.lastMessageId]);
    }
  });

  it(`rollback + replay reconstructs the same rolls: ${SEEDS.length} seeds x ${CUTS} cuts`, () => {
    const mismatches = SEEDS.map((seed) => {
      const chatId = `chat-${seed}`;
      const reference = freshEngine(chatId);
      drive(reference, seed, 0, BOUNDARIES);
      const full = JSON.stringify(rollsOf(reference, chatId));
      let misses = 0;
      for (let cut = 0; cut < CUTS; cut += 1) {
        const at = Math.floor(unitDraw(["rolls-cut", seed, cut]) * BOUNDARIES);
        const engine = freshEngine(chatId);
        drive(engine, seed, 0, BOUNDARIES);
        if (!engine.rollbackTo(at).ok) throw new Error(`rollback to ${at} refused`);
        drive(engine, seed, engine.serialize().lastMessageId + 1, BOUNDARIES);
        if (JSON.stringify(rollsOf(engine, chatId)) !== full) misses += 1;
      }
      return misses;
    });
    expect(mismatches).toEqual(SEEDS.map(() => 0));
  });

  it("a reopened chat (serialize, hydrate) reconstructs the same rolls", () => {
    const engine = freshEngine("chat-a");
    drive(engine, 37, 0, 60);
    const reopened = freshEngine("chat-a");
    reopened.hydrate(JSON.parse(JSON.stringify(engine.serialize())), JSON.parse(JSON.stringify(engine.serializeHistory())));
    expect(rollsOf(reopened, "chat-a")).toEqual(rollsOf(engine, "chat-a"));
  });

  it("two group replies inside one checkpoint read one draw per rolled quality", () => {
    const engine = freshEngine("chat-a");
    engine.commitBoundary({ lastMessageId: 0, chatLength: 1 });
    engine.commitBoundary({ lastMessageId: 1, chatLength: 2 });
    engine.commitBoundary({ lastMessageId: 2, chatLength: 3 });
    expect(rollsOf(engine, "chat-a").map((roll) => roll.key).sort()).toEqual(["clue_die", "lock_gives"]);
  });

  it("control: another chat reconstructs other faces, so the chat is part of the seed", () => {
    const a = freshEngine("chat-a");
    const b = freshEngine("chat-b");
    drive(a, 11, 0, BOUNDARIES);
    drive(b, 11, 0, BOUNDARIES);
    expect(rollsOf(a, "chat-a").map((roll) => roll.draw)).not.toEqual(rollsOf(b, "chat-b").map((roll) => roll.draw));
  });
});

type Epoch = number;
const drawsFor = (message: number, epoch: Epoch) => {
  const count = Math.floor(unitDraw(["draw-count", message]) * 3);
  return Array.from({ length: count }, (_, index) => ({
    kind: index % 2 === 0 ? "talk" as const : "npc" as const, key: index % 2 === 0 ? "talk" : `cp:onEnter:${index}`, boundary: message, unit: unitDraw(["draw", message, index, epoch]),
  }));
};

const play = (state: ChanceRuntimeState, from: number, to: number, epochOf: (message: number) => Epoch) => {
  let next = state;
  for (let message = from; message < to; message += 1) for (const draw of drawsFor(message, epochOf(message))) next = recordChanceDraw(next, draw, message);
  return next;
};

const MESSAGES = 160;

const ringMismatches = (rollBack: boolean, seed: number) => {
  let misses = 0;
  for (let cut = 0; cut < 80; cut += 1) {
    const at = Math.floor(unitDraw(["ring-cut", seed, cut]) * MESSAGES);
    const swiped = (message: number) => (message >= at ? 1 : 0);
    const before = play(createChance(), 0, MESSAGES, () => 0);
    const cutState = rollBack ? rollbackChanceDraws(before, at) : before;
    const replayed = play(cutState, at, MESSAGES, swiped);
    const reference = play(createChance(), 0, MESSAGES, swiped);
    if (JSON.stringify(replayed) !== JSON.stringify(reference)) misses += 1;
  }
  return misses;
};

describe("v2.7 06 C9 (b): the draws ring rolls back by message", () => {
  it(`rollback + replay of the draws ring equals a straight replay: ${SEEDS.length} seeds x 80 cuts`, () => {
    expect(SEEDS.map((seed) => ringMismatches(true, seed))).toEqual(SEEDS.map(() => 0));
  });

  it("control: without the rollback the swiped messages keep their stale draws and the replay differs, for every seed", () => {
    expect(SEEDS.filter((seed) => ringMismatches(false, seed) === 0)).toEqual([]);
  });

  it("caps at the limit, refuses a draw with no message, and sanitizes a stored ring", () => {
    const full = play(createChance(), 0, 400, () => 0);
    expect(full.draws.length).toBe(CHANCE_DRAW_LIMIT);
    expect(recordChanceDraw(createChance(), { kind: "npc", key: "k", boundary: 1, unit: 0.5 }, -1).draws).toEqual([]);
    expect(sanitizeChance({ draws: [{ kind: "npc", key: "k", boundary: 1, unit: 0.5, messageId: 3, text: "x" }, { kind: "dice", key: "k" }] }))
      .toEqual({ draws: [{ kind: "npc", key: "k", boundary: 1, unit: 0.5, messageId: 3 }] });
    expect(sanitizeChance(undefined)).toEqual(createChance());
  });

  it("composes one roll store from reconstructed rolls and recorded draws, ordered by message", () => {
    const engine = freshEngine("chat-a");
    drive(engine, 11, 0, 10);
    const chance = recordChanceDraw(createChance(), { kind: "talk", key: "talk", boundary: 3, unit: 0.25 }, 4);
    const rolls = composeRolls(rollsOf(engine, "chat-a"), chance);
    expect(rolls.some((roll) => roll.source === "talk" && roll.messageId === 4 && roll.sides === 100 && roll.draw === 26)).toBe(true);
    expect(rolls.map((roll) => roll.messageId)).toEqual([...rolls.map((roll) => roll.messageId)].sort((a, b) => a - b));
    expect(rolls.every((roll) => roll.narrate === false)).toBe(true);
  });
});
