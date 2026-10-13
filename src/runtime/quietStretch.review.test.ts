import { PLAYER_TURNS_KEY, StoryEngine, parseStoryV2OrThrow, type BoundaryLogEntry, type EngineState } from "@engine/index";
import { quietRead, watchedQualities, type QuietRead } from "@pacing/index";
import { playerTurnIds } from "./agencyRecovery";
import { playerTurnValues } from "./stretchTurns";

type Row = { is_user: boolean; is_system?: boolean; mes?: string };

const ARRIVE = { all: [{ q: "reached_walls", op: "==", v: true }, { q: "lamp_lit", op: "==", v: true }, { q: "flip", op: "==", v: true }, { q: PLAYER_TURNS_KEY, op: ">=", v: 99 }] };

const RAW = {
  format: 2,
  id: "quiet-road",
  title: "Quiet road",
  description: "An open road between two places.",
  qualities: [
    { key: PLAYER_TURNS_KEY, type: "int", source: "code", rubric: "player turns here" },
    { key: "lamp_lit", type: "bool", source: "code", rubric: "the party lit the lamp" },
    { key: "flip", type: "bool", source: "code", rubric: "the switch has been thrown an odd number of times" },
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
      { q: "flip", v: this.chat.slice(0, view.lastMessageId + 1).filter((row) => row.is_user && /switch/.test(row.mes ?? "")).length % 2 === 1 },
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
    expect(watchedQualities(STORY, "road")).toEqual(["reached_walls", "lamp_lit", "flip"]);
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

const FLIP = "I throw the switch.";

const referenceMoved = (chat: Row[], window = 3, pullAfter = 3): { playerTurns: number; moved: string[] } => {
  const lastBoundary = chat.reduce((last, row, id) => (row.is_user ? last : id), -1);
  const players = chat.flatMap((row, id) => (row.is_user && id < lastBoundary ? [id] : []));
  if (players.length < pullAfter) return { playerTurns: players.length, moved: [] };
  const windowStart = players[Math.max(0, players.length - window)];
  const moved = new Set<string>();
  const previous: Record<string, boolean> = { lamp_lit: false, flip: false };
  chat.forEach((row, id) => {
    if (row.is_user) return;
    const lamp = chat.slice(0, id + 1).some((earlier) => earlier.is_user && /lamp/.test(earlier.mes ?? ""));
    const flip = chat.slice(0, id + 1).filter((earlier) => earlier.is_user && /switch/.test(earlier.mes ?? "")).length % 2 === 1;
    Object.entries({ lamp_lit: lamp, flip }).forEach(([key, value]) => {
      if (id >= windowStart && value !== previous[key]) moved.add(key);
      previous[key] = value;
    });
  });
  return { playerTurns: players.length, moved: ["lamp_lit", "flip"].filter((key) => moved.has(key)) };
};

const viaReference = (chat: Row[]) => {
  const reference = referenceMoved(chat);
  return { holds: reference.playerTurns >= 3 && reference.moved.length === 0, playerTurns: reference.playerTurns, moved: reference.moved };
};

describe("v2.8 19 correction: quiet is no CHANGE over the window, not zero net change", () => {
  it("true -> false -> true inside the window stays not quiet until both moves have left it", () => {
    const play = new Play();
    play.send(1);
    play.send(1, FLIP);
    play.send(1, FLIP);
    expect(play.quiet()).toEqual({ holds: false, playerTurns: 3, moved: ["flip"] });
    play.send(1);
    expect(play.quiet()).toEqual({ holds: false, playerTurns: 4, moved: ["flip"] });
    play.send(1);
    expect(play.quiet()).toEqual({ holds: false, playerTurns: 5, moved: ["flip"] });
    play.send(1);
    expect(play.quiet()).toEqual({ holds: true, playerTurns: 6, moved: [] });
  });

  it("the first move of an out-and-back leaving the window does not quiet it while the second is still inside", () => {
    const play = new Play();
    play.send(1);
    play.send(1, FLIP);
    play.send(1);
    play.send(1);
    expect(play.quiet()?.moved).toEqual(["flip"]);
    play.send(1);
    expect(play.quiet()).toEqual({ holds: true, playerTurns: 5, moved: [] });
    play.send(1, FLIP);
    expect(play.quiet()?.moved).toEqual(["flip"]);
    play.send(1);
    play.send(1);
    expect(play.quiet()).toEqual({ holds: false, playerTurns: 8, moved: ["flip"] });
    play.send(1);
    expect(play.quiet()).toEqual({ holds: true, playerTurns: 9, moved: [] });
  });

  it("an out-and-back wholly before the window leaves it quiet", () => {
    const play = new Play();
    play.send(1, FLIP);
    play.send(1, FLIP);
    play.send(1);
    play.send(1);
    expect(play.quiet()).toEqual({ holds: false, playerTurns: 4, moved: ["flip"] });
    play.send(1);
    expect(play.quiet()).toEqual({ holds: true, playerTurns: 5, moved: [] });
  });

  it("agrees with an independent reading of the chat on scripted out-and-back, group and reply-count cases", () => {
    const scripts: Array<Array<[number, string?]>> = [
      [[1], [1, FLIP], [1, FLIP]],
      [[3], [3, FLIP], [3], [3, FLIP], [3]],
      [[2, LAMP], [2, FLIP], [2, FLIP], [2], [2]],
      [[1, FLIP], [2], [3], [1]],
    ];
    scripts.forEach((script) => {
      const play = new Play();
      script.forEach(([replies, mes], index) => {
        play.send(replies, mes);
        expect(play.quiet()).toEqual(viaReference(play.chat));
        expect({ script: script.length, index }).toEqual({ script: script.length, index });
      });
    });
  });

  it("control: the reference itself calls an out-and-back moved and a quiet tail quiet", () => {
    const chat: Row[] = [];
    const push = (mes: string) => { chat.push({ is_user: true, mes }, { is_user: false, mes: "A reply." }); };
    push("go"); push(FLIP); push(FLIP);
    expect(referenceMoved(chat).moved).toEqual(["flip"]);
    push("go"); push("go"); push("go");
    expect(referenceMoved(chat).moved).toEqual([]);
  });

  it("live, a replay of the chat and the reference agree over random sends, rounds, swipes, deletes, lamps and switches: 4 seeds x 100 cuts", () => {
    let mismatches = 0;
    let outAndBack = 0;
    let quiet = 0;
    for (const seed of [4, 13, 20261013, 909090]) {
      const random = rng(seed);
      for (let cut = 0; cut < 100; cut += 1) {
        const play = new Play();
        const steps = 5 + Math.floor(random() * 12);
        for (let step = 0; step < steps; step += 1) {
          const roll = random();
          if (roll < 0.55) {
            const pick = random();
            play.send(1 + Math.floor(random() * 3), pick < 0.15 ? LAMP : pick < 0.4 ? FLIP : "I walk on.");
          } else if (roll < 0.7) play.swipeLast();
          else if (play.chat.length) play.remove(Math.floor(random() * play.chat.length));
        }
        const live = play.quiet();
        const reference = viaReference(play.chat);
        if (JSON.stringify(live) !== JSON.stringify(reference) || JSON.stringify(replay(play.chat).quiet()) !== JSON.stringify(reference)) mismatches += 1;
        if (live?.moved.includes("flip") && play.chat.filter((row) => row.is_user && /switch/.test(row.mes ?? "")).length % 2 === 0) outAndBack += 1;
        if (live?.holds) quiet += 1;
      }
    }
    expect(outAndBack).toBeGreaterThan(10);
    expect(quiet).toBeGreaterThan(20);
    expect(mismatches).toBe(0);
  });
});

describe("v2.8 19 correction: the window reads every snapshot, from the log and the current state", () => {
  const snap = (active: string, started: number, values: Record<string, unknown>) =>
    ({ activeCheckpointId: active, checkpointStartedMessageId: started, lastMessageId: 0, blackboard: { values, versions: {}, latched: {} } });
  const entry = (lastMessageId: number, before: Record<string, unknown>, after: Record<string, unknown>, where: { active?: string; started?: number } = {}): BoundaryLogEntry =>
    ({
      at: 0, boundary: lastMessageId, before: snap(where.active ?? "road", where.started ?? -1, before), after: snap(where.active ?? "road", where.started ?? -1, after),
      fired: null, source: "gate", context: { lastMessageId, chatLength: lastMessageId + 1 }, queue: { applied: [], discarded: [] }, evaluated: null,
    }) as unknown as BoundaryLogEntry;
  const read = (log: BoundaryLogEntry[], now: Record<string, unknown>, ids = [0, 3, 6, 9], last = 10) => quietRead({
    story: STORY, state: { ...snap("road", -1, now), lastMessageId: last } as unknown as EngineState, log, playerTurnIds: ids,
  }) as QuietRead;

  it("a boolean out and back inside the window moves, with equal values at both ends", () => {
    const log = [entry(1, { lamp_lit: null }, { lamp_lit: true }), entry(4, { lamp_lit: true }, { lamp_lit: false }), entry(7, { lamp_lit: false }, { lamp_lit: true })];
    expect(read(log, { lamp_lit: true })).toEqual({ holds: false, playerTurns: 4, moved: ["lamp_lit"] });
  });

  it("a counter that goes 0 -> 1 -> 0 inside the window moves", () => {
    const counted = parseStoryV2OrThrow({
      ...RAW, qualities: [...RAW.qualities, { key: "stage", type: "int", source: "extractor", rubric: "the stage reached" }],
      transitions: [{ from: "road", to: "walls", priority: 1, gate: { all: [{ q: "stage", op: ">=", v: 9 }, ARRIVE] } }],
      checkpoints: RAW.checkpoints.map((checkpoint) => (checkpoint.id === "road" ? { ...checkpoint, stretch: { ...checkpoint.stretch, arrive_when: { all: [{ q: "stage", op: ">=", v: 9 }, ARRIVE] } } } : checkpoint)),
    });
    const log = [entry(1, { stage: 0 }, { stage: 0 }), entry(4, { stage: 0 }, { stage: 1 }), entry(7, { stage: 1 }, { stage: 0 })];
    const state = { ...snap("road", -1, { stage: 0 }), lastMessageId: 10 } as unknown as EngineState;
    expect(quietRead({ story: counted, state, log, playerTurnIds: [0, 3, 6, 9] })).toEqual({ holds: false, playerTurns: 4, moved: ["stage"] });
    expect(quietRead({ story: counted, state: { ...state, lastMessageId: 16 }, log, playerTurnIds: [0, 3, 6, 9, 12, 15] })).toMatchObject({ holds: true });
  });

  it("an out and back wholly before the window is settled, and one move outside plus one inside is not", () => {
    const early = [entry(1, { lamp_lit: null }, { lamp_lit: true }), entry(2, { lamp_lit: true }, { lamp_lit: false })];
    expect(read(early, { lamp_lit: false })).toEqual({ holds: true, playerTurns: 4, moved: [] });
    const split = [entry(1, { lamp_lit: null }, { lamp_lit: true }), entry(2, { lamp_lit: true }, { lamp_lit: true }), entry(7, { lamp_lit: true }, { lamp_lit: false })];
    expect(read(split, { lamp_lit: false }).moved).toEqual(["lamp_lit"]);
  });

  it("several boundaries inside one player turn are each read: a change and its undo in the same turn still count", () => {
    const log = [entry(7, { lamp_lit: false }, { lamp_lit: true }), entry(8, { lamp_lit: true }, { lamp_lit: false })];
    expect(read(log, { lamp_lit: false }, [0, 3, 6, 9], 9).moved).toEqual(["lamp_lit"]);
    expect(read(log, { lamp_lit: false }, [0, 3, 6, 9, 12, 15], 16)).toMatchObject({ holds: true });
    expect(read(log, { lamp_lit: false }, [0, 3, 6, 9, 12], 13)).toMatchObject({ holds: false });
  });

  it("a write that landed between two boundaries (the second boundary's before differs from the first's after) counts", () => {
    const log = [entry(4, { lamp_lit: false }, { lamp_lit: false }), entry(5, { lamp_lit: true }, { lamp_lit: true })];
    expect(read(log, { lamp_lit: true }).moved).toEqual(["lamp_lit"]);
  });

  it("the current state counts even when the log stops before it (a write after the last logged boundary)", () => {
    const log = [entry(7, { lamp_lit: false }, { lamp_lit: false })];
    expect(read(log, { lamp_lit: true }).moved).toEqual(["lamp_lit"]);
    expect(read(log, { lamp_lit: false }).holds).toBe(true);
  });

  it("nothing before the visit counts: another checkpoint's boundaries and an earlier visit to the same stretch are left out", () => {
    const before = [
      entry(1, { lamp_lit: false }, { lamp_lit: true }, { active: "camp" }), entry(2, { lamp_lit: true }, { lamp_lit: false }, { active: "camp" }),
      entry(3, { lamp_lit: false }, { lamp_lit: true }, { started: -5 }), entry(4, { lamp_lit: true }, { lamp_lit: false }, { started: -5 }),
    ];
    const visit = [entry(5, { lamp_lit: false }, { lamp_lit: false }), entry(8, { lamp_lit: false }, { lamp_lit: false })];
    expect(read([...before, ...visit], { lamp_lit: false })).toEqual({ holds: true, playerTurns: 4, moved: [] });
    expect(read(before, { lamp_lit: false })).toEqual({ holds: false, playerTurns: 4, moved: [] });
  });

  it("an unset value and a false, 0 or empty one are the same until something real happens", () => {
    const quiet = (a: unknown, b: unknown) => read([entry(7, { lamp_lit: a }, { lamp_lit: b })], { lamp_lit: b }).moved;
    expect(quiet(null, false)).toEqual([]);
    expect(quiet(undefined, false)).toEqual([]);
    expect(quiet(false, null)).toEqual([]);
    expect(quiet(null, true)).toEqual(["lamp_lit"]);
    expect(quiet(true, null)).toEqual(["lamp_lit"]);
  });

  it("mechanical counters never count, however they move", () => {
    const log = [entry(4, { [PLAYER_TURNS_KEY]: 1, message_count: 3, elapsed: 1 }, { [PLAYER_TURNS_KEY]: 2, message_count: 6, elapsed: 9 }), entry(7, { [PLAYER_TURNS_KEY]: 2 }, { [PLAYER_TURNS_KEY]: 3 })];
    expect(read(log, { [PLAYER_TURNS_KEY]: 4 })).toEqual({ holds: true, playerTurns: 4, moved: [] });
  });
});
