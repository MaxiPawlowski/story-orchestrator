import { PLAYER_TURNS_KEY, StoryEngine, parseStoryV2OrThrow, type EngineState } from "@engine/index";
import { deriveQualities, playerTurnValues, playerTurnsInCheckpoint } from "./stretchTurns";
import { createChanceSeams } from "./chance";

type Row = { is_user: boolean; is_system?: boolean; mes?: string };

const OOC_FORMS = ["((brb))", "OOC: can we skip ahead?", "(OOC) one question"];

const RAW = {
  format: 2,
  title: "Road",
  description: "An open road between two places.",
  qualities: [
    { key: PLAYER_TURNS_KEY, type: "int", source: "code", rubric: "player turns here" },
    { key: "reached_walls", type: "bool", source: "extractor", rubric: "the party reached the walls" },
  ],
  checkpoints: [
    { id: "camp", name: "Camp", objective: "Break camp.", type: "anchor", start: true },
    { id: "road", name: "On the road", objective: "", type: "intermediate",
      stretch: { mode: "open", pace: "brief", arrive_when: { q: "reached_walls", op: "==", v: true } } },
    { id: "walls", name: "The walls", objective: "Arrive.", type: "anchor" },
  ],
  transitions: [
    { from: "camp", to: "road", priority: 1, gate: { q: PLAYER_TURNS_KEY, op: ">=", v: 2 } },
    { from: "road", to: "walls", priority: 1, gate: { q: "reached_walls", op: "==", v: true } },
  ],
  roster: [] as never[],
};
const STORY = parseStoryV2OrThrow(RAW);

class Play {
  readonly chat: Row[] = [];
  readonly engine = new StoryEngine({ now: () => 0, derive: (view) => playerTurnValues(STORY, view, this.chat) });

  constructor() {
    this.engine.loadStory(STORY);
  }

  commitAt(id: number) {
    this.engine.commitBoundary({ lastMessageId: id, chatLength: this.chat.length });
  }

  send(replies: number, mes?: string) {
    this.chat.push({ is_user: true, ...(mes === undefined ? {} : { mes }) });
    for (let reply = 0; reply < replies; reply += 1) {
      this.chat.push({ is_user: false });
      this.commitAt(this.chat.length - 1);
    }
  }

  continueLast() {
    const last = this.chat.length - 1;
    if (last >= 0 && !this.chat[last].is_user) this.commitAt(last);
  }

  sendAs() {
    this.chat.push({ is_user: false });
    this.commitAt(this.chat.length - 1);
  }

  catchUp() {
    this.chat.forEach((row, id) => {
      if (!row.is_user && id > this.engine.serialize().lastMessageId) this.commitAt(id);
    });
  }

  rollbackFrom(id: number) {
    const boundary = this.engine.boundaryBeforeMessage(id);
    if (boundary !== null) this.engine.rollbackTo(boundary);
  }

  swipeLast() {
    const last = this.chat.length - 1;
    if (last < 0 || this.chat[last].is_user) return;
    this.rollbackFrom(last);
    this.commitAt(last);
  }

  remove(id: number) {
    if (id < 0 || id >= this.chat.length) return;
    this.chat.splice(id, 1);
    this.rollbackFrom(id);
    this.engine.clampToChat(this.chat.length);
    this.catchUp();
  }

  turns() {
    return this.engine.serialize().blackboard.values[PLAYER_TURNS_KEY];
  }
}

const replay = (chat: Row[]): EngineState => {
  const play = new Play();
  play.chat.push(...chat.map((row) => ({ ...row })));
  play.catchUp();
  return play.engine.serialize();
};

const rng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

describe("player_turns_in_checkpoint (v2.7 35 Phase 2)", () => {
  it("a group round of three replies to one player send counts one turn", () => {
    const play = new Play();
    play.send(3);
    expect(play.turns()).toBe(1);
    expect(play.engine.serialize().boundary).toBe(3);
  });

  it("two sends with two replies each count two, and the camp gate fires on the player's second turn", () => {
    const play = new Play();
    play.send(2);
    play.send(2);
    expect(play.engine.serialize().activeCheckpointId).toBe("road");
    play.send(1);
    expect(play.turns()).toBe(1);
  });

  it("a /sendas line and a system row are not player turns", () => {
    const play = new Play();
    play.send(1);
    play.sendAs();
    play.chat.push({ is_user: true, is_system: true });
    play.sendAs();
    expect(play.turns()).toBe(1);
  });

  it("a swipe of a reply keeps the count", () => {
    const play = new Play();
    play.send(1);
    play.send(1);
    play.send(2);
    const before = play.engine.serialize();
    play.swipeLast();
    expect(play.engine.serialize()).toEqual(before);
  });

  it("deleting a player message lowers the count and rolls the transition back", () => {
    const play = new Play();
    play.send(1);
    play.send(1);
    expect(play.engine.serialize().activeCheckpointId).toBe("road");
    play.remove(0);
    expect(play.engine.serialize().activeCheckpointId).toBe("camp");
    expect(play.turns()).toBe(1);
    expect(play.engine.serialize()).toEqual(replay(play.chat));
  });

  it("reopen equals the continuous run", () => {
    const continuous = new Play();
    const reopened = new Play();
    [continuous, reopened].forEach((play) => { play.send(2); play.send(1); });
    const saved = reopened.engine.serialize();
    const history = reopened.engine.serializeHistory();
    const fresh = new Play();
    fresh.chat.push(...reopened.chat);
    fresh.engine.hydrate(saved, history);
    [continuous, fresh].forEach((play) => { play.send(3); play.send(1); });
    expect(fresh.engine.serialize()).toEqual(continuous.engine.serialize());
    expect(fresh.turns()).toBe(2);
  });

  it(`rollback equals replay over random sends, group rounds, swipes and deletes: 4 seeds x 100 cuts`, () => {
    let mismatches = 0;
    let deletes = 0;
    for (const seed of [1, 7, 20261007, 424242]) {
      const random = rng(seed);
      for (let cut = 0; cut < 100; cut += 1) {
        const play = new Play();
        const steps = 4 + Math.floor(random() * 10);
        for (let step = 0; step < steps; step += 1) {
          const roll = random();
          if (roll < 0.55) play.send(1 + Math.floor(random() * 3));
          else if (roll < 0.7) play.swipeLast();
          else if (roll < 0.8) play.sendAs();
          else if (play.chat.length) {
            play.remove(Math.floor(random() * play.chat.length));
            deletes += 1;
          }
        }
        const live = play.engine.serialize();
        if (JSON.stringify({ ...live, chatLength: 0 }) !== JSON.stringify({ ...replay(play.chat), chatLength: 0 })) mismatches += 1;
      }
    }
    expect(deletes).toBeGreaterThan(100);
    expect(mismatches).toBe(0);
  });

  it("control: a counter that ignores the checkpoint start disagrees with replay", () => {
    const play = new Play();
    play.send(1);
    play.send(1);
    play.send(1);
    expect(playerTurnsInCheckpoint({ checkpointStartedMessageId: -1, lastMessageId: play.engine.serialize().lastMessageId }, play.chat)).not.toBe(play.turns());
  });

  it.each(OOC_FORMS)("v2.7 finding 19: %s in a group round leaves the count unchanged and holds the gate", (text) => {
    const play = new Play();
    play.send(1);
    play.send(3, text);
    expect(play.turns()).toBe(1);
    expect(play.engine.serialize().activeCheckpointId).toBe("camp");
    play.continueLast();
    expect(play.turns()).toBe(1);
    play.send(1, "I shoulder my pack (it is heavy) and leave.");
    expect(play.engine.serialize().activeCheckpointId).toBe("road");
  });

  it("v2.7 finding 19: deleting an OOC line changes nothing, and a swipe after one keeps the state", () => {
    const play = new Play();
    play.send(1);
    play.send(2, "((brb))");
    const before = play.turns();
    play.swipeLast();
    expect(play.turns()).toBe(before);
    play.remove(2);
    expect(play.turns()).toBe(before);
    expect(play.engine.serialize()).toEqual(replay(play.chat));
  });

  it("v2.7 finding 19: reopen after OOC lines equals the continuous run", () => {
    const continuous = new Play();
    const reopened = new Play();
    [continuous, reopened].forEach((play) => { play.send(1); play.send(2, "OOC: hold on"); });
    const fresh = new Play();
    fresh.chat.push(...reopened.chat);
    fresh.engine.hydrate(reopened.engine.serialize(), reopened.engine.serializeHistory());
    [continuous, fresh].forEach((play) => { play.send(1, "(OOC) back"); play.continueLast(); play.send(1); });
    expect(fresh.engine.serialize()).toEqual(continuous.engine.serialize());
    expect(fresh.turns()).toBe(replay(fresh.chat).blackboard.values[PLAYER_TURNS_KEY]);
  });

  it("v2.7 finding 19: rollback equals replay with OOC lines in the generator: 4 seeds x 100 cuts", () => {
    let mismatches = 0;
    let ooc = 0;
    for (const seed of [3, 11, 20261007, 777]) {
      const random = rng(seed);
      for (let cut = 0; cut < 100; cut += 1) {
        const play = new Play();
        const steps = 4 + Math.floor(random() * 10);
        for (let step = 0; step < steps; step += 1) {
          const roll = random();
          if (roll < 0.35) play.send(1 + Math.floor(random() * 3));
          else if (roll < 0.55) {
            play.send(1 + Math.floor(random() * 2), OOC_FORMS[Math.floor(random() * OOC_FORMS.length)]);
            ooc += 1;
          } else if (roll < 0.7) play.swipeLast();
          else if (play.chat.length) play.remove(Math.floor(random() * play.chat.length));
        }
        const live = play.engine.serialize();
        if (JSON.stringify({ ...live, chatLength: 0 }) !== JSON.stringify({ ...replay(play.chat), chatLength: 0 })) mismatches += 1;
      }
    }
    expect(ooc).toBeGreaterThan(100);
    expect(mismatches).toBe(0);
  });

  it("v2.7 finding 19 control: counting every user row disagrees once an OOC line is in the checkpoint", () => {
    const play = new Play();
    play.send(1);
    play.send(1, "((brb))");
    const every = play.chat.filter((row) => row.is_user).length;
    expect(every).toBe(2);
    expect(playerTurnsInCheckpoint(play.engine.serialize(), play.chat)).toBe(1);
  });

  it("writes nothing when the story does not declare the quality, and composes with the chance seam", () => {
    const view = { boundary: 1, activeCheckpointId: "camp", checkpointStartedBoundary: 0, checkpointStartedMessageId: -1, lastMessageId: 3, values: {} };
    const rows = [{ is_user: true }, { is_user: false }, { is_user: true }, { is_user: false }];
    const bare = parseStoryV2OrThrow({ ...RAW, qualities: RAW.qualities.slice(1), transitions: RAW.transitions.slice(1) });
    expect(playerTurnValues(bare, view, rows)).toEqual([]);
    const derive = deriveQualities(createChanceSeams(() => null), () => STORY, () => rows);
    expect(derive(view)).toEqual([{ q: PLAYER_TURNS_KEY, v: 2 }]);
  });
});
