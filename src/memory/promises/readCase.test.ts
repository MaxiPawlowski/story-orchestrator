import type { PromiseWindowMessage } from "./impl";
import { applyReadLines, seedPromises, seededRefs, type PromiseCaseContext } from "./readCase";

const CAST = [{ id: "mira", names: ["Mira", "mira"] }, { id: "tobin", names: ["Tobin", "tobin"] }];
const msg = (messageId: number, speaker: string, text: string): PromiseWindowMessage => ({ messageId, speaker, text, isUser: speaker === "Rowan" });

const MESSAGES = [
  msg(0, "Mira", "My lantern broke."),
  msg(1, "Rowan", "Mira, I promise I'll bring you a new lantern."),
  msg(2, "Tobin", "Fetch my iron."),
  msg(3, "Rowan", "Tobin, I promise I'll fetch your iron."),
  msg(4, "Mira", "The new lantern is lovely. You kept your word."),
];

const ctx: PromiseCaseContext = { chatId: "p47-case", storyId: "s", messages: MESSAGES, cast: CAST, playerNames: ["Rowan"] };

const SEEDS = [
  { key: "a", promisee: "mira", messageId: 1, quote: "I promise I'll bring you a new lantern" },
  { key: "b", promisee: "tobin", messageId: 3, quote: "I promise I'll fetch your iron" },
];

describe("plan 47 P1/P2 harness seam: seed open promises by key, then apply one read's lines", () => {
  it("seeds through the shipped acceptor and maps each key to its stable id", () => {
    const seeded = seedPromises(SEEDS, ctx);
    expect(seeded.refused).toEqual([]);
    expect(Object.keys(seeded.ids)).toEqual(["a", "b"]);
    expect(seeded.ids).toEqual(seedPromises(SEEDS, ctx).ids);
    expect(seededRefs(seeded, CAST)).toEqual([
      { id: seeded.ids.a, promisee: "Mira", quote: SEEDS[0].quote },
      { id: seeded.ids.b, promisee: "Tobin", quote: SEEDS[1].quote },
    ]);
  });

  it("reports a seed the acceptor refuses instead of dropping it silently", () => {
    const seeded = seedPromises([{ key: "x", promisee: "mira", messageId: 0, quote: "My lantern broke" }], ctx);
    expect(seeded.ids).toEqual({});
    expect(seeded.refused).toEqual([{ key: "x", reason: "not the player's own words" }]);
  });

  it("returns new rows, new events with their key and each line's outcome", () => {
    const seeded = seedPromises([SEEDS[0]], ctx);
    const outcome = applyReadLines(seeded.state, [
      `[kept] ${seeded.ids.a} | m=4 | "You kept your word"`,
      '[promised] Tobin | m=3 | "I promise I\'ll fetch your iron"',
      '[promised] Mira | m=0 | "My lantern broke"',
      '[promised] Mira | "no message id"',
    ], ctx, { from: 2, to: 4 }, seeded.ids);
    expect(outcome.events).toEqual([{ rowId: seeded.ids.a, key: "a", kind: "kept", messageId: 4, quote: "You kept your word" }]);
    expect(outcome.rows).toEqual([expect.objectContaining({ key: null, promisee: "tobin", messageId: 3, isUser: true, quote: SEEDS[1].quote, conditional: false })]);
    expect(outcome.lines.map((line) => line.outcome)).toEqual(["accepted", "accepted", "refused", "unparsed"]);
    expect(outcome.lines[2].reason).toBe("message is not in the read's window");
  });

  it("an event pointed at the wrong open id is applied to that id (what P2w counts)", () => {
    const seeded = seedPromises(SEEDS, ctx);
    const outcome = applyReadLines(seeded.state, [`[kept] ${seeded.ids.b} | m=4 | "You kept your word"`], ctx, { from: 4, to: 4 }, seeded.ids);
    expect(outcome.events).toEqual([]);
    expect(outcome.lines[0]).toMatchObject({ outcome: "refused", reason: "kept needs the player's action or the promisee's acknowledgement" });
  });
});
