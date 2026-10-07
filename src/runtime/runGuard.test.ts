// v2.3 plan 03: the guard every remaining write edge is converted onto.
//
// The fifty `todo` rows in the write-edge census are one shape repeated — read something slow,
// then mutate `extras` without re-checking which world you are in. `beginRun` is what makes the
// conversion uniform, so its own semantics have to be pinned before fifty sites depend on them.

import { beginRun, type RunContext, type RunOwnership, type RunToken, mintToken, tokenMatches } from "./runToken";
import { testOwnership } from "../../test/findings/testOwnership";

function world() {
  let current: RunContext = {
    chatId: "chat-a",
    storyId: "s1",
    storyHash: "h1",
    sessionEpoch: 1,
    windowRevision: 0,
    lowestMutatedMessageId: null,
  };
  const ownership: RunOwnership = {
    mint: (window = null) => mintToken(current, window),
    check: (token: RunToken) => tokenMatches(current, token),
  };
  return {
    ownership,
    move: (patch: Partial<RunContext>) => { current = { ...current, ...patch }; },
  };
}

describe("beginRun", () => {
  test("a run in its own world still owns it", () => {
    const w = world();
    const run = beginRun(w.ownership);
    expect(run.stillOwns()).toBe(true);
    expect(run.lapsed()).toBeNull();
    expect(run.lapsedDetail()).toBeNull();
  });

  test("a chat switch lapses the run and names the field", () => {
    const w = world();
    const run = beginRun(w.ownership);
    w.move({ chatId: "chat-b" });
    expect(run.stillOwns()).toBe(false);
    expect(run.lapsed()).toBe("chat");
    expect(run.lapsedDetail()).toContain("chat");
  });

  test("a story swap, a version bump and a restart each lapse the run", () => {
    for (const [patch, reason] of [
      [{ storyId: "s2" }, "story"],
      [{ storyHash: "h2" }, "revision"],
      [{ sessionEpoch: 2 }, "epoch"],
    ] as const) {
      const w = world();
      const run = beginRun(w.ownership);
      w.move(patch);
      expect(run.lapsed()).toBe(reason);
    }
  });

  test("the verdict is re-read on every call, not cached at mint", () => {
    // The whole point is to ask again immediately before each write. A guard that answered from a
    // value captured at mint would say "still yours" forever, which is the bug it replaces.
    const w = world();
    const run = beginRun(w.ownership);
    expect(run.stillOwns()).toBe(true);
    w.move({ chatId: "chat-b" });
    expect(run.stillOwns()).toBe(false);
  });

  test("an unowned run never lapses, so an unwired caller is unaffected", () => {
    // Deliberately permissive: fifty sites convert one at a time, and a half-converted tree must
    // keep working. The census guard, not this default, is what tracks real coverage.
    const run = beginRun(testOwnership());
    expect(run.stillOwns()).toBe(true);
    expect(run.lapsed()).toBeNull();
  });

  test("a window it was given is carried into the check", () => {
    // A read that saw messages 3..9 is invalidated by an EDIT inside that range, but not by a
    // reply merely appended after it — otherwise every ordinary turn would discard every read.
    const w = world();
    const run = beginRun(w.ownership, { from: 3, to: 9 });

    w.move({ windowRevision: 1, lowestMutatedMessageId: 20 });
    expect(run.stillOwns()).toBe(true);

    w.move({ windowRevision: 2, lowestMutatedMessageId: 5 });
    expect(run.lapsed()).toBe("window");
  });
});
