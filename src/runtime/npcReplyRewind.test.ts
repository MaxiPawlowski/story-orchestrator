import { npcReplyMayFire, recordNpcReplyFire, rewindNpcReplies, rewindOnEnterPosts, type OnEnterPost, type PostMutation } from "./npcReplyRewind";

describe("npc reply fire rewind (SP7 rollback)", () => {
  it("drops fires at or after the cut and keeps earlier ones", () => {
    const counts: Record<string, number> = {};
    const at: Record<string, number[]> = {};
    recordNpcReplyFire(counts, at, "cp:onEnter:Mara:0", 3);
    recordNpcReplyFire(counts, at, "cp:afterSpeak:Nan:1", 5);
    recordNpcReplyFire(counts, at, "cp:afterSpeak:Nan:1", 9);

    expect(counts).toEqual({ "cp:onEnter:Mara:0": 1, "cp:afterSpeak:Nan:1": 2 });

    rewindNpcReplies(counts, at, 9);
    expect(counts).toEqual({ "cp:onEnter:Mara:0": 1, "cp:afterSpeak:Nan:1": 1 });
    expect(at["cp:afterSpeak:Nan:1"]).toEqual([5]);

    rewindNpcReplies(counts, at, 5);
    expect(counts).toEqual({ "cp:onEnter:Mara:0": 1 });
    expect(at["cp:afterSpeak:Nan:1"]).toBeUndefined();
  });

  it("leaves fires before the cut untouched", () => {
    const counts: Record<string, number> = { k: 1 };
    const at: Record<string, number[]> = { k: [2] };
    rewindNpcReplies(counts, at, 7);
    expect(counts).toEqual({ k: 1 });
    expect(at).toEqual({ k: [2] });
  });

  describe("T4-1: a scene opener still in the chat stays spent when the reply that opened its scene goes (T4-1-1 delete of msg 18)", () => {
    const opener: OnEnterPost = { checkpointId: "whispers", gate: 20, first: 21, last: 21 };
    const key = "whispers:onEnter:Adolion Narrator:0";
    const after = (messageId: number, mutation?: PostMutation) => {
      const counts: Record<string, number> = {};
      const at: Record<string, number[]> = {};
      recordNpcReplyFire(counts, at, key, 20);
      rewindNpcReplies(counts, at, messageId, mutation);
      return { counts, at, posts: rewindOnEnterPosts([opener], messageId, mutation) };
    };

    it("a delete before the opener keeps it spent and shifts its record", () => {
      expect(after(18, { kind: "delete", removed: 1 })).toEqual({ counts: { [key]: 1 }, at: { [key]: [19] }, posts: [{ checkpointId: "whispers", gate: 19, first: 20, last: 20 }] });
      expect(after(20, { kind: "delete", removed: 1 }).posts).toEqual([{ checkpointId: "whispers", gate: 19, first: 20, last: 20 }]);
    });

    it("a swipe or edit of an earlier reply keeps it spent in place", () => {
      expect(after(20, { kind: "swipe" })).toEqual({ counts: { [key]: 1 }, at: { [key]: [20] }, posts: [opener] });
      expect(after(18, { kind: "edit" }).posts).toEqual([opener]);
    });

    it("control: a mutation that reaches the opener itself, or one no event named, re-arms it", () => {
      expect(after(19, { kind: "delete", removed: 3 })).toEqual({ counts: {}, at: {}, posts: [] });
      expect(after(18)).toEqual({ counts: {}, at: {}, posts: [] });
    });
  });

  describe("T4-1-2: a scripted line still in the chat after a step back stays used; a line the step back removed is re-armed", () => {
    const fired = (key: string, ...ids: number[]) => {
      const counts: Record<string, number> = {};
      const at: Record<string, number[]> = {};
      for (const id of ids) recordNpcReplyFire(counts, at, key, id);
      return { counts, at };
    };

    it("Welden: the line posted as msg 5 after the transition reply 4 stays used when msg 4 is deleted, and the re-entry at msg 6 does not post it again", () => {
      const key = "nightriver-house:sceneBreak:Adolion Narrator:0";
      const state = fired(key, 4);
      rewindNpcReplies(state.counts, state.at, 4, { kind: "delete", removed: 1 });
      expect(state).toEqual({ counts: { [key]: 1 }, at: { [key]: [3] } });
      expect(npcReplyMayFire(state.counts, state.at, key, undefined, "sceneBreak", 6)).toBe(false);
    });

    it("Trial: the whispers line at msg 26 stays used through the edit of 27 and through an edit of its own gate (25); its second authored trigger waits for the spacing", () => {
      const key = "whispers:sceneBreak:Adolion Narrator:0";
      for (const messageId of [27, 25]) {
        const state = fired(key, 25);
        rewindNpcReplies(state.counts, state.at, messageId, { kind: "edit" });
        expect(state).toEqual({ counts: { [key]: 1 }, at: { [key]: [25] } });
        expect(npcReplyMayFire(state.counts, state.at, key, 2, "sceneBreak", 31)).toBe(false);
      }
    });

    it("a delete of earlier messages keeps every surviving line used and shifts each record by what went", () => {
      const key = "whispers:sceneBreak:Adolion Narrator:0";
      const state = fired(key, 25, 34);
      rewindNpcReplies(state.counts, state.at, 20, { kind: "delete", removed: 2 });
      expect(state).toEqual({ counts: { [key]: 2 }, at: { [key]: [23, 32] } });
    });

    it("control: the line's own message deleted (or swiped) re-arms it, and the earlier fire stays", () => {
      const key = "whispers:sceneBreak:Adolion Narrator:0";
      const deleted = fired(key, 25, 34);
      rewindNpcReplies(deleted.counts, deleted.at, 35, { kind: "delete", removed: 1 });
      expect(deleted).toEqual({ counts: { [key]: 1 }, at: { [key]: [25] } });
      const swiped = fired(key, 34);
      rewindNpcReplies(swiped.counts, swiped.at, 35, { kind: "swipe" });
      expect(swiped).toEqual({ counts: {}, at: {} });
    });

    it("control: the Night of Knives opener deleted with its transition (msg 44 after gate 43) is re-armed for the re-entry", () => {
      const key = "night-of-knives:onEnter:Adolion Narrator:0";
      const state = fired(key, 43);
      rewindNpcReplies(state.counts, state.at, 44, { kind: "delete", removed: 1 });
      expect(state).toEqual({ counts: {}, at: {} });
    });
  });

  it("control: without recorded ids a spent count cannot be re-armed", () => {
    const counts: Record<string, number> = { k: 1 };
    rewindNpcReplies(counts, {}, 7);
    expect(counts).toEqual({ k: 1 });
  });
});
