import { recordNpcReplyFire, rewindNpcReplies, rewindOnEnterPosts, survivingOnEnterPosts, type OnEnterPost, type PostMutation } from "./npcReplyRewind";

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
      rewindNpcReplies(counts, at, messageId, survivingOnEnterPosts([opener], messageId, mutation), mutation);
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

  it("control: without recorded ids a spent count cannot be re-armed", () => {
    const counts: Record<string, number> = { k: 1 };
    rewindNpcReplies(counts, {}, 7);
    expect(counts).toEqual({ k: 1 });
  });
});
