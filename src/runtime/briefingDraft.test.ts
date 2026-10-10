import { getActiveGroup } from "@services/STAPI";
import { RuntimeManager } from "./runtimeManager";
import type { StoryV2 } from "@engine/index";
import { briefingDraftInput, checkBriefingDraft, renderBriefingDraftPrompt } from "./briefingDraft";
import { BRIEFING_DRAFT_JOURNAL, briefingDraftDue, draftBriefing, startBriefingDraft, type BriefingDraftManager } from "./briefingDraftHost";
import { setGlobalSettings } from "./settingsStore";
import type { StoryOrchestratorMetadataBlob } from "./types";

const mockExtensionPrompts: Record<string, { value: string; depth: number }> = {};
const mockContext = {
  chat: [] as Array<{ mes: string }>,
  chatId: "chat-1" as string | undefined,
  groupId: "group-a" as string | null,
  chatMetadata: {} as Record<string, unknown>,
  extensionSettings: {} as Record<string, Record<string, unknown>>,
  saveMetadata: jest.fn(async () => undefined),
  saveSettingsDebounced: jest.fn(),
};

jest.mock("@services/STAPI", () => ({
  readLoreBindings: () => ({ global: [], chat: null, persona: null, characters: [] }),
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => mockContext,
  saveOpenChat: async () => { await (mockContext).saveMetadata?.(); return { ok: true as const, chatId: "" }; },
  setStoryExtensionPrompt: (key: string, text: string, depth: number) => { mockExtensionPrompts[key] = { value: text, depth }; },
  clearStoryExtensionPrompt: (key: string) => { delete mockExtensionPrompts[key]; },
  applyCharacterAN: jest.fn(async () => undefined),
  clearCharacterAN: jest.fn(async () => undefined),
  applyTextGenPresetRuntime: jest.fn(),
  findTextGenPreset: jest.fn(() => null),
  disableWIEntry: jest.fn(async () => undefined),
  enableWIEntry: jest.fn(async () => undefined),
  upsertWIEntry: jest.fn(async () => "created"),
  countTokens: jest.fn(async (text: string) => Math.ceil((text?.length ?? 0) / 4)),
  vectorInsert: jest.fn(async () => undefined),
  vectorQuery: jest.fn(async () => []),
  vectorPurge: jest.fn(async () => undefined),
  DEFAULT_VECTOR_SOURCE: "transformers",
  executeSlashCommands: jest.fn(async () => undefined),
  setGroupMembersDisabled: jest.fn(async () => undefined),
  getActiveGroup: jest.fn(() => ({ members: [] })),
  resolveGroupMemberId: jest.fn(() => null),
  getCharacterNameById: jest.fn(() => undefined),
  readInjectedPromptBlocks: () => Object.entries(mockExtensionPrompts).map(([key, entry]) => ({ key, depth: entry.depth, role: 0, value: entry.value })),
  readExtensionPromptBlocks: () => ({ own: [], foreign: [] }),
  readPromptBudget: () => ({ ok: false, reason: "no host in this test" }),
  showTextPopup: jest.fn(async () => undefined),
  showConfirmPopup: jest.fn(async () => true),
}));

const SECRET_STORY = {
  format: 2, id: "road", title: "The Road",
  description: "AUTHOR-ONLY: the guide Mara is the heir and betrays the courier at the Sunken Gate.",
  player_intro: "You carry a sealed letter over the pass.",
  player: { role: "a courier", summary: "You owe a debt you cannot pay.", assumes: ["you can ride"] },
  qualities: [
    { key: "found_key", type: "bool", source: "extractor", rubric: "Did they find the key?" },
    { key: "fate", type: "enum", source: "extractor", rubric: "How does it end?", values: ["betrayed", "crowned"] },
  ],
  checkpoints: [
    { id: "start", name: "Camp at dusk", player_name: "The foot of the pass", objective: "SECRET-OBJECTIVE look around.", type: "anchor", start: true,
      guidance: "SECRET-GUIDANCE keep it tense.", effects: { scenario: "Snow is falling on the camp.", cast_changes: { disable: ["Varek"] } } },
    { id: "gate", name: "The Sunken Gate", player_name: "Under the mountain", objective: "Open it.", type: "anchor" },
  ],
  transitions: [{ from: "start", to: "gate", priority: 1, gate: { q: "found_key", op: "==", v: true } }],
  roster: [
    { id: "mara", name: "Mara", role: "SECRET-ROLE the heir in hiding", drive: "SECRET-DRIVE take the crown" },
    { id: "varek", name: "Varek", role: "the ambusher" },
  ],
  requirements: { lorebooks: ["Road Secrets Book"] },
};

const reply = (sections: Array<{ heading: string; text: string }>) => JSON.stringify({ sections });
const GOOD = reply([
  { heading: "Where you are", text: "The foot of the pass, with snow falling on the camp." },
  { heading: "Who is with you", text: "Mara shares your fire." },
]);

const plantedModel = (text: string | (() => string)) => jest.fn(async () => ({ text: typeof text === "string" ? text : text(), finish: "stop" as const }));

const draftManager = (manager: RuntimeManager, model: ReturnType<typeof plantedModel>): BriefingDraftManager => ({
  getCachedSnapshot: () => manager.getSnapshot(),
  getStory: () => manager.getStory(),
  getGlobalSettings: () => manager.getGlobalSettings(),
  getOwnership: () => manager.getOwnership(),
  setUiSettings: (patch) => manager.setUiSettings(patch),
  noteRecap: (summary, detail) => manager.noteRecap(summary, detail),
  subscribe: (listener) => manager.subscribe(listener),
  model: model as unknown as BriefingDraftManager["model"],
});

const blob = () => mockContext.chatMetadata.story_orchestrator as unknown as StoryOrchestratorMetadataBlob;
const view = (manager: RuntimeManager) => manager.getSnapshot().briefing?.view ?? null;

const reset = () => {
  mockContext.chat = [];
  mockContext.chatId = "chat-1";
  mockContext.groupId = "group-a";
  mockContext.chatMetadata = {};
  mockContext.extensionSettings = {};
  (getActiveGroup as jest.Mock).mockReturnValue({ members: [] });
  Object.keys(mockExtensionPrompts).forEach((key) => { delete mockExtensionPrompts[key]; });
};

const loaded = async (over: Record<string, unknown> = {}) => {
  const manager = new RuntimeManager();
  await manager.importStory(JSON.stringify({ ...SECRET_STORY, ...over }));
  return manager;
};

const due = (manager: RuntimeManager) => {
  const found = briefingDraftDue(draftManager(manager, plantedModel(GOOD)));
  if (!found) throw new Error("no draft due");
  return found;
};

describe("v2.8 10 D2: the player's briefing draft reads a projection, never the story", () => {
  const FORBIDDEN = ["AUTHOR-ONLY", "SECRET-OBJECTIVE", "SECRET-GUIDANCE", "SECRET-ROLE", "SECRET-DRIVE", "Sunken Gate", "Under the mountain", "Camp at dusk",
    "betrayed", "crowned", "found_key", "Varek", "ambusher", "Road Secrets Book", "\"gate\""];

  it("the projection holds only the allowed fields", () => {
    const input = briefingDraftInput(SECRET_STORY as unknown as StoryV2);
    expect(input).toEqual({
      title: "The Road",
      intro: "You carry a sealed letter over the pass.",
      start: "The foot of the pass",
      player: { role: "a courier", summary: "You owe a debt you cannot pay.", assumes: ["you can ride"] },
      cast: ["Mara"],
      scenario: "Snow is falling on the camp.",
    });
    const prompt = renderBriefingDraftPrompt(input);
    FORBIDDEN.forEach((term) => {
      expect(JSON.stringify(input)).not.toContain(term);
      expect(prompt).not.toContain(term);
    });
    expect(prompt).toContain("Mara");
  });

  it("control: the projection does not fall back to the author's description", () => {
    const input = briefingDraftInput({ ...SECRET_STORY, player_intro: undefined } as unknown as StoryV2);
    expect(input.intro).toBeNull();
    expect(renderBriefingDraftPrompt(input)).not.toContain("AUTHOR-ONLY");
  });

  it("keeps a clean draft and discards one that names a later beat, a muted member, a story value, a macro or bad JSON", () => {
    const story = SECRET_STORY as unknown as StoryV2;
    expect(checkBriefingDraft(story, GOOD)).toEqual({ ok: true, sections: JSON.parse(GOOD).sections });
    expect(checkBriefingDraft(story, `<think>plan</think>\n\`\`\`json\n${GOOD}\n\`\`\``)).toMatchObject({ ok: true });
    const named = (text: string) => checkBriefingDraft(story, reply([{ heading: "Ahead", text }]));
    expect(named("You will reach the Sunken Gate.")).toMatchObject({ ok: false, reason: expect.stringContaining("Sunken Gate") });
    expect(named("Varek waits in the rocks.")).toMatchObject({ ok: false, reason: expect.stringContaining("Varek") });
    expect(named("You may end up betrayed.")).toMatchObject({ ok: false, reason: expect.stringContaining("betrayed") });
    expect(named("You are {{user}}.")).toMatchObject({ ok: false, reason: expect.stringContaining("macro") });
    expect(checkBriefingDraft(story, "Here is your briefing!")).toMatchObject({ ok: false, reason: "the reply was not readable JSON" });
    expect(checkBriefingDraft(story, reply([]))).toMatchObject({ ok: false });
  });
});

describe("v2.8 10 D2: the draft is stored per chat", () => {
  beforeEach(reset);

  it("lands in the open view, is saved with the chat, survives a rollback and a reopen", async () => {
    const manager = await loaded();
    expect(view(manager)).toMatchObject({ source: "intro" });
    const { story, storyId, hash } = due(manager);
    const model = plantedModel(GOOD);
    const outcome = await draftBriefing(draftManager(manager, model), story, storyId, hash);
    expect(outcome).toMatchObject({ ok: true });
    expect(model).toHaveBeenCalledWith(expect.not.stringContaining("SECRET"), expect.objectContaining({ role: "authoring", pass: "briefing" }));
    expect(view(manager)).toMatchObject({ source: "draft", title: "The Road", sections: JSON.parse(GOOD).sections });
    expect(blob().stories.road.extras?.briefing).toMatchObject({ seen: false, draft: { storyId: "road", hash, sections: JSON.parse(GOOD).sections } });
    expect(briefingDraftDue(draftManager(manager, model))).toBeNull();
    expect(manager.getSessionJournal().some((event) => event.summary === BRIEFING_DRAFT_JOURNAL.landed)).toBe(true);

    manager.setUiSettings({ briefingSeen: true });
    expect(blob().stories.road.extras?.briefing).toMatchObject({ seen: true, draft: { storyId: "road" } });
    mockContext.chat = [{ mes: "hello" }, { mes: "reply" }];
    await manager.commitBoundary();
    await manager.rollbackFromMessage(0);
    expect(view(manager)).toMatchObject({ source: "draft" });

    const reopened = new RuntimeManager();
    await reopened.loadSelectedFromChat();
    expect(view(reopened)).toMatchObject({ source: "draft", sections: JSON.parse(GOOD).sections });
  });

  it("Restart drops it, and a story update makes it stale", async () => {
    const manager = await loaded();
    const { story, storyId, hash } = due(manager);
    await draftBriefing(draftManager(manager, plantedModel(GOOD)), story, storyId, hash);
    expect(await manager.restartStory(true)).toBe(true);
    expect(view(manager)).toMatchObject({ source: "intro" });
    expect(blob().stories.road.extras?.briefing).toEqual({ seen: false });

    const next = due(manager);
    await draftBriefing(draftManager(manager, plantedModel(GOOD)), next.story, next.storyId, next.hash);
    expect(view(manager)).toMatchObject({ source: "draft" });
    await manager.importStory(JSON.stringify({ ...SECRET_STORY, player_intro: "You carry two letters." }));
    await manager.applyStoryUpdate();
    expect(view(manager)).toMatchObject({ source: "intro", sections: [{ text: "You carry two letters." }] });
  });

  it("a discarded draft writes nothing and keeps the introduction", async () => {
    const manager = await loaded();
    const { story, storyId, hash } = due(manager);
    const outcome = await draftBriefing(draftManager(manager, plantedModel(reply([{ heading: "Ahead", text: "The Sunken Gate waits." }]))), story, storyId, hash);
    expect(outcome).toMatchObject({ ok: false });
    expect(view(manager)).toMatchObject({ source: "intro" });
    expect(blob().stories.road.extras?.briefing).toEqual({ seen: false });
    expect(manager.getSessionJournal().some((event) => event.summary === BRIEFING_DRAFT_JOURNAL.discarded)).toBe(true);
  });

  it("a chat switch while the model answers writes nothing", async () => {
    const manager = await loaded();
    const { story, storyId, hash } = due(manager);
    const model = plantedModel(() => {
      mockContext.chatId = "chat-9";
      return GOOD;
    });
    expect(await draftBriefing(draftManager(manager, model), story, storyId, hash)).toEqual({ ok: false, reason: "stale" });
    mockContext.chatId = "chat-1";
    expect(view(manager)).toMatchObject({ source: "intro" });
  });

  it("a failed call is silent and leaves the introduction", async () => {
    const manager = await loaded();
    const { story, storyId, hash } = due(manager);
    const model = jest.fn(async () => { throw new Error("no profile"); });
    expect(await draftBriefing(draftManager(manager, model as unknown as ReturnType<typeof plantedModel>), story, storyId, hash)).toEqual({ ok: false, reason: "failed" });
    expect(view(manager)).toMatchObject({ source: "intro" });
  });

  it("never runs for an authored briefing, with the setting off, or after the briefing was seen", async () => {
    const authored = await loaded({ briefing: { sections: [{ heading: "Who you are", text: "A courier." }] } });
    expect(briefingDraftDue(draftManager(authored, plantedModel(GOOD)))).toBeNull();

    reset();
    const seen = await loaded();
    seen.setUiSettings({ briefingSeen: true });
    expect(briefingDraftDue(draftManager(seen, plantedModel(GOOD)))).toBeNull();

    reset();
    setGlobalSettings({ display: { briefingDraft: false } });
    const off = await loaded();
    expect(briefingDraftDue(draftManager(off, plantedModel(GOOD)))).toBeNull();
  });

  it("startBriefingDraft asks once per chat and story, and the opener is never held for it", async () => {
    const manager = await loaded();
    const model = plantedModel(GOOD);
    const host = draftManager(manager, model);
    const stop = startBriefingDraft(host);
    manager.notify();
    manager.notify();
    await new Promise((resolve) => setTimeout(resolve, 0));
    stop();
    expect(model).toHaveBeenCalledTimes(1);
  });

  it("payload invariance: a drafted briefing changes nothing the reply model is sent", async () => {
    const injected = () => JSON.stringify(Object.entries(mockExtensionPrompts).sort(([left], [right]) => left.localeCompare(right)));
    const manager = await loaded();
    const baseline = injected();
    const { story, storyId, hash } = due(manager);
    await draftBriefing(draftManager(manager, plantedModel(GOOD)), story, storyId, hash);
    expect(injected()).toBe(baseline);
    expect(injected()).not.toContain("shares your fire");
  });
});
