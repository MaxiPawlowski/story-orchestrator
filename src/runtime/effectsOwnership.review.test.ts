// v2.3 plan 03: the widest write edge in the extension.
//
// `EffectsApplier.applyCheckpoint` is the highest-risk of the census's unguarded sites, and the
// reason is that almost nothing it writes is per-chat:
//
//   - World Info entry flags live in shared lorebook FILES, which is why checkpoint world info had
//     to be rebuilt from the chat's path in the first place (2026-09-19) — toggling in place leaked
//     across chats and stories.
//   - The Author's Note and the preset are install state.
//   - `cast_changes` mutates the GROUP's `disabled_members`, which outlives the chat completely: a
//     roster member disabled by one story's checkpoint stays disabled in the real group afterwards.
//
// Five awaits run in sequence, two of them out to the host (a slash command, the group API), so
// the world can move between any two steps. The worst realistic symptom is a story's staging being
// applied to a different story's chat, with the cast change persisting on the shared group after
// the chat is gone.

import { EffectsApplier } from "./effectsApplier";
import { mintToken, tokenMatches, type RunContext, type RunOwnership, type RunToken } from "./runToken";
import { control } from "../../test/findings/ledger";

const hostWrites: string[] = [];
const hostGate = { onWrite: null as ((name: string) => void) | null };

function hostWrite(name: string) {
  hostWrites.push(name);
  hostGate.onWrite?.(name);
}

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: [], chatId: "chat-a", extensionSettings: {}, chatMetadata: {}, characters: [] }),
  applyBackground: async () => hostWrite("background"),
  applyCharacterAN: async () => hostWrite("authorNote"),
  clearCharacterAN: async () => hostWrite("authorNote"),
  applyTextGenPresetRuntime: () => hostWrite("preset"),
  applyPreset: () => { hostWrite("preset"); return { ok: true, name: "P" }; },
  presetBackend: () => "textgenerationwebui",
  readAppliedPreset: () => null,
  findTextGenPreset: () => null,
  disableWIEntry: async () => hostWrite("worldInfo"),
  enableWIEntry: async () => hostWrite("worldInfo"),
  lorebookExists: async () => true,
  executeSlashCommands: async () => { hostWrite("slash"); return { pipe: "" }; },
  getActiveGroup: () => ({ id: "g1", disabled_members: [] }),
  resolveGroupMemberId: (name: string) => name,
  setGroupMembersDisabled: async () => { hostWrite("castChanges"); return { ok: true, group: "g1" }; },
}));

function harness() {
  let current: RunContext = { chatId: "chat-a", storyId: "s1", playedVersion: 1, sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = {
    mint: (window = null) => mintToken(current, window),
    check: (token: RunToken) => tokenMatches(current, token),
  };
  const extras = {
    requirements: { ready: true },
    firedNpcReplies: {},
    lastSelfInjectionMessageId: -1,
    lastAppliedCheckpointId: "previous",
    updatedAt: "before",
    settings: {},
    // v2.3 plan 06: the effect ledger lives on extras, so a harness without one would crash the
    // write-ahead wrapper rather than exercise the ownership check the test is about.
    effects: { ledger: [], cast: [] },
  } as never as Parameters<EffectsApplier["applyCheckpoint"]>[2];

  return {
    applier: new EffectsApplier(ownership),
    extras: extras as unknown as { lastAppliedCheckpointId: string; updatedAt: string },
    switchChat: () => { current = { ...current, chatId: "chat-b", sessionEpoch: 2 }; },
  };
}

// The checkpoint gates a World Info entry, so applyWorldInfo actually writes. Without this the
// first await is a no-op and the check guarding it cannot be reached by any test.
const gateCheckpoint = { id: "cp-2", effects: { world_info: { enable: [{ lorebook: "Book", comments: ["gate-entry"] }] } } };
// NOTE the `checkpoints` array: gatedWorldInfo reads that, not checkpointById, so a fixture with
// only the map produces an empty gated set and no write at all.
const story = { title: "S", checkpoints: [gateCheckpoint], checkpointById: { "cp-2": gateCheckpoint }, qualityByKey: {}, roster: [] } as never;
const checkpoint = {
  id: "cp-2",
  name: "The Gate",
  effects: {
    author_note: { text: "at the gate" },
    // An object preset resolves without `findTextGenPreset` (a string names an installed preset),
    // so this effect actually reaches the host here.
    preset: { name: "P", settings: { temp: 0.8 } },
    // TWO members: one member is one await, and the per-member check can only be pinned by a
    // change that has a second write left to skip (2026-09-22).
    cast_changes: { disable: ["corin", "mara"] },
    background: { name: "gate.jpg" },
    npc_replies: [{ trigger: "onEnter", member: "corin", prompt: "react" }],
  },
} as never;
const snapshot = {} as never;
const casts = () => hostWrites.filter((name) => name === "castChanges").length;

beforeEach(() => {
  hostWrites.length = 0;
  hostGate.onWrite = null;
});

control("a checkpoint applied in its own chat stages everything and marks itself applied", async () => {
  const h = harness();
  await h.applier.applyCheckpoint(story, checkpoint, h.extras as never, snapshot, "activate", ["cp-1", "cp-2"]);
  expect(h.extras.lastAppliedCheckpointId).toBe("cp-2");
  expect(hostWrites.length).toBeGreaterThan(0);
  // The control has to reach every write the scoping cases skip, or it proves nothing about them.
  expect(hostWrites).toEqual(expect.arrayContaining(["authorNote", "preset", "background", "castChanges", "slash"]));
  expect(casts()).toBe(2);
});

control("a chat switch stops the sequence before the cast change reaches the shared group", async () => {
  // The cast change is the one that outlives the chat, so it is the one worth naming: it mutates
  // the group's disabled_members, not the chat's.
  const h = harness();
  // Fires on the Author Note, which is the first write this checkpoint actually makes: the
  // fixture has no world info, so keying on that hook fired never and the test proved nothing.
  hostGate.onWrite = (name) => { if (name === "authorNote") h.switchChat(); };
  await h.applier.applyCheckpoint(story, checkpoint, h.extras as never, snapshot, "activate", ["cp-1", "cp-2"]);
  expect(hostWrites).toContain("authorNote");
  expect(hostWrites).not.toContain("castChanges");
  // The preset is the SECOND host write since the last check (the Author Note is the first), so it
  // needs its own check rather than the one that guarded the note (2026-09-22).
  expect(hostWrites).not.toContain("preset");
  expect(hostWrites).not.toContain("background");
});

control("a switch during the FIRST cast change stops before the second member", async () => {
  // One member is one await. Without a check inside the loop a two-member change writes the second
  // member's flag onto whatever group the page moved to (2026-09-22).
  const h = harness();
  hostGate.onWrite = (name) => { if (name === "castChanges" && casts() === 1) h.switchChat(); };
  await h.applier.applyCheckpoint(story, checkpoint, h.extras as never, snapshot, "activate", ["cp-1", "cp-2"]);
  expect(casts()).toBe(1);
  expect(h.extras.lastAppliedCheckpointId).toBe("previous");
});

control("a switch during the LAST cast change stops before the background", async () => {
  // `applyCastChanges` runs its awaits between the check that guards it and the background write, so
  // the background is the one write in this sequence that could land in another chat (2026-09-22).
  const h = harness();
  hostGate.onWrite = (name) => { if (name === "castChanges" && casts() === 2) h.switchChat(); };
  await h.applier.applyCheckpoint(story, checkpoint, h.extras as never, snapshot, "activate", ["cp-1", "cp-2"]);
  expect(casts()).toBe(2);
  expect(hostWrites).not.toContain("background");
  expect(h.extras.lastAppliedCheckpointId).toBe("previous");
});

control("a switch during the World Info write stops before the Author Note", async () => {
  // World Info is the FIRST await, and the entry flags live in a shared lorebook file. A mutation
  // dropping the check that guards it survived until the fixture gated a real entry (2026-09-20):
  // with no world info the await was a no-op and no test could reach that check.
  const h = harness();
  hostGate.onWrite = (name) => { if (name === "worldInfo") h.switchChat(); };
  await h.applier.applyCheckpoint(story, checkpoint, h.extras as never, snapshot, "activate", ["cp-2"]);
  expect(hostWrites).toContain("worldInfo");
  expect(hostWrites).not.toContain("authorNote");
});

control("a checkpoint that lapsed is not recorded as applied", async () => {
  // Otherwise the runtime believes this checkpoint's staging is in place when only part of it is,
  // and a later hydrate skips re-applying it.
  const h = harness();
  // Fires on the Author Note, which is the first write this checkpoint actually makes: the
  // fixture has no world info, so keying on that hook fired never and the test proved nothing.
  hostGate.onWrite = (name) => { if (name === "authorNote") h.switchChat(); };
  await h.applier.applyCheckpoint(story, checkpoint, h.extras as never, snapshot, "activate", ["cp-1", "cp-2"]);
  expect(h.extras.lastAppliedCheckpointId).toBe("previous");
  expect(h.extras.updatedAt).toBe("before");
});

control("a world that moves at the LAST step still leaves the marker unset", async () => {
  // Each check has to be pinned by a case that reaches it. With the switch fired early, the
  // sequence returns before the marker write and a mutation dropping that final check survived
  // (2026-09-20). Here the switch lands after the background, so the marker is the only thing left.
  const h = harness();
  hostGate.onWrite = (name) => { if (name === "background") h.switchChat(); };
  await h.applier.applyCheckpoint(story, checkpoint, h.extras as never, snapshot, "activate", ["cp-1", "cp-2"]);
  expect(hostWrites).toContain("castChanges");
  // It stops ASKING as well: the NPC replies must not fire into the chat that is now open.
  expect(hostWrites).not.toContain("slash");
  expect(h.extras.lastAppliedCheckpointId).toBe("previous");
});

control("a world that moves during the NPC replies still leaves the marker unset", async () => {
  // The check before the marker guards the fireNpcReplies await specifically. Without a case
  // that moves the world THERE, it and the check before it are indistinguishable, and mutations
  // dropping either survived (2026-09-20): each was caught only by the other.
  const h = harness();
  hostGate.onWrite = (name) => { if (name === "slash") h.switchChat(); };
  await h.applier.applyCheckpoint(story, checkpoint, h.extras as never, snapshot, "activate", ["cp-1", "cp-2"]);
  expect(hostWrites).toContain("slash");
  expect(h.extras.lastAppliedCheckpointId).toBe("previous");
});

control("an applier with no ownership still applies everything", async () => {
  // Every existing construction passes none, and a missing guard must never mean a missing effect.
  const h = harness();
  const unowned = new EffectsApplier();
  await unowned.applyCheckpoint(story, checkpoint, h.extras as never, snapshot, "activate", ["cp-1", "cp-2"]);
  expect(h.extras.lastAppliedCheckpointId).toBe("cp-2");
});
