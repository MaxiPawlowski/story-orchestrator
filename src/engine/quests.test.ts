import { StoryEngine } from "./engine";
import { parseStoryV2, parseStoryV2OrThrow } from "./validate";
import { questScopeKeys, questStatus, rewardedQuestIds, valueReader } from "./quests";
import { questClosedKey, questRewardKey, type PrimitiveValue } from "./schema";

const bool = (key: string) => ({ key, type: "bool", source: "extractor", rubric: `Whether ${key} is true.` });

const raw = (quest: Record<string, unknown> = {}) => ({
  format: 2, title: "Quest lab", description: "Synthetic quests.",
  roster: [{ id: "keeper", name: "Keeper" }],
  qualities: [bool("offered"), bool("accepted"), bool("ledger"), bool("paid"), bool("lost"), bool("found_map"), { key: "coins", type: "int", source: "code", rubric: "Coins held." }],
  checkpoints: [{ id: "start", name: "Start", type: "anchor", start: true, objective: "Begin." }],
  transitions: [],
  quests: [{
    id: "debt", title: "The ferryman's debt", kind: "side",
    offered_when: { all: [{ q: "offered", op: "==", v: true }] },
    visible_when: { all: [{ q: "accepted", op: "==", v: true }] },
    failed_when: { all: [{ q: "lost", op: "==", v: true }] },
    steps: [
      { text: "Find the ledger", done_when: { all: [{ q: "ledger", op: "==", v: true }] } },
      { text: "Pay the debt", done_when: { all: [{ q: "paid", op: "==", v: true }] } },
    ],
    reward: { set: { coins: { add: 3 } } },
    ...quest,
  }],
});

const playing = (story = parseStoryV2OrThrow(raw())) => {
  const engine = new StoryEngine();
  engine.loadStory(story);
  let message = 0;
  const turn = (deltas: Record<string, PrimitiveValue>) => {
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: Object.entries(deltas).map(([q, v]) => ({ q, v, source: "extractor" as const })) });
    message += 2;
    engine.commitBoundary({ lastMessageId: message, chatLength: message + 1 });
  };
  const status = () => questStatus(story.quests![0], valueReader(engine.serialize().blackboard.values));
  return { engine, story, turn, status, values: () => engine.serialize().blackboard.values };
};

describe("quest validation", () => {
  test("an offered quest needs visible_when, the acceptance gate", () => {
    const parsed = parseStoryV2(raw({ visible_when: undefined }));
    expect(Array.isArray(parsed) && parsed.some((error) => error.path.endsWith("visible_when"))).toBe(true);
  });

  test("a story quality cannot take a key the quest layer keeps", () => {
    const story = raw();
    const parsed = parseStoryV2({ ...story, qualities: [...story.qualities, bool(questClosedKey("debt"))] });
    expect(Array.isArray(parsed) && parsed.some((error) => error.message.includes("kept for a quest"))).toBe(true);
  });

  test("a relationship quality cannot be made public", () => {
    const story = raw();
    const parsed = parseStoryV2({ ...story, qualities: [...story.qualities, { ...bool("rel_keeper_trust"), display: { public: true, label: "Trust", as: "word" } }] });
    expect(Array.isArray(parsed)).toBe(true);
  });

  test("the closed and rewarded latches are added as code qualities", () => {
    const story = parseStoryV2OrThrow(raw());
    expect(story.qualityByKey[questClosedKey("debt")]).toMatchObject({ source: "code", latching: true, type: "enum" });
    expect(story.qualityByKey[questRewardKey("debt")]).toMatchObject({ source: "code", latching: true, type: "bool" });
  });
});

describe("quest lifecycle", () => {
  test("hidden, then offered, then active only on acceptance", () => {
    const play = playing();
    expect(play.status()).toBe("hidden");
    play.turn({ offered: true });
    expect(play.status()).toBe("offered");
    play.turn({ accepted: true });
    expect(play.status()).toBe("active");
  });

  test("an ignored offer stays offered and never fails", () => {
    const play = playing();
    play.turn({ offered: true });
    for (let index = 0; index < 5; index += 1) play.turn({ lost: true });
    expect(play.status()).toBe("offered");
    expect(play.values()[questClosedKey("debt")]).toBeUndefined();
  });

  test("a completion gate that toggles back leaves the quest done and the reward given once", () => {
    const play = playing();
    play.turn({ offered: true, accepted: true, ledger: true, paid: true });
    expect(play.status()).toBe("done");
    expect(play.values().coins).toBe(3);
    play.turn({ paid: false });
    play.turn({ paid: true });
    expect(play.status()).toBe("done");
    expect(play.values().coins).toBe(3);
    expect(rewardedQuestIds(play.story, play.values())).toEqual(["debt"]);
  });

  test("failure wins when done and failed hold at the same boundary, and stays", () => {
    const play = playing();
    play.turn({ accepted: true, ledger: true, paid: true, lost: true });
    expect(play.status()).toBe("failed");
    expect(play.values().coins).toBeUndefined();
    play.turn({ lost: false });
    expect(play.status()).toBe("failed");
  });

  test("a rollback past the completion reopens the quest and takes the reward back", () => {
    const play = playing();
    play.turn({ accepted: true, ledger: true });
    play.turn({ paid: true });
    expect(play.engine.shouldRollbackFromMessage(4)).toBe(true);
    play.engine.rollbackTo(1);
    expect(play.status()).toBe("active");
    expect(play.values().coins).toBeUndefined();
  });

  test("the engine rolls back from a message whose boundary only latched a quest", () => {
    const story = parseStoryV2OrThrow(raw({ visible_when: undefined, offered_when: undefined, steps: [], done_when: { all: [{ q: "ledger", op: "==", v: true }] } }));
    const play = playing(story);
    play.turn({ ledger: true });
    expect(play.values()[questClosedKey("debt")]).toBe("done");
    expect(play.engine.shouldRollbackFromMessage(2)).toBe(true);
  });
});

describe("quest scope", () => {
  const many = () => ({
    ...raw(),
    qualities: Array.from({ length: 8 }, (_, index) => [bool(`a${index}`), bool(`b${index}`)]).flat(),
    quests: Array.from({ length: 8 }, (_, index) => ({
      id: `q${index}`, title: `Quest ${index}`, kind: "side", steps: [],
      done_when: { all: [{ q: `a${index}`, op: "==", v: true }, { q: `b${index}`, op: "==", v: true }] },
    })),
  });

  test("every active quest gets its first key before any quest gets a second", () => {
    const story = parseStoryV2OrThrow(many());
    const keys = questScopeKeys(story.quests, valueReader({}));
    expect(keys.slice(0, 8)).toEqual(Array.from({ length: 8 }, (_, index) => `a${index}`));
  });

  test("closed quests leave the scope", () => {
    const story = parseStoryV2OrThrow(many());
    const keys = questScopeKeys(story.quests, valueReader({ [questClosedKey("q0")]: "done" }));
    expect(keys).not.toContain("a0");
    expect(keys).toContain("a1");
  });
});

describe("quest rollback equals replay", () => {
  const seeds = [3, 11, 29, 97];
  const keys = ["offered", "accepted", "ledger", "paid", "lost"];
  const lcg = (seed: number) => {
    let state = seed;
    return () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
  };

  test.each(seeds)("seed %i: rolling back to every boundary equals replaying to it", (seed) => {
    const random = lcg(seed);
    const turns = Array.from({ length: 100 }, () => Object.fromEntries(keys.filter(() => random() < 0.3).map((key) => [key, random() < 0.7])));
    const full = playing();
    const checkpoints: Array<Record<string, PrimitiveValue>> = [];
    for (const turn of turns) {
      full.turn(turn);
      checkpoints.push({ ...full.values() });
    }
    for (let cut = 0; cut < turns.length; cut += 1) {
      const reopened = new StoryEngine();
      reopened.loadStory(full.story);
      reopened.hydrate(full.engine.serialize(), full.engine.serializeHistory());
      reopened.rollbackTo(cut + 1);
      const replay = playing(full.story);
      turns.slice(0, cut + 1).forEach((turn) => replay.turn(turn));
      expect(reopened.serialize().blackboard.values).toEqual(replay.values());
      expect(replay.values()).toEqual(checkpoints[cut]);
    }
  });

  test("negative control: without the closed latch a toggled-back completion would read as active again", () => {
    const play = playing();
    play.turn({ accepted: true, ledger: true, paid: true });
    play.turn({ paid: false });
    const unlatched = { ...play.values() };
    delete unlatched[questClosedKey("debt")];
    expect(questStatus(play.story.quests![0], valueReader(unlatched))).toBe("active");
    expect(play.status()).toBe("done");
  });
});
