// v2.3 plan 03: the one effect that SPEAKS.
//
// Every other write in this plan corrupts state the player has to go looking for — a memory tier,
// a call ring, a blackboard delta. `fireNpcReplies` posts a message into whatever chat is open, so
// a late fire is visible in the transcript: this story's characters talking in somebody else's
// conversation.
//
// It fires one reply per await. A checkpoint with three onEnter replies that outlives its chat put
// the remaining two wherever the player had navigated to, which is why the check is inside the
// loop rather than around it.
//
// This site was invisible to the write-edge census until 2026-09-20, because its write verb is
// `fireReply` and WRITE_NAME did not list `fire`.

import { EffectsApplier } from "./effectsApplier";
import { mintToken, tokenMatches, type RunContext, type RunOwnership, type RunToken } from "./runToken";
import { control } from "../../test/findings/ledger";
import { testOwnership } from "../../test/findings/testOwnership";

const spoken: string[] = [];
const speechGate = { onSpeak: null as ((count: number) => void) | null };
const host = { chat: [{ mes: "hello" }] as { mes: string }[] };

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: host.chat, chatId: "chat-a", extensionSettings: {}, chatMetadata: {} }),
  getActiveGroup: () => null,
  guardHostStream: () => ({ halt: () => false, release: () => undefined }),
  executeSlashCommands: async (command: string) => {
    spoken.push(command);
    speechGate.onSpeak?.(spoken.length);
    return { pipe: "" };
  },
  applyBackground: async () => {},
  applyCharacterAN: async () => {},
  clearCharacterAN: async () => {},
  applyTextGenPresetRuntime: () => {},
  findTextGenPreset: () => null,
  disableWIEntry: async () => {},
  enableWIEntry: async () => {},
  lorebookExists: async () => true,
  setGroupMembersDisabled: async () => {},
}));

function harness() {
  let current: RunContext = { chatId: "chat-a", storyId: "s1", playedVersion: 1, sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = {
    mint: (window = null) => mintToken(current, window),
    check: (token: RunToken) => tokenMatches(current, token),
  };
  const state = { firedNpcReplies: {}, lastSelfInjectionMessageId: -1, ui: {}, requirements: { ready: true } };
  return {
    applier: new EffectsApplier(ownership),
    extras: state as never,
    state,
    switchChat: () => { current = { ...current, chatId: "chat-b", sessionEpoch: 2 }; },
  };
}

// NOTE `text`, not `prompt`: fireReply reads `reply.text ?? reply.instruction` and returns
// without speaking when both are empty. With `prompt` the fixture was silent and all three
// assertions read zero — the positive control is what exposed it.
// Three replies on one checkpoint: enough that "stops part-way" is distinguishable from
// "fires all" and from "fires none".
const checkpoint = {
  id: "cp-2",
  name: "The Gate",
  effects: {
    npc_replies: [
      { trigger: "onEnter", member: "corin", kind: "scripted", text: "Corin speaks." },
      { trigger: "onEnter", member: "bel", kind: "scripted", text: "Bel speaks." },
      { trigger: "onEnter", member: "ash", kind: "scripted", text: "Ash speaks." },
    ],
  },
} as never;

beforeEach(() => {
  spoken.length = 0;
  speechGate.onSpeak = null;
  host.chat = [{ mes: "hello" }];
});

control("every reply fires when the chat has not moved", async () => {
  // Without this the discard case below cannot be told apart from "this fixture never speaks".
  const h = harness();
  await h.applier.fireNpcReplies(checkpoint, h.extras, "onEnter" as never);
  expect(spoken).toHaveLength(3);
});

control("a chat switch stops the remaining replies mid-sequence", async () => {
  const h = harness();
  speechGate.onSpeak = (count) => { if (count === 1) h.switchChat(); };
  await h.applier.fireNpcReplies(checkpoint, h.extras, "onEnter" as never);
  // The first was legitimate; the other two would have spoken into the chat the player moved to.
  expect(spoken).toHaveLength(1);
});

control("a world that moved BEFORE the call is simply the world the call belongs to", async () => {
  const h = harness();
  h.switchChat();
  await h.applier.fireNpcReplies(checkpoint, h.extras, "onEnter" as never);
  expect(spoken).toHaveLength(3);
});
control("an applier with no ownership still fires everything", async () => {
  // Every existing construction passes none, and a missing guard must never mean a missing line.
  const h = harness();
  const unowned = new EffectsApplier(testOwnership());
  await unowned.fireNpcReplies(checkpoint, h.extras, "onEnter" as never);
  expect(spoken).toHaveLength(3);
});

// v2.4 follow-up (2026-09-25, v2.5 plan 02 C1 step 1). An `llm` reply is `/trigger await=true`, a
// real generation that can run for tens of seconds, and the write after it reads the OPEN chat's
// last message id into the extras of the chat the sequence started in. The check before the NEXT
// reply never runs for the last one, so a switch during it stamped chat B's index into chat A,
// where `afterSpeak` later compares it against A's own messages.
const generating = {
  id: "cp-2",
  name: "The Gate",
  effects: { npc_replies: [{ trigger: "onEnter", member: "corin", kind: "llm" }] },
} as never;

test("a chat switch during a generating reply writes nothing into the departed chat's state", async () => {
  const h = harness();
  speechGate.onSpeak = () => {
    h.switchChat();
    host.chat = Array.from({ length: 8 }, () => ({ mes: "chat b" }));
  };
  await h.applier.fireNpcReplies(generating, h.extras, "onEnter" as never);
  expect(spoken).toHaveLength(1);
  expect(spoken[0]).toContain("/trigger await=true");
  expect(h.state.lastSelfInjectionMessageId).toBe(-1);
});

control("a generating reply in a chat that did not move records its own last message", async () => {
  const h = harness();
  speechGate.onSpeak = () => { host.chat = [...host.chat, { mes: "Corin answers." }]; };
  await h.applier.fireNpcReplies(generating, h.extras, "onEnter" as never);
  expect(spoken).toHaveLength(1);
  expect(h.state.lastSelfInjectionMessageId).toBe(1);
});
