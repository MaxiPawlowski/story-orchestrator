import { PLAYER_TURNS_KEY, StoryEngine, parseStoryV2OrThrow, type EngineState } from "@engine/index";
import { quietRead, watchedQualities, type QuietRead } from "@pacing/index";
import { playerTurnIds } from "./agencyRecovery";
import { playerTurnValues } from "./stretchTurns";

type Row = { is_user: boolean; is_system?: boolean; mes?: string };

const ARRIVE = { all: [{ q: "reached_walls", op: "==", v: true }, { q: "lamp_lit", op: "==", v: true }, { q: PLAYER_TURNS_KEY, op: ">=", v: 99 }] };

const RAW = {
  format: 2,
  id: "quiet-road",
  title: "Quiet road",
  description: "An open road between two places.",
  qualities: [
    { key: PLAYER_TURNS_KEY, type: "int", source: "code", rubric: "player turns here" },
    { key: "lamp_lit", type: "bool", source: "code", rubric: "the party lit the lamp" },
    { key: "reached_walls", type: "bool", source: "extractor", rubric: "the party reached the walls" },
  ],
  checkpoints: [
    { id: "road", name: "On the road", objective: "", type: "intermediate", start: true, stretch: { mode: "open", pace: "brief", offer: ["encounters"], arrive_when: ARRIVE } },
    { id: "walls", name: "The walls", objective: "Arrive.", type: "anchor" },
  ],
  transitions: [{ from: "road", to: "walls", priority: 1, gate: ARRIVE }],
  roster: [] as never[],
};
const STORY = parseStoryV2OrThrow(RAW);

class Play {
  readonly chat: Row[] = [];
  readonly engine = new StoryEngine({
    now: () => 0,
    derive: (view) => [
      ...playerTurnValues(STORY, view, this.chat),
      { q: "lamp_lit", v: this.chat.slice(0, view.lastMessageId + 1).some((row) => row.is_user && /lamp/.test(row.mes ?? "")) },
    ],
  });

  constructor() {
    this.engine.loadStory(STORY);
  }

  commitAt(id: number) {
    this.engine.commitBoundary({ lastMessageId: id, chatLength: this.chat.length });
  }

  send(replies: number, mes = "I walk on.") {
    this.chat.push({ is_user: true, mes });
    for (let reply = 0; reply < replies; reply += 1) {
      this.chat.push({ is_user: false, mes: "A reply." });
      this.commitAt(this.chat.length - 1);
    }
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

  quiet(window?: number): QuietRead | null {
    return quietRead({ story: STORY, state: this.engine.serialize(), log: this.engine.stateLog, playerTurnIds: playerTurnIds(this.chat), window });
  }
}

const replay = (chat: Row[]): Play => {
  const play = new Play();
  play.chat.push(...chat.map((row) => ({ ...row })));
  play.catchUp();
  return play;
};

const rng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const LAMP = "I light the lamp.";

describe("v2.8 19: trigger quiet is pure over the log, the snapshots and the player turns", () => {
  it("watches the qualities the stretch's outgoing gates name, arrive_when included, and no mechanical counter", () => {
    expect(watchedQualities(STORY, "road")).toEqual(["reached_walls", "lamp_lit"]);
    expect(watchedQualities(STORY, "walls")).toEqual([]);
  });

  it("is not a stretch's business outside an open stretch", () => {
    const state = { activeCheckpointId: "walls", checkpointStartedMessageId: -1, lastMessageId: 3, blackboard: { values: {}, versions: {}, latched: {} } } as unknown as EngineState;
    expect(quietRead({ story: STORY, state, log: [], playerTurnIds: [0, 2] })).toBeNull();
    expect(quietRead({ story: null, state: null, log: [], playerTurnIds: [] })).toBeNull();
  });

  it("does not hold before pull_after player turns, and holds at pull_after when nothing a gate names has moved", () => {
    const play = new Play();
    play.send(1);
    play.send(1);
    expect(play.quiet()).toEqual({ holds: false, playerTurns: 2, moved: [] });
    play.send(1);
    expect(play.quiet()).toEqual({ holds: true, playerTurns: 3, moved: [] });
  });

  it("a group round of three replies is one player turn, so nine replies in three rounds are three turns, not nine", () => {
    const play = new Play();
    play.send(3);
    expect(play.quiet()).toEqual({ holds: false, playerTurns: 1, moved: [] });
    expect(play.engine.serialize().boundary).toBe(3);
    play.send(3);
    play.send(3);
    expect(play.engine.serialize().boundary).toBe(9);
    expect(play.quiet()).toEqual({ holds: true, playerTurns: 3, moved: [] });
  });

  it("control: counting boundaries as turns would call a single group round quiet", () => {
    const play = new Play();
    play.send(3);
    expect(play.engine.serialize().boundary).toBeGreaterThanOrEqual(3);
    expect(play.quiet()?.holds).toBe(false);
  });

  it("a watched quality that moved inside the last three player turns breaks the quiet, and the quiet returns when the window has passed it", () => {
    const play = new Play();
    play.send(2);
    play.send(2, LAMP);
    play.send(2);
    expect(play.quiet()).toEqual({ holds: false, playerTurns: 3, moved: ["lamp_lit"] });
    play.send(2);
    expect(play.quiet()).toEqual({ holds: false, playerTurns: 4, moved: ["lamp_lit"] });
    play.send(2);
    expect(play.quiet()).toEqual({ holds: true, playerTurns: 5, moved: [] });
  });

  it("a move on the very first player turn counts against the entry state, and falls out of the window like any other", () => {
    const play = new Play();
    play.send(1, LAMP);
    play.send(1);
    play.send(1);
    expect(play.quiet()?.moved).toEqual(["lamp_lit"]);
    play.send(1);
    expect(play.quiet()).toEqual({ holds: true, playerTurns: 4, moved: [] });
  });

  it("the window is a number of player turns: a narrower window forgives an older move", () => {
    const play = new Play();
    play.send(1, LAMP);
    play.send(1);
    play.send(1);
    play.send(1);
    expect(play.quiet(3)?.holds).toBe(true);
    expect(play.quiet(4)?.moved).toEqual(["lamp_lit"]);
  });

  it("a swipe of the last reply keeps the read", () => {
    const play = new Play();
    play.send(2);
    play.send(2, LAMP);
    play.send(3);
    const before = play.quiet();
    play.swipeLast();
    expect(play.quiet()).toEqual(before);
    expect(before).toEqual({ holds: false, playerTurns: 3, moved: ["lamp_lit"] });
  });

  it("deleting a player line lowers the turns, drops the quiet, and agrees with a replay of the chat as it now is", () => {
    const play = new Play();
    play.send(1);
    play.send(1);
    play.send(1);
    expect(play.quiet()?.holds).toBe(true);
    play.remove(0);
    expect(play.quiet()).toEqual({ holds: false, playerTurns: 2, moved: [] });
    expect(play.quiet()).toEqual(replay(play.chat).quiet());
  });

  it("deleting the line that moved a quality restores the quiet", () => {
    const play = new Play();
    play.send(1);
    play.send(1, LAMP);
    play.send(1);
    expect(play.quiet()?.moved).toEqual(["lamp_lit"]);
    play.remove(2);
    play.send(1);
    expect(play.quiet()).toEqual(replay(play.chat).quiet());
    expect(play.quiet()?.moved).toEqual([]);
  });

  it("a reopened chat reads the same as the continuous run, before and after more play", () => {
    const continuous = new Play();
    const reopened = new Play();
    [continuous, reopened].forEach((play) => { play.send(2); play.send(2, LAMP); play.send(1); });
    const fresh = new Play();
    fresh.chat.push(...reopened.chat);
    fresh.engine.hydrate(reopened.engine.serialize(), reopened.engine.serializeHistory());
    expect(fresh.quiet()).toEqual(continuous.quiet());
    [continuous, fresh].forEach((play) => { play.send(3); play.send(1); });
    expect(fresh.quiet()).toEqual(continuous.quiet());
    expect(fresh.engine.serialize()).toEqual(continuous.engine.serialize());
  });

  it("a stretch with no log behind it is not quiet: nothing proves the last turns were still", () => {
    const play = new Play();
    play.send(1);
    play.send(1);
    play.send(1);
    const read = quietRead({ story: STORY, state: play.engine.serialize(), log: [], playerTurnIds: playerTurnIds(play.chat) });
    expect(read).toEqual({ holds: false, playerTurns: 3, moved: [] });
  });

  it("quiet equals a replay of the chat over random sends, group rounds, swipes, deletes and moves: 4 seeds x 100 cuts", () => {
    let mismatches = 0;
    let quiet = 0;
    let broken = 0;
    for (const seed of [2, 9, 20261013, 515151]) {
      const random = rng(seed);
      for (let cut = 0; cut < 100; cut += 1) {
        const play = new Play();
        const steps = 4 + Math.floor(random() * 12);
        for (let step = 0; step < steps; step += 1) {
          const roll = random();
          if (roll < 0.5) play.send(1 + Math.floor(random() * 3), random() < 0.2 ? LAMP : "I walk on.");
          else if (roll < 0.7) play.swipeLast();
          else if (play.chat.length) play.remove(Math.floor(random() * play.chat.length));
        }
        const live = play.quiet();
        if (JSON.stringify(live) !== JSON.stringify(replay(play.chat).quiet())) mismatches += 1;
        if (live?.holds) quiet += 1;
        if (live && live.moved.length) broken += 1;
      }
    }
    expect(quiet).toBeGreaterThan(20);
    expect(broken).toBeGreaterThan(20);
    expect(mismatches).toBe(0);
  });
});
