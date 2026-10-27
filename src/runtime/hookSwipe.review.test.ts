const host = {
  chat: [] as Array<Record<string, unknown>>,
  slash: [] as string[],
};

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ groupId: "g-test", chat: host.chat, chatId: "chat-a", name1: "You", extensionSettings: {}, chatMetadata: {}, characters: [] }),
  executeSlashCommands: async (command: string) => {
    host.slash.push(command);
    if (command.startsWith("/sendas")) host.chat.push({ name: "Narrator", mes: command });
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

import { parseStoryOrThrow } from "@engine/index";
import { createJudgeRuntime } from "@judge/index";
import { lastReplyAsksPlayer } from "@talk/index";
import { EffectsApplier } from "./effectsApplier";
import { runRollback, type RollbackDeps } from "./rollback";
import type { RollbackKind } from "./narrative";
import type { RuntimeExtras } from "./types";
import { testOwnership } from "../../test/findings/testOwnership";

const story = parseStoryOrThrow({
  id: "hook-swipe",
  title: "Hook swipe",
  description: "",
  qualities: [{ key: "done", type: "bool", source: "extractor", rubric: "Done?" }],
  checkpoints: [{
    id: "camp", name: "Camp", objective: "", type: "anchor", start: true,
    effects: {
      npc_replies: [
        { trigger: "onEnter", member: "Narrator", kind: "scripted", text: "Mira looks up. \"Where do we go?\"" },
        { trigger: "afterSpeak", member: "Narrator", kind: "scripted", text: "The fire cracks." },
        { trigger: "sceneBreak", member: "Narrator", kind: "scripted", text: "Night falls." },
      ],
    },
  }],
  transitions: [],
  roster: [],
});
const camp = story.checkpointById.camp;

const extrasFor = () => ({
  requirements: { ready: true },
  firedNpcReplies: {},
  firedNpcRepliesAt: {},
  lastSelfInjectionMessageId: null,
  lastAppliedCheckpointId: null,
  updatedAt: "x",
  effects: { ledger: [], cast: [] },
  extraction: { audits: [] },
  judge: createJudgeRuntime(),
  lore: { fired: [] },
  tension: { levels: [], smoothed: null, history: [] },
}) as unknown as RuntimeExtras;

const rollbackDeps = (extras: RuntimeExtras) => ({
  ownership: testOwnership(),
  engine: { shouldRollbackFromMessage: () => false, boundaryBeforeMessage: () => 0, serialize: () => ({ boundary: 1 }), clampToChat: () => false, discardPendingFrom: () => [] },
  journal: {},
  context: () => ({ lastMessageId: host.chat.length - 1, chatLength: host.chat.length, journal: { boundary: 1, messageId: host.chat.length - 1 } }),
  memory: { rollbackFromMessage: () => undefined, updateInjection: () => undefined },
  stagecraft: { revertAppliedSince: async () => undefined },
  pacing: { replayCommitted: () => undefined, updateSteering: () => undefined },
  revalidateExpansion: () => undefined, restoreExpansion: () => 0,
  extras: () => extras,
  refreshRequirements: () => undefined,
  reapplyCheckpoint: async () => undefined,
  persist: async () => undefined,
  notify: () => undefined,
  notices: { lastRollback: null, rollbackUnavailable: null },
  setStatus: () => undefined,
  onApplied: () => undefined,
}) as unknown as RollbackDeps;

async function hooked() {
  host.chat = [{ name: "Arin", mes: "The road ends at a camp." }];
  host.slash = [];
  const applier = new EffectsApplier(testOwnership());
  const extras = extrasFor();
  await applier.fireNpcReplies(camp, extras, "onEnter");
  return { applier, extras, hook: host.chat.length - 1 };
}

async function boundaryOnHook(applier: EffectsApplier, extras: RuntimeExtras, hook: number) {
  const before = host.slash.length;
  await applier.fireActiveReplies(camp, extras, "afterSpeak", null);
  await applier.fireActiveReplies(camp, extras, "sceneBreak", null, hook);
  return host.slash.slice(before);
}

beforeEach(() => {
  host.chat = [];
  host.slash = [];
});

describe("v3.0 19 live defect 1: a swiped story-posted line keeps its self-injection identity, so the player speaks next", () => {
  test("control: the unswiped hook holds the afterSpeak and sceneBreak lines", async () => {
    const { applier, extras, hook } = await hooked();
    expect(extras.lastSelfInjectionMessageId).toBe(hook);
    expect(await boundaryOnHook(applier, extras, hook)).toEqual([]);
  });

  test.each<RollbackKind>(["swipe", "edit"])("a %s of the hook, then a boundary on its new revision, posts no afterSpeak and no sceneBreak line", async (kind) => {
    const { applier, extras, hook } = await hooked();
    await runRollback(rollbackDeps(extras), hook, undefined, kind);
    host.chat[hook] = { name: "Narrator", mes: "Mira stirs the fire. The night is long.", swipe_id: 1, swipes: ["first", "Mira stirs the fire. The night is long."] };
    expect(extras.lastSelfInjectionMessageId).toBe(hook);
    expect(await boundaryOnHook(applier, extras, hook)).toEqual([]);
  });

  test("rollback = replay: the swiped hook's identity equals the one a fresh post at that message records", async () => {
    const swiped = await hooked();
    await runRollback(rollbackDeps(swiped.extras), swiped.hook, undefined, "swipe");
    const replayed = await hooked();
    expect(swiped.extras.lastSelfInjectionMessageId).toBe(replayed.extras.lastSelfInjectionMessageId);
  });

  test("a delete of the hook drops its identity and the scripted lines reopen by the existing rules", async () => {
    const { applier, extras, hook } = await hooked();
    host.chat.splice(hook, 1);
    await runRollback(rollbackDeps(extras), hook, undefined, "delete", 1);
    expect(extras.lastSelfInjectionMessageId).toBeNull();
    const posted = await boundaryOnHook(applier, extras, hook - 1);
    expect(posted.some((command) => command.includes("The fire cracks."))).toBe(true);
  });

  test("a rollback no event named, or one before the hook, still drops the identity", async () => {
    const unnamed = await hooked();
    await runRollback(rollbackDeps(unnamed.extras), unnamed.hook);
    expect(unnamed.extras.lastSelfInjectionMessageId).toBeNull();
    const earlier = await hooked();
    await runRollback(rollbackDeps(earlier.extras), earlier.hook - 1, undefined, "swipe");
    expect(earlier.extras.lastSelfInjectionMessageId).toBeNull();
  });

  test("awaitsPlayer reads the current swipe's text", () => {
    const roster = [{ id: "mira", name: "Mira" }];
    const swipes = ["\"The fire is warm.\"", "\"Which way do you want to go?\""];
    expect(lastReplyAsksPlayer(roster, null, [{ name: "Mira", mes: swipes[1], swipe_id: 1, swipes }], "You")).toBe(true);
    expect(lastReplyAsksPlayer(roster, null, [{ name: "Mira", mes: swipes[0], swipe_id: 0, swipes }], "You")).toBe(false);
  });
});

describe("v3.0 19 opening sceneBreak hold: no scripted line before the player's first send", () => {
  test("a read of the earlier opening line flags a break and its summary lands after the hook: nothing posts", async () => {
    const { applier, extras, hook } = await hooked();
    expect(extras.lastSelfInjectionMessageId).toBe(hook);
    const before = host.slash.length;
    expect(await applier.fireActiveReplies(camp, extras, "sceneBreak", null, hook - 1)).toBe(0);
    expect(host.slash.slice(before)).toEqual([]);
  });

  test("after the player sends, the same break posts its line as before", async () => {
    const { applier, extras, hook } = await hooked();
    host.chat.push({ name: "You", is_user: true, mes: "We go north." });
    const before = host.slash.length;
    expect(await applier.fireActiveReplies(camp, extras, "sceneBreak", null, hook - 1)).toBe(1);
    expect(host.slash.slice(before).some((command) => command.includes("Night falls."))).toBe(true);
  });

  test("after the player sends, a break still posts while the newest message is a story line", async () => {
    const { applier, extras, hook } = await hooked();
    host.chat.push({ name: "You", is_user: true, mes: "We go north." }, { name: "Mira", mes: "North it is." });
    await applier.fireActiveReplies(camp, extras, "afterSpeak", null);
    expect(extras.lastSelfInjectionMessageId).toBe(host.chat.length - 1);
    const before = host.slash.length;
    await applier.fireActiveReplies(camp, extras, "sceneBreak", null, hook - 1);
    expect(host.slash.slice(before).some((command) => command.includes("Night falls."))).toBe(true);
  });
});
