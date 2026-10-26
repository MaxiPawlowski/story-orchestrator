import type { BoundaryLogEntry } from "@engine/index";
import { npcReplyKey, npcReplyMayFire, recordNpcReplyFire, rewindNpcReplies } from "./npcReplyRewind";
import { consequenceSince, consequential } from "./speechConsequence";

const view = (patch: Partial<{ entryStart: number; send: number; playerTurns: number[] }> = {}) => ({ entryStart: 0, send: -1, playerTurns: [] as number[], ...patch });

describe("v3.0 19 stage 2: npc reply ids, scopes and cooldowns in player turns", () => {
  it("keys by the authored id, and by trigger:member:index without one (the stage 1 key)", () => {
    expect(npcReplyKey("road", { trigger: "onEnter", member: "Arin" }, 1)).toBe("road:onEnter:Arin:1");
    expect(npcReplyKey("road", { trigger: "onEnter", member: "Arin", id: "hook" }, 1)).toBe("road:hook");
  });

  it("story scope counts the whole chat; entry counts this visit; player_turn counts since the player's last line", () => {
    const counts: Record<string, number> = {};
    const at: Record<string, number[]> = {};
    recordNpcReplyFire(counts, at, "k", 5);
    expect(npcReplyMayFire(counts, at, "k", { trigger: "onEnter" }, view({ entryStart: 10 }))).toBe(false);
    expect(npcReplyMayFire(counts, at, "k", { trigger: "onEnter", once_per: "entry" }, view({ entryStart: 10 }))).toBe(true);
    expect(npcReplyMayFire(counts, at, "k", { trigger: "onEnter", once_per: "entry" }, view({ entryStart: 5 }))).toBe(false);
    expect(npcReplyMayFire(counts, at, "k", { trigger: "afterSpeak", once_per: "player_turn", cooldown_player_turns: 0 }, view({ send: 7 }))).toBe(true);
    expect(npcReplyMayFire(counts, at, "k", { trigger: "afterSpeak", once_per: "player_turn", cooldown_player_turns: 0 }, view({ send: 4 }))).toBe(false);
  });

  it("afterSpeak and sceneBreak wait two player turns by default, however many party lines come between", () => {
    const counts: Record<string, number> = {};
    const at: Record<string, number[]> = {};
    recordNpcReplyFire(counts, at, "k", 10);
    const line = { trigger: "sceneBreak" as const, maxTriggers: 3 };
    expect(npcReplyMayFire(counts, at, "k", line, view({ playerTurns: [3, 30] }))).toBe(false);
    expect(npcReplyMayFire(counts, at, "k", line, view({ playerTurns: [3, 12, 13] }))).toBe(true);
    expect(npcReplyMayFire(counts, at, "k", { ...line, cooldown_player_turns: 3 }, view({ playerTurns: [12, 13] }))).toBe(false);
  });

  it("rollback ≡ replay: a fire rewound away re-arms exactly as if it never happened", () => {
    const counts: Record<string, number> = {};
    const at: Record<string, number[]> = {};
    recordNpcReplyFire(counts, at, "k", 4);
    recordNpcReplyFire(counts, at, "k", 9);
    rewindNpcReplies(counts, at, 8);
    const replayCounts: Record<string, number> = {};
    const replayAt: Record<string, number[]> = {};
    recordNpcReplyFire(replayCounts, replayAt, "k", 4);
    expect({ counts, at }).toEqual({ counts: replayCounts, at: replayAt });
    const line = { trigger: "afterSpeak" as const, maxTriggers: 2, once_per: "entry" as const };
    expect(npcReplyMayFire(counts, at, "k", line, view({ playerTurns: [5, 6] }))).toBe(npcReplyMayFire(replayCounts, replayAt, "k", line, view({ playerTurns: [5, 6] })));
  });
});

const entry = (boundary: number, lastMessageId: number, patch: { fired?: boolean; before?: Record<string, unknown>; after?: Record<string, unknown> } = {}) => ({
  boundary, fired: patch.fired ? { from: "a", to: "b" } : null, context: { lastMessageId, chatLength: lastMessageId + 1 },
  before: { blackboard: { values: patch.before ?? {} } }, after: { blackboard: { values: patch.after ?? {} } },
}) as unknown as BoundaryLogEntry;

describe("v3.0 19 stage 2: consequential events for a reaction beat", () => {
  it("a fired transition, a closed or rewarded quest or a rolled check is consequential; other writes are not", () => {
    expect(consequential(entry(1, 1, { fired: true }))).toBe(true);
    expect(consequential(entry(1, 1, { before: { quest_ferry_closed: false }, after: { quest_ferry_closed: true } }))).toBe(true);
    expect(consequential(entry(1, 1, { after: { check_climb_rolled: 3 } }))).toBe(true);
    expect(consequential(entry(1, 1, { before: { trust: 1 }, after: { trust: 2 } }))).toBe(false);
  });

  it("only boundaries since the player's latest line count", () => {
    const chat = [{ name: "Rook", mes: "a", is_user: true }, { name: "Mara", mes: "b" }, { name: "Rook", mes: "c", is_user: true }, { name: "Mara", mes: "d" }];
    expect(consequenceSince([entry(1, 1, { fired: true }), entry(2, 3)], chat)).toBeNull();
    expect(consequenceSince([entry(1, 1), entry(2, 3, { fired: true })], chat)).toBe("2@3");
    expect(consequenceSince([entry(2, 3, { fired: true })], [])).toBeNull();
  });
});
