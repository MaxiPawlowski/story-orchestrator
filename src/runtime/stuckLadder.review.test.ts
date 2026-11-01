import { PLAYER_TURNS_KEY, StoryEngine, parseStoryOrThrow } from "@engine/index";
import { STUCK_GENERIC_LINE, composeGuidanceBlock, stuckLeadLine, stuckLine, stuckRead, type StuckRead } from "@pacing/index";
import { DEFAULT_AGENCY } from "@engine/agency";
import { playerTurnIds } from "./agencyRecovery";
import { playerTurnValues } from "./stretchTurns";

type Row = { is_user: boolean; mes?: string };

const LEADS = ["a dockhand mentions the ledger moved", "scratches lead to the back door", "a creditor asks for the ledger by name"];

const raw = (extra: Record<string, unknown> = {}, gate: unknown = { q: "ledger_found", op: "==", v: true }) => ({
  id: "stuck-dock", title: "Stuck dock", description: "A gated search.",
  qualities: [
    { key: PLAYER_TURNS_KEY, type: "int", source: "code", rubric: "player turns here" },
    { key: "ledger_found", type: "bool", source: "code", rubric: "the ledger was found" },
    { key: "noise", type: "int", source: "code", rubric: "how often the player shouted" },
  ],
  checkpoints: [
    { id: "dock", name: "The dock", objective: "Find the ledger.", type: "intermediate", start: true, leads: LEADS, ...extra },
    { id: "office", name: "The office", objective: "Read it.", type: "anchor" },
  ],
  transitions: [{ from: "dock", to: "office", priority: 1, gate: { any: [gate, { q: "noise", op: ">=", v: 99 }] } }],
  roster: [] as never[],
});

class Play {
  readonly chat: Row[] = [];
  readonly story;
  readonly engine: StoryEngine;

  constructor(story = parseStoryOrThrow(raw())) {
    this.story = story;
    this.engine = new StoryEngine({
      now: () => 0,
      derive: (view) => [
        ...playerTurnValues(story, view, this.chat),
        { q: "noise", v: this.chat.slice(0, view.lastMessageId + 1).filter((row) => row.is_user && /shout/.test(row.mes ?? "")).length },
      ],
    });
    this.engine.loadStory(story);
  }

  send(replies = 1, mes = "I look around.") {
    this.chat.push({ is_user: true, mes });
    for (let reply = 0; reply < replies; reply += 1) {
      this.chat.push({ is_user: false, mes: "A reply." });
      this.engine.commitBoundary({ lastMessageId: this.chat.length - 1, chatLength: this.chat.length });
    }
  }

  removeFrom(id: number) {
    this.chat.splice(id);
    const boundary = this.engine.boundaryBeforeMessage(id);
    if (boundary !== null) this.engine.rollbackTo(boundary);
    this.engine.clampToChat(this.chat.length);
  }

  read(): StuckRead | null {
    return stuckRead({ story: this.story, state: this.engine.serialize(), log: this.engine.stateLog, playerTurnIds: playerTurnIds(this.chat) });
  }
}

const replay = (chat: Row[]): Play => {
  const play = new Play();
  chat.forEach((row) => {
    play.chat.push({ ...row });
    if (!row.is_user) play.engine.commitBoundary({ lastMessageId: play.chat.length - 1, chatLength: play.chat.length });
  });
  return play;
};

describe("v3.0 43 P1: stuck ladder over the boundary log", () => {
  it("rung 0 until stuck_after quiet player turns, then one rung every three quiet turns", () => {
    const play = new Play();
    const rungs: number[] = [];
    for (let turn = 1; turn <= 13; turn += 1) {
      play.send();
      rungs.push(play.read()!.rung);
    }
    expect(rungs).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3]);
  });

  it("a group round of three replies is one player turn", () => {
    const play = new Play();
    for (let turn = 1; turn <= 6; turn += 1) play.send(3);
    expect(play.read()).toEqual({ rung: 1, quietTurns: 6, playerTurns: 6 });
  });

  it("any watched exit quality moving starts the count again", () => {
    const play = new Play();
    for (let turn = 1; turn <= 7; turn += 1) play.send();
    expect(play.read()!.rung).toBe(1);
    play.send(1, "I shout for the clerk.");
    expect(play.read()).toEqual({ rung: 0, quietTurns: 0, playerTurns: 8 });
    for (let turn = 1; turn <= 6; turn += 1) play.send();
    expect(play.read()).toEqual({ rung: 1, quietTurns: 6, playerTurns: 14 });
  });

  it("stuck_after is the author's", () => {
    const play = new Play(parseStoryOrThrow(raw({ stuck_after: 2 })));
    play.send();
    expect(play.read()!.rung).toBe(0);
    play.send();
    expect(play.read()!.rung).toBe(1);
  });

  it("rollback = replay: deleting turns gives the read a fresh replay of the remaining chat gives", () => {
    const play = new Play();
    for (let turn = 1; turn <= 9; turn += 1) play.send(1, turn === 3 ? "I shout." : "I wait.");
    expect(play.read()!.rung).toBe(1);
    play.removeFrom(4);
    expect(play.read()).toEqual(replay(play.chat).read());
    expect(play.read()!.rung).toBe(0);
  });

  it("no ladder on an open stretch, a beat without exits, or exits that read only counters", () => {
    const open = new Play(parseStoryOrThrow({ ...raw(), checkpoints: [{ id: "dock", name: "The dock", objective: "", type: "intermediate", start: true, stretch: { mode: "open", pace: "brief", arrive_when: { q: "ledger_found", op: "==", v: true } } },
      { id: "office", name: "The office", objective: "Read it.", type: "anchor" }], transitions: [{ from: "dock", to: "office", priority: 1, gate: { q: "ledger_found", op: "==", v: true } }] }));
    for (let turn = 1; turn <= 8; turn += 1) open.send();
    expect(open.read()).toBeNull();
    const counters = new Play(parseStoryOrThrow({ ...raw(), transitions: [{ from: "dock", to: "office", priority: 1, gate: { q: PLAYER_TURNS_KEY, op: ">=", v: 50 } }] }));
    for (let turn = 1; turn <= 8; turn += 1) counters.send();
    expect(counters.read()).toBeNull();
  });

  it("the line: lead k at rung k, then the generic nudge; with no leads the nudge waits for rung 2", () => {
    expect([0, 1, 2, 3, 4, 9].map((rung) => stuckLine(rung, LEADS))).toEqual([
      null, stuckLeadLine(LEADS[0]), stuckLeadLine(LEADS[1]), stuckLeadLine(LEADS[2]), STUCK_GENERIC_LINE, STUCK_GENERIC_LINE,
    ]);
    expect([0, 1, 2, 3].map((rung) => stuckLine(rung, []))).toEqual([null, null, STUCK_GENERIC_LINE, STUCK_GENERIC_LINE]);
  });

  it("the line rides the guidance block as world pressure and never writes the player", () => {
    const block = composeGuidanceBlock({ id: "dock", name: "The dock", objective: "Find the ledger.", type: "intermediate" }, DEFAULT_AGENCY, false, null, stuckLine(1, LEADS));
    expect(block).toContain(LEADS[0]);
    expect(block).toMatch(/never resolve it for \{\{user\}\}/);
    expect(stuckLine(1, LEADS)).not.toMatch(/\{\{user\}\} (decides|goes|finds)/);
  });
});
