import { recordNpcReplyFire, rewindNpcReplies } from "./npcReplyRewind";

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

  it("control: without recorded ids a spent count cannot be re-armed", () => {
    const counts: Record<string, number> = { k: 1 };
    rewindNpcReplies(counts, {}, 7);
    expect(counts).toEqual({ k: 1 });
  });
});
