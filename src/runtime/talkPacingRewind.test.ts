import { openerRelease, rewindDeferredOpener, sanitizeDeferredOpener } from "./openerDeferral";
import { cueForSwipe, recordCuedLine, rewindCuedLines, sanitizeCuedLines } from "./npcReplyRewind";
import { directorJudgeEligible } from "@judge/directorEligible";

describe("v3.0 19: a held opener follows the messages it was measured against", () => {
  const held = { checkpointId: "gate", at: 6, gate: 4 };

  it("a delete before the invitation shifts it, so the player's answer still releases it", () => {
    const rewound = rewindDeferredOpener(held, 2, { kind: "delete", removed: 2 });
    expect(rewound).toEqual({ checkpointId: "gate", at: 4, gate: 2 });
    const chat = [...Array.from({ length: 5 }, () => ({ mes: "x" })), { mes: "answer", is_user: true }];
    expect(openerRelease(rewound, "gate", chat)).toEqual({ kind: "fire", gate: 2 });
  });

  it("control: without the shift the same answer would sit before the old index and never release", () => {
    const chat = [...Array.from({ length: 5 }, () => ({ mes: "x" })), { mes: "answer", is_user: true }];
    expect(openerRelease(held, "gate", chat)).toEqual({ kind: "wait" });
  });

  it("an edit, swipe or delete of the invitation itself marks the hold for a recheck, which releases at the next reply", () => {
    for (const mutation of [{ kind: "edit" as const }, { kind: "swipe" as const }, { kind: "delete" as const, removed: 1 }]) {
      const rewound = rewindDeferredOpener(held, 6, mutation);
      expect(rewound).toMatchObject({ checkpointId: "gate", recheck: true, gate: 4 });
      expect(openerRelease(rewound, "gate", [])).toEqual({ kind: "fire", gate: 4, recheck: true });
    }
  });

  it("a rollback that reaches the transition that held it drops the hold, and a later mutation leaves it alone", () => {
    expect(rewindDeferredOpener(held, 4)).toBeUndefined();
    expect(rewindDeferredOpener(held, 3, { kind: "edit" })).toBeUndefined();
    expect(rewindDeferredOpener(held, 7, { kind: "edit" })).toBe(held);
    expect(rewindDeferredOpener({ checkpointId: "start", at: 0 }, 0)).toBeUndefined();
  });

  it("keeps the recheck flag across a reload", () => {
    expect(sanitizeDeferredOpener({ checkpointId: "gate", at: 5, recheck: true })).toEqual({ checkpointId: "gate", at: 5, recheck: true });
  });
});

describe("v3.0 19: cued lines re-arm their direction on a swipe and follow deletions", () => {
  const lines = recordCuedLine(recordCuedLine([], { messageId: 1, member: "Mara", text: "Ask." }), { messageId: 5, member: "Finn", text: "Tease." });

  it("a swipe or edit keeps the swiped line's cue and drops later ones", () => {
    expect(rewindCuedLines(lines, 5, { kind: "swipe" })).toEqual(lines);
    expect(rewindCuedLines(lines, 1, { kind: "edit" })).toEqual([lines[0]]);
    expect(cueForSwipe(lines, 5)?.member).toBe("Finn");
    expect(cueForSwipe(lines, 4)).toBeNull();
  });

  it("a delete drops the deleted line's cue and shifts the rest; a plain rollback drops everything from that message", () => {
    expect(rewindCuedLines(lines, 1, { kind: "delete", removed: 2 })).toEqual([{ messageId: 3, member: "Finn", text: "Tease." }]);
    expect(rewindCuedLines(lines, 2)).toEqual([lines[0]]);
  });

  it("sanitizes what it reloads", () => {
    expect(sanitizeCuedLines([{ messageId: 1, member: "Mara", text: "Ask." }, { messageId: "x" }, null])).toEqual([{ messageId: 1, member: "Mara", text: "Ask." }]);
  });
});

describe("v3.0 19: the judge counts the hand-back as an option", () => {
  const one = [{ rosterId: "mara", name: "Mara", role: "fighter" }];

  it("one remaining member plus PLAYER is a real choice", () => {
    expect(directorJudgeEligible(one, false, true)).toBe(true);
  });

  it("control: one member with no hand-back and no silence is not", () => {
    expect(directorJudgeEligible(one, false)).toBe(false);
  });
});
