// v2.3 plan 03. Every later plan's write edges depend on this comparison being right, so each way
// a late result can belong to a different world is asserted here — and, just as important, the
// cases that must NOT be discarded, because a token that rejects everything is as useless as one
// that accepts everything.

import { describeMismatch, mintToken, tokenMatches, type RunContext } from "./runToken";

const context = (overrides: Partial<RunContext> = {}): RunContext => ({
  chatId: "chat-a",
  storyId: "adolion-adventurer",
  playedVersion: 9,
  sessionEpoch: 1,
  windowRevision: 0,
  lowestMutatedMessageId: null,
  ...overrides,
});

describe("a result may be written when the world it belongs to is still current", () => {
  it("accepts an unchanged world", () => {
    const token = mintToken(context(), { from: 0, to: 7 });
    expect(tokenMatches(context(), token)).toEqual({ ok: true });
  });

  it("accepts a reply appended after the window it read", () => {
    // The answer is still true about messages 0-7. Discarding it here would throw away every read
    // that raced an ordinary turn, which is nearly all of them.
    const token = mintToken(context(), { from: 0, to: 7 });
    const later = context({ windowRevision: 1, lowestMutatedMessageId: 9 });
    expect(tokenMatches(later, token)).toEqual({ ok: true });
  });

  it("accepts work that read no window at all when the transcript moved", () => {
    const token = mintToken(context(), null);
    expect(tokenMatches(context({ windowRevision: 4, lowestMutatedMessageId: 0 }), token)).toEqual({ ok: true });
  });
});

describe("a result is discarded when it belongs to another world", () => {
  it("refuses a different chat — the R1 case", () => {
    const token = mintToken(context({ chatId: "chat-a" }));
    const check = tokenMatches(context({ chatId: "chat-b" }), token);
    expect(check).toMatchObject({ ok: false, reason: "chat" });
    expect(describeMismatch(check)).toContain("belongs to chat chat-a");
  });

  it("refuses two chats sitting at the same message index — the C1 case", () => {
    // Comparing the last message index is what the shipped code does, and it compares equal here.
    const token = mintToken(context({ chatId: "chat-a" }), { from: 0, to: 7 });
    expect(tokenMatches(context({ chatId: "chat-b" }), token)).toMatchObject({ ok: false, reason: "chat" });
  });

  it("refuses a different story", () => {
    const token = mintToken(context());
    expect(tokenMatches(context({ storyId: "adolion-academy" }), token)).toMatchObject({ ok: false, reason: "story" });
  });

  it("refuses a story that changed version while the work ran", () => {
    const token = mintToken(context({ playedVersion: 9 }));
    expect(tokenMatches(context({ playedVersion: 10 }), token)).toMatchObject({ ok: false, reason: "version" });
  });

  it("refuses work minted before a restart, even in the same chat and story", () => {
    const token = mintToken(context({ sessionEpoch: 1 }));
    expect(tokenMatches(context({ sessionEpoch: 2 }), token)).toMatchObject({ ok: false, reason: "epoch" });
  });

  it("refuses a read whose own window was edited underneath it", () => {
    const token = mintToken(context(), { from: 0, to: 7 });
    const check = tokenMatches(context({ windowRevision: 1, lowestMutatedMessageId: 5 }), token);
    expect(check).toMatchObject({ ok: false, reason: "window" });
    expect(describeMismatch(check)).toContain("message 5 was edited");
  });

  it("refuses a read on the boundary of its own window", () => {
    const token = mintToken(context(), { from: 0, to: 7 });
    expect(tokenMatches(context({ windowRevision: 1, lowestMutatedMessageId: 7 }), token)).toMatchObject({ ok: false, reason: "window" });
  });

  it("treats an unrecorded mutation point as possibly inside the window", () => {
    // "We did not record which message moved" is not "it was outside". The conservative reading is
    // the only safe one: a wrong accept writes a stale fact, a wrong discard costs one read.
    const token = mintToken(context(), { from: 0, to: 7 });
    const check = tokenMatches(context({ windowRevision: 1, lowestMutatedMessageId: null }), token);
    expect(check).toMatchObject({ ok: false, reason: "window" });
    expect(describeMismatch(check)).toContain("mutation point was not recorded");
  });
});

describe("the mismatch reported is the most fundamental one", () => {
  it("reports the epoch before the chat when both changed", () => {
    // A restart explains the chat change; naming the chat would send a reader looking for a switch
    // that did not happen.
    const token = mintToken(context({ chatId: "chat-a", sessionEpoch: 1 }));
    expect(tokenMatches(context({ chatId: "chat-b", sessionEpoch: 2 }), token)).toMatchObject({ reason: "epoch" });
  });

  it("reports the chat before the story when both changed", () => {
    const token = mintToken(context({ chatId: "chat-a", storyId: "s1" }));
    expect(tokenMatches(context({ chatId: "chat-b", storyId: "s2" }), token)).toMatchObject({ reason: "chat" });
  });
});

describe("a minted token is a snapshot, not a live view", () => {
  it("does not change when the context it was minted from is mutated", () => {
    const live = context();
    const token = mintToken(live, { from: 0, to: 7 });
    live.chatId = "chat-b";
    live.sessionEpoch = 99;
    expect(token.chatId).toBe("chat-a");
    expect(token.sessionEpoch).toBe(1);
    expect(tokenMatches(live, token)).toMatchObject({ ok: false });
  });

  it("copies the window rather than aliasing it", () => {
    const window = { from: 0, to: 7 };
    const token = mintToken(context(), window);
    window.to = 99;
    expect(token.window).toEqual({ from: 0, to: 7 });
  });
});
