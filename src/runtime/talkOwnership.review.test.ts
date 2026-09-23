import { mintToken, tokenMatches, type RunContext, type RunOwnership, type RunToken } from "./runToken";
import { TalkController, type TalkControlHost } from "./talkControl";
import type { TalkDecisionAudit } from "./types";
import { control } from "../../test/findings/ledger";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function makeAbort() {
  const state = { aborted: false };
  return { state, abort: (_immediate: boolean) => { state.aborted = true; } };
}

function harness() {
  let current: RunContext = {
    chatId: "chat-a",
    storyId: "story-a",
    playedVersion: 1,
    sessionEpoch: 1,
    windowRevision: 0,
    lowestMutatedMessageId: null,
  };
  const world = {
    messageId: 5,
    checkpointId: "cp1",
    drafted: "sage" as string | null,
    director: (): Promise<string> => Promise.resolve("SPEAKER: Mara"),
  };
  const calls = { director: [] as string[], triggered: [] as string[], decisions: [] as TalkDecisionAudit[] };
  const ownership: RunOwnership = {
    mint: (window = null) => mintToken(current, window),
    check: (token: RunToken) => tokenMatches(current, token),
  };
  const host: TalkControlHost = {
    isGroupChat: () => true,
    getChatId: () => current.chatId,
    getActiveTalkControl: () => ({ director: true }),
    getRoster: () => [{ id: "guard", name: "Mara" }, { id: "sage", name: "Finn" }],
    getEnabledRosterIds: () => ["guard", "sage"],
    getLastSpeakerRosterId: () => null,
    getDraftedRosterId: () => world.drafted,
    getLastMessageId: () => world.messageId,
    getWindow: () => [{ speaker: "User", text: "hello there" }],
    getCheckpointInfo: () => ({ id: world.checkpointId, name: "Gate", objective: "Open it", storyTitle: "Ruins" }),
    callDirector: (prompt) => { calls.director.push(prompt); return world.director(); },
    triggerMember: async (name) => { calls.triggered.push(name); },
    recordDecision: (audit) => { calls.decisions.push(audit); },
    ownership,
  };
  return {
    host,
    calls,
    world,
    controller: new TalkController(host),
    switchWorld: () => { current = { ...current, chatId: "chat-b", storyId: "story-b", sessionEpoch: current.sessionEpoch + 1 }; },
    bumpEpoch: () => { current = { ...current, sessionEpoch: current.sessionEpoch + 1 }; },
    mutateAt: (messageId: number) => { current = { ...current, windowRevision: current.windowRevision + 1, lowestMutatedMessageId: messageId }; },
  };
}

control("a same-world director answer vetoes the drafted member and is recorded once", async () => {
  const h = harness();
  const { state, abort } = makeAbort();
  await h.controller.intercept(abort, "normal");

  expect(state.aborted).toBe(true);
  expect(h.calls.director).toHaveLength(1);
  expect(h.calls.decisions).toHaveLength(1);
  expect(h.calls.decisions[0]).toMatchObject({ chosenRosterId: "guard", chosenName: "Mara", source: "director", messageId: 5, checkpointId: "cp1" });
});

control("a director answer that lands after a chat switch aborts nothing and is not recorded", async () => {
  const h = harness();
  const pending = deferred<string>();
  h.world.director = () => pending.promise;
  const { state, abort } = makeAbort();

  const running = h.controller.intercept(abort, "normal");
  await settle();
  expect(h.calls.director).toHaveLength(1);
  h.switchWorld();
  pending.resolve("SPEAKER: Mara");
  await running;

  expect(state.aborted).toBe(false);
  expect(h.calls.decisions).toHaveLength(0);
});

control("a cached decision is not reused by the next world even when the key is identical", async () => {
  const h = harness();
  await h.controller.intercept(makeAbort().abort, "normal");
  expect(h.calls.director).toHaveLength(1);

  h.bumpEpoch();
  await h.controller.intercept(makeAbort().abort, "normal");

  expect(h.calls.director).toHaveLength(2);
  expect(h.calls.decisions).toHaveLength(2);
});

control("reconcile does not trigger a member into the chat that replaced the one it decided for", async () => {
  const h = harness();
  const pending = deferred<string>();
  h.world.director = () => pending.promise;
  h.controller.onWrapperStarted({ type: "normal" });

  const running = h.controller.onWrapperFinished();
  h.switchWorld();
  pending.resolve("SPEAKER: Mara");
  await running;

  expect(h.calls.triggered).toEqual([]);
  expect(h.calls.decisions).toHaveLength(0);
});

control("reconcile still triggers the chosen member in its own world", async () => {
  const h = harness();
  h.controller.onWrapperStarted({ type: "normal" });
  await h.controller.onWrapperFinished();

  expect(h.calls.triggered).toEqual(["Mara"]);
  expect(h.calls.decisions).toHaveLength(1);
});

control("the recorded decision names the checkpoint and message it was decided from, not where it landed", async () => {
  const h = harness();
  const pending = deferred<string>();
  h.world.director = () => pending.promise;
  const { abort } = makeAbort();

  const running = h.controller.intercept(abort, "normal");
  h.world.messageId = 9;
  h.world.checkpointId = "cp2";
  pending.resolve("SPEAKER: Mara");
  await running;

  expect(h.calls.decisions).toHaveLength(1);
  expect(h.calls.decisions[0]).toMatchObject({ messageId: 5, checkpointId: "cp1" });
});

control("a lapsed pending decision is replaced, and the old task cannot clear the replacement", async () => {
  const h = harness();
  const first = deferred<string>();
  const second = deferred<string>();
  h.world.director = () => first.promise;
  const running = h.controller.intercept(makeAbort().abort, "normal");
  await settle();
  expect(h.calls.director).toHaveLength(1);

  // Same chat, same checkpoint, same message: the key is identical and only the epoch moved, which
  // is the case an in-flight entry keyed by the decision key alone cannot tell apart.
  h.bumpEpoch();
  h.world.director = () => second.promise;
  const replaced = h.controller.intercept(makeAbort().abort, "normal");
  await settle();
  expect(h.calls.director).toHaveLength(2);

  first.resolve("SPEAKER: Finn");
  await running;

  const joined = h.controller.intercept(makeAbort().abort, "normal");
  await settle();
  expect(h.calls.director).toHaveLength(2);

  second.resolve("SPEAKER: Mara");
  await Promise.all([replaced, joined]);
  expect(h.calls.decisions).toHaveLength(1);
});

control("an edit inside the window the decision read discards it, an append after it does not", async () => {
  const edited = harness();
  const editPending = deferred<string>();
  edited.world.director = () => editPending.promise;
  const editAbort = makeAbort();
  const editedRun = edited.controller.intercept(editAbort.abort, "normal");
  edited.mutateAt(3);
  editPending.resolve("SPEAKER: Mara");
  await editedRun;

  expect(editAbort.state.aborted).toBe(false);
  expect(edited.calls.decisions).toHaveLength(0);

  const appended = harness();
  const appendPending = deferred<string>();
  appended.world.director = () => appendPending.promise;
  const appendAbort = makeAbort();
  const appendedRun = appended.controller.intercept(appendAbort.abort, "normal");
  appended.world.messageId = 6;
  appended.mutateAt(6);
  appendPending.resolve("SPEAKER: Mara");
  await appendedRun;

  expect(appended.calls.decisions).toHaveLength(1);
});

control("a world that never moves leaves the guard permissive for an unwired caller", async () => {
  const h = harness();
  const { host, calls } = h;
  const unwired = new TalkController({ ...host, ownership: undefined });
  await unwired.intercept(makeAbort().abort, "normal");
  await settle();

  expect(calls.decisions).toHaveLength(1);
});
