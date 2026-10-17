import type { BoundaryLogEntry } from "@engine/index";
import { clearRegeneration, noteRegeneration, noteRenderAnchor, outcomeAnchor, regeneratingMessage, resetRegeneration } from "./regeneration";

const entry = (boundary: number, before: number, after: number) =>
  ({ boundary, before: { lastMessageId: before }, after: { lastMessageId: after }, context: { lastMessageId: after } }) as unknown as BoundaryLogEntry;

describe("v2.8 69 follow-up: a swipe regenerates against the state its reply was generated in", () => {
  const log = [entry(3, 0, 0), entry(4, 0, 1)];

  it("a one-reply round: the swipe of reply 1 anchors the outcome at message 0 again", () => {
    expect(outcomeAnchor(log, 1, 1)).toBe(0);
  });

  it("a two-reply round committed as one boundary: the swipe of the last reply anchors where the round started", () => {
    expect(outcomeAnchor([entry(3, 0, 0), entry(4, 0, 2)], 2, 2)).toBe(0);
  });

  it("control: no regeneration, or a message no boundary consumed yet, keeps the engine's last message", () => {
    expect(outcomeAnchor(log, null, 1)).toBe(1);
    expect(outcomeAnchor(log, 5, 1)).toBe(1);
  });

  it("a two-reply round committed as two boundaries: the swipe of the last reply anchors where the engine stood when it rendered", () => {
    resetRegeneration();
    const split = [entry(3, 0, 0), entry(4, 0, 1), entry(5, 1, 2)];
    expect(outcomeAnchor(split, 2, 2)).toBe(1);
    noteRenderAnchor(2, 0);
    expect(outcomeAnchor(split, 2, 2)).toBe(0);
    resetRegeneration();
    expect(outcomeAnchor(split, 2, 2)).toBe(1);
  });

  it("the regeneration target is noted and cleared", () => {
    noteRegeneration(4);
    expect(regeneratingMessage()).toBe(4);
    clearRegeneration();
    expect(regeneratingMessage()).toBeNull();
  });
});
