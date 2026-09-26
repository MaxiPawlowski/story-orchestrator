import { EffectsApplier } from "./effectsApplier";
import { generationWatch } from "./generationWatch";
import { mintToken, tokenMatches, type RunContext, type RunOwnership, type RunToken } from "./runToken";

const host = {
  generating: true,
  stopped: 0,
  opened: 0,
  finish: null as (() => void) | null,
  onTrigger: null as (() => void) | null,
};

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  getContext: () => ({ chat: [{ mes: "hello" }], chatId: "chat-a", extensionSettings: {}, chatMetadata: {} }),
  getActiveGroup: () => null,
  isHostGenerating: () => host.generating,
  guardHostStream: () => ({ halt: () => false, release: () => undefined }),
  stopHostGeneration: () => {
    host.stopped += 1;
    host.finish?.();
    return { ok: true, stopped: true };
  },
  executeSlashCommands: (command: string) => new Promise((resolve) => {
    if (!command.startsWith("/trigger")) { resolve({ pipe: "" }); return; }
    host.finish = () => resolve({ pipe: "" });
    host.onTrigger?.();
  }),
}));

const checkpoint = (kind: "llm" | "scripted") => ({
  id: "cp-2",
  name: "The Gate",
  effects: { npc_replies: [{ trigger: "onEnter", member: "corin", kind, text: "Corin speaks." }] },
}) as never;

function harness() {
  let current: RunContext = { chatId: "chat-a", storyId: "s1", playedVersion: 1, sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  let aborter = new AbortController();
  const ownership: RunOwnership = {
    mint: (window = null) => mintToken(current, window),
    check: (token: RunToken) => tokenMatches(current, token),
    signal: () => aborter.signal,
  };
  const extras = { firedNpcReplies: {}, lastSelfInjectionMessageId: -1, ui: {}, requirements: { ready: true } } as never;
  const switchChat = () => {
    current = { ...current, chatId: "chat-b", sessionEpoch: current.sessionEpoch + 1 };
    const old = aborter;
    aborter = new AbortController();
    old.abort();
  };
  return { applier: new EffectsApplier(ownership), extras, switchChat };
}

let detach: () => void = () => undefined;
beforeEach(() => {
  host.generating = true;
  host.stopped = 0;
  host.opened = 0;
  host.finish = null;
  host.onTrigger = null;
  detach = generationWatch.attach(() => host.opened);
});
afterEach(() => detach());

describe("v2.5 plan 02 C1 step 2: an NPC /trigger that outlives its chat is stopped only when it is still ours", () => {
  it("stops the trigger's own generation when the chat changes while it streams", async () => {
    const h = harness();
    host.onTrigger = () => { host.opened += 1; h.switchChat(); };
    await h.applier.fireNpcReplies(checkpoint("llm"), h.extras, "onEnter");
    expect(host.stopped).toBe(1);
  });

  it("issues no stop when another generation opened after the trigger's (the player's, in the new chat)", async () => {
    const h = harness();
    host.onTrigger = () => { host.opened += 2; h.switchChat(); };
    const firing = h.applier.fireNpcReplies(checkpoint("llm"), h.extras, "onEnter");
    await Promise.resolve();
    host.finish?.();
    await firing;
    expect(host.stopped).toBe(0);
  });

  it("issues no stop when the trigger's generation never opened before the switch", async () => {
    const h = harness();
    host.onTrigger = () => { h.switchChat(); };
    const firing = h.applier.fireNpcReplies(checkpoint("llm"), h.extras, "onEnter");
    await Promise.resolve();
    host.finish?.();
    await firing;
    expect(host.stopped).toBe(0);
  });

  it("issues no stop when the host has already finished generating", async () => {
    const h = harness();
    host.onTrigger = () => { host.opened += 1; host.generating = false; h.switchChat(); };
    const firing = h.applier.fireNpcReplies(checkpoint("llm"), h.extras, "onEnter");
    await Promise.resolve();
    host.finish?.();
    await firing;
    expect(host.stopped).toBe(0);
  });

  it("issues no stop without a generation tracker to prove whose generation it is", async () => {
    detach();
    const h = harness();
    host.onTrigger = () => { host.opened += 1; h.switchChat(); };
    const firing = h.applier.fireNpcReplies(checkpoint("llm"), h.extras, "onEnter");
    await Promise.resolve();
    host.finish?.();
    await firing;
    expect(host.stopped).toBe(0);
  });

  it("control: a trigger that finishes in its own chat stops nothing, and a later switch does not reach back", async () => {
    const h = harness();
    host.onTrigger = () => { host.opened += 1; host.finish?.(); };
    await h.applier.fireNpcReplies(checkpoint("llm"), h.extras, "onEnter");
    h.switchChat();
    expect(host.stopped).toBe(0);
  });
});
