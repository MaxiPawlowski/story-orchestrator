import { RunOwner } from "./runOwner";
import { beginRun } from "./runToken";
import { testOwnership } from "../../test/findings/testOwnership";

const owner = (chat = "chat-a") => {
  const deps = { chat };
  const runOwner = new RunOwner({ openChatId: () => deps.chat, storyId: () => "s1", playedVersion: () => 1 });
  runOwner.bump();
  return { runOwner, deps };
};

describe("RunOwner aborts the host request of a run the mutation invalidates (v2.4 plan 03 D2)", () => {
  it("rollback aborts the read in its window", () => {
    const { runOwner } = owner();
    const run = beginRun(runOwner.ownership, { from: 4, to: 9 });
    const signal = run.signal;
    runOwner.noteMutation(7);
    expect(signal.aborted).toBe(true);
    expect(run.stillOwns()).toBe(false);
  });

  it("a mutation before the window also aborts it, the same rule the token check applies", () => {
    const { runOwner } = owner();
    const run = beginRun(runOwner.ownership, { from: 4, to: 9 });
    const signal = run.signal;
    runOwner.noteMutation(2);
    expect(signal.aborted).toBe(true);
    expect(run.stillOwns()).toBe(false);
  });

  it("control: a reply appended after the window does not abort", () => {
    const { runOwner } = owner();
    const run = beginRun(runOwner.ownership, { from: 4, to: 9 });
    const signal = run.signal;
    runOwner.noteMutation(10);
    expect(signal.aborted).toBe(false);
    expect(run.stillOwns()).toBe(true);
  });

  it("control: a window-less run is not aborted by a mutation, only by the epoch", () => {
    const { runOwner } = owner();
    const run = beginRun(runOwner.ownership);
    const signal = run.signal;
    runOwner.noteMutation(0);
    expect(signal.aborted).toBe(false);
    runOwner.bump();
    expect(signal.aborted).toBe(true);
  });

  it("a chat change aborts every live run", () => {
    const { runOwner, deps } = owner();
    const windowed = beginRun(runOwner.ownership, { from: 0, to: 3 }).signal;
    const bare = beginRun(runOwner.ownership).signal;
    deps.chat = "chat-b";
    runOwner.bump();
    expect(windowed.aborted).toBe(true);
    expect(bare.aborted).toBe(true);
  });

  it("a run that lapsed before it asked for its signal starts aborted", () => {
    const { runOwner } = owner();
    const run = beginRun(runOwner.ownership, { from: 4, to: 9 });
    runOwner.noteMutation(5);
    expect(run.signal.aborted).toBe(true);
  });

  it("registers a run only when its signal is used, and forgets it on release", () => {
    const { runOwner } = owner();
    const run = beginRun(runOwner.ownership, { from: 0, to: 1 });
    expect(runOwner.liveRunCount()).toBe(0);
    const signal = run.signal;
    expect(runOwner.liveRunCount()).toBe(1);
    run.release();
    expect(runOwner.liveRunCount()).toBe(0);
    runOwner.noteMutation(0);
    expect(signal.aborted).toBe(false);
  });

  it("an unowned run carries a signal that never aborts", () => {
    const run = beginRun(testOwnership(), { from: 0, to: 1 });
    expect(run.signal.aborted).toBe(false);
    expect(() => run.release()).not.toThrow();
  });
});
