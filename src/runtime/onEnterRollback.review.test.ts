const host = {
  chat: [] as unknown[],
  slash: [] as string[],
};

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: host.chat, chatId: "chat-a", name1: "You", extensionSettings: {}, chatMetadata: {}, characters: [] }),
  executeSlashCommands: async (command: string) => {
    host.slash.push(command);
    if (command.startsWith("/sendas")) host.chat.push({ mes: command });
    return { pipe: "" };
  },
  lorebookExists: () => true,
  disableWIEntry: async () => ({ ok: true, changed: true }),
  enableWIEntry: async () => ({ ok: true, changed: true }),
  getActiveGroup: () => null,
  listGroupMembers: () => [],
  listMutedGroupMembers: () => [],
  listGlobalLorebooks: () => [],
  readLoreBindings: () => ({ global: [], chat: null, persona: null, characters: [] }),
}));

import { parseStoryV2OrThrow } from "@engine/index";
import { EffectsApplier } from "./effectsApplier";
import { onEnterRollbackPlan, rewindOnEnterPosts, sanitizeOnEnterPosts, type OnEnterPost } from "./npcReplyRewind";
import { RuntimeManager } from "./runtimeManager";
import { runRollback, type RollbackDeps } from "./rollback";
import { createJudgeRuntime } from "@judge/index";
import type { RuntimeExtras } from "./types";
import { testOwnership } from "../../test/findings/testOwnership";

const story = parseStoryV2OrThrow({
  format: 2,
  id: "opener",
  title: "Opener",
  description: "",
  qualities: [{ key: "done", type: "bool", source: "extractor", rubric: "Done?" }],
  checkpoints: [
    { id: "road", name: "Road", objective: "", type: "anchor", start: true },
    { id: "hall", name: "Hall", objective: "", type: "anchor", effects: { npc_replies: [{ trigger: "onEnter", member: "Narrator", kind: "scripted", text: "The hall doors open." }] } },
  ],
  transitions: [{ from: "road", to: "hall", priority: 1, gate: { q: "done", op: "==", v: true } }],
  roster: [],
});

const post: OnEnterPost = { checkpointId: "hall", gate: 5, first: 6, last: 7 };
const extrasFor = () => ({
  requirements: { ready: true },
  firedNpcReplies: {},
  firedNpcRepliesAt: {},
  lastSelfInjectionMessageId: null,
  lastAppliedCheckpointId: null,
  updatedAt: "x",
  effects: { ledger: [], cast: [] },
}) as unknown as RuntimeExtras;
const rows = (count: number) => Array.from({ length: count }, (_, index) => ({ mes: `m${index}` }));

beforeEach(() => {
  host.chat = [];
  host.slash = [];
});

describe("v2.6 plan 04 C12: the onEnter reply a transition posted belongs to that transition", () => {
  it("an edit or swipe of the gating reply, with the opener still the tail, steps back from the gate and removes the opener", () => {
    expect(onEnterRollbackPlan([post], "edit", 5, 8)).toMatchObject({ from: 5, remove: { first: 6, last: 7 } });
    expect(onEnterRollbackPlan([post], "swipe", 5, 8)).toMatchObject({ from: 5, remove: { first: 6, last: 7 } });
  });

  it("a delete of the opener steps back from the gate and removes what is left of the post", () => {
    expect(onEnterRollbackPlan([post], "delete", 7, 7)).toMatchObject({ from: 5, remove: { first: 6, last: 6 } });
    expect(onEnterRollbackPlan([{ ...post, first: 6, last: 6 }], "delete", 6, 6)).toMatchObject({ from: 5, remove: { first: 6, last: 5 } });
  });

  it("a player message after the opener does not trigger it, edited, deleted, or sitting after an edited gate", () => {
    expect(onEnterRollbackPlan([post], "edit", 5, 9)).toBeNull();
    expect(onEnterRollbackPlan([post], "edit", 8, 9)).toBeNull();
    expect(onEnterRollbackPlan([post], "delete", 8, 8)).toBeNull();
    expect(onEnterRollbackPlan([post], "delete", 7, 8)).toBeNull();
    expect(onEnterRollbackPlan([post], "edit", 4, 8)).toBeNull();
  });

  it("a rollback drops every post at or past the point, and a stored post is re-read defensively", () => {
    expect(rewindOnEnterPosts([post], 8)).toEqual([post]);
    expect(rewindOnEnterPosts([post], 5)).toEqual([]);
    expect(sanitizeOnEnterPosts([post, { checkpointId: "x", gate: 3, first: 3, last: 4 }, null, "nope"])).toEqual([post]);
  });

  it("a transition's opener is recorded against its gate; a jump or a reply-less entry records nothing", async () => {
    const applier = new EffectsApplier(testOwnership());
    host.chat = rows(6);
    const extras = extrasFor();
    await applier.applyCheckpoint(story, story.checkpointById.hall, extras, {} as never, "activate", ["road", "hall"], 5);
    expect(extras.onEnterPosts).toEqual([{ checkpointId: "hall", gate: 5, first: 6, last: 6 }]);
    const jumped = extrasFor();
    host.chat = rows(6);
    await applier.applyCheckpoint(story, story.checkpointById.hall, jumped, {} as never, "activate", ["hall"]);
    expect(jumped.onEnterPosts).toBeUndefined();
    const quiet = extrasFor();
    await applier.applyCheckpoint(story, story.checkpointById.road, quiet, {} as never, "activate", ["road"], 5);
    expect(quiet.onEnterPosts).toBeUndefined();
  });

  it("the cut runs only while the opener is still the tail and the run still owns the chat", async () => {
    const applier = new EffectsApplier(testOwnership());
    host.chat = rows(8);
    await applier.removeOnEnterPost({ first: 6, last: 7 }, { stillOwns: () => false } as never);
    await applier.removeOnEnterPost({ first: 6, last: 6 }, { stillOwns: () => true } as never);
    await applier.removeOnEnterPost({ first: 6, last: 5 }, { stillOwns: () => true } as never);
    expect(host.slash).toEqual([]);
    await applier.removeOnEnterPost({ first: 6, last: 7 }, { stillOwns: () => true } as never);
    expect(host.slash).toEqual(["/cut 6-7"]);
  });
});

describe("v2.6 plan 04 C12: a rollback forgets the posts it stepped back past", () => {
  const rollbackDeps = (extras: RuntimeExtras) => ({
    engine: { shouldRollbackFromMessage: () => false, boundaryBeforeMessage: () => 0, serialize: () => ({ boundary: 7 }), clampToChat: () => false, discardPendingFrom: () => [] },
    journal: {},
    context: () => ({ lastMessageId: 9, chatLength: 10, journal: { boundary: 1, messageId: 9 } }),
    memory: { rollbackFromMessage: () => undefined, updateInjection: () => undefined },
    stagecraft: { revertAppliedSince: async () => undefined },
    pacing: { replayCommitted: () => undefined, updateSteering: () => undefined },
    revalidateExpansion: () => undefined,
    extras: () => extras,
    refreshRequirements: () => undefined,
    reapplyCheckpoint: async () => undefined,
    persist: async () => undefined,
    notify: () => undefined,
    notices: { lastRollback: null, rollbackUnavailable: null },
    setStatus: () => undefined,
    onApplied: () => undefined,
  }) as unknown as RollbackDeps;

  it("drops a post the rollback reaches, so the cut's own delete cannot claim it a second time, and keeps an older one", async () => {
    const older: OnEnterPost = { checkpointId: "road", gate: 1, first: 2, last: 2 };
    const extras = { ...extrasFor(), extraction: { audits: [] }, judge: createJudgeRuntime(), lore: { fired: [] }, tension: { levels: [], smoothed: null, history: [] }, onEnterPosts: [older, post] } as unknown as RuntimeExtras;
    await runRollback(rollbackDeps(extras), 5);
    expect(extras.onEnterPosts).toEqual([older]);
    expect(onEnterRollbackPlan(extras.onEnterPosts, "delete", 6, 6)).toBeNull();
  });
});

describe("v2.6 plan 04 C12: the manager composes the rollback and the cut", () => {
  function manager(chatLength: number) {
    host.chat = rows(chatLength);
    const runtime = new RuntimeManager();
    const probe = runtime as unknown as { loaded: unknown; extras: RuntimeExtras; effects: EffectsApplier };
    probe.loaded = { record: { id: "opener", version: 1, hash: "h", raw: {} }, story };
    probe.extras.onEnterPosts = [post];
    const order: string[] = [];
    jest.spyOn(runtime, "rollbackFromMessage").mockImplementation(async (id) => { order.push(`rollback:${id}`); return { ok: true, result: "applied" }; });
    jest.spyOn(probe.effects, "removeOnEnterPost").mockImplementation(async (remove) => { order.push(`cut:${remove.first}-${remove.last}`); });
    return { runtime, order };
  }

  it("an edit of the gating reply rolls the transition back first, then removes the opener", async () => {
    const { runtime, order } = manager(8);
    expect(await runtime.rollbackOnEnter("edit", 5)).toBe(true);
    expect(order).toEqual(["rollback:5", "cut:6-7"]);
  });

  it("negative: with a player message after the opener, the bridge's ordinary rollback is left to run", async () => {
    const { runtime, order } = manager(9);
    expect(await runtime.rollbackOnEnter("edit", 5)).toBe(false);
    expect(await runtime.rollbackOnEnter("edit", 8)).toBe(false);
    expect(order).toEqual([]);
  });
});
