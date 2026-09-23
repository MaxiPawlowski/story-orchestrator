import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SharedReadAudit } from "@extraction/index";
import { disableWIEntry, enableWIEntry, executeSlashCommands, getActiveGroup } from "@services/STAPI";
import { RuntimeManager } from "./runtimeManager";
import { control } from "../../test/findings/ledger";

const mockExtensionPrompts: Record<string, { value: string; depth: number }> = {};
const mockLorebooks: Record<string, Record<string, boolean>> = {};
const mockSwitchEntries = (lorebook: string, comments: string | string[], enabled: boolean) => {
  [comments].flat().forEach((comment) => { if (mockLorebooks[lorebook] && comment in mockLorebooks[lorebook]) mockLorebooks[lorebook][comment] = enabled; });
  return true;
};
const mockPopupCloses = { count: 0 };
const mockContext = {
  chat: [] as Array<{ mes: string }>,
  chatId: "chat-a" as string | undefined,
  chatMetadata: {} as Record<string, unknown>,
  extensionSettings: {} as Record<string, Record<string, unknown>>,
  saveMetadata: jest.fn(async () => undefined),
  saveMetadataDebounced: jest.fn(),
  saveSettingsDebounced: jest.fn(),
};

jest.mock("@services/STAPI", () => {
  const getActiveGroupMock = jest.fn((): { members: string[]; disabled_members?: string[] } | null => null);
  const resolveGroupMemberIdMock = (identifier: string) => {
    const group = getActiveGroupMock();
    const search = identifier.trim().toLowerCase();
    if (!group || !search) return null;
    const byAvatar = group.members.find((member) => member.toLowerCase() === search);
    if (byAvatar) return byAvatar;
    const found = group.members.find((member) => member.replace(/\.[a-z0-9]+$/i, "").toLowerCase() === search);
    return found ?? null;
  };
  return {
    getContext: () => mockContext,
    setStoryExtensionPrompt: (key: string, text: string, depth: number) => { mockExtensionPrompts[key] = { value: text, depth }; },
    clearStoryExtensionPrompt: (key: string) => { delete mockExtensionPrompts[key]; },
    applyCharacterAN: jest.fn(async () => undefined),
    clearCharacterAN: jest.fn(async () => undefined),
    applyTextGenPresetRuntime: jest.fn(),
    findTextGenPreset: jest.fn(() => null),
    disableWIEntry: jest.fn(async (lorebook: string, comments: string | string[]) => mockSwitchEntries(lorebook, comments, false)),
    enableWIEntry: jest.fn(async (lorebook: string, comments: string | string[]) => mockSwitchEntries(lorebook, comments, true)),
    lorebookExists: (name: string) => Boolean(mockLorebooks[name]),
    upsertWIEntry: jest.fn(async () => "created"),
    ensureLorebook: jest.fn(async (name: string) => ({ name, created: false })),
    loadLorebook: jest.fn(async () => ({ name: "mirror", entries: {} })),
    bindChatLorebook: jest.fn(() => ({ bound: false, previous: null })),
    countTokens: jest.fn(async (text: string) => Math.ceil((text?.length ?? 0) / 4)),
    vectorInsert: jest.fn(async () => undefined),
    vectorQuery: jest.fn(async () => []),
    vectorPurge: jest.fn(async () => undefined),
    DEFAULT_VECTOR_SOURCE: "transformers",
    executeSlashCommands: jest.fn(async () => undefined),
    setGroupMembersDisabled: jest.fn(async () => ({ ok: true, group: "g1" })),
    // v2.3 plan 06: the settings gate and the save evidence. The observation answers "a save went out
    // and was accepted" unless a test says otherwise, because that is the ordinary case every test
    // written before the seam existed assumed.
    settingsAreLoaded: () => true,
    settingsReady: async () => {},
    observeNextSave: jest.fn(async () => ({ requested: true, status: 200, ok: true, timedOut: false })),
    readServerBoundary: async () => null,
    applyPreset: jest.fn(() => ({ ok: true, name: "P" })),
    presetBackend: () => "textgenerationwebui",
    readAppliedPreset: () => null,
    getActiveGroup: getActiveGroupMock,
    resolveGroupMemberId: resolveGroupMemberIdMock,
    getCharacterNameById: (id: number) => (id === 0 ? "Mara" : id === 1 ? "Kael" : id === 2 ? "Narrator" : undefined),
    readInjectedPromptBlocks: () => Object.entries(mockExtensionPrompts)
      .filter(([key, entry]) => key.startsWith("story_") && entry.value.trim())
      .map(([key, entry]) => ({ key, depth: entry.depth, role: 0, value: entry.value })),
    showTextPopup: jest.fn(() => ({ close: () => { mockPopupCloses.count += 1; } })),
  };
});

const story = {
  format: 2,
  title: "Runtime Pacing Test",
  description: "Runtime pacing regression fixture.",
  arc_template: "rising",
  qualities: [],
  checkpoints: [
    { id: "start", name: "Start", objective: "Start.", type: "anchor", start: true },
    { id: "end", name: "End", objective: "End.", type: "anchor" },
  ],
  transitions: [],
  roster: [],
};

const tensionAudit = (level: "stirring" | "critical", value: number, messageId = 0): SharedReadAudit => ({
  id: `audit-${level}`,
  createdAt: "2026-07-05T00:00:00.000Z",
  priority: 0,
  reason: "test",
  contractHash: "hash",
  scope: ["tension_current"],
  window: { from: messageId, to: messageId },
  prompt: "prompt",
  rawResponse: "raw",
  acceptedDeltas: [{ delta: { q: "tension_current", v: value, source: "extractor" }, evidence: "evidence", rawLevel: level }],
  rejected: [],
});

const resetHost = () => {
  mockContext.chat = [];
  mockContext.chatMetadata = {};
  mockContext.extensionSettings = {};
  // A chat is open in these tests: an unnamed chat is a state the runtime must not write to.
  mockContext.chatId = "chat-a";
  Object.keys(mockExtensionPrompts).forEach((key) => { delete mockExtensionPrompts[key]; });
  Object.keys(mockLorebooks).forEach((key) => { delete mockLorebooks[key]; });
  (getActiveGroup as jest.Mock).mockReturnValue(null);
};

const gatedStory = (id: string, start: Record<string, unknown>, next?: Record<string, unknown>) => ({
  format: 2,
  id,
  title: id,
  description: "Checkpoint world info fixture.",
  qualities: [{ key: "go", type: "bool", source: "extractor", rubric: "Did they set off?" }],
  checkpoints: [
    { id: "start", name: "Start", objective: "Start.", type: "anchor", start: true, effects: { world_info: start } },
    ...(next ? [{ id: "next", name: "Next", objective: "Next.", type: "anchor", effects: { world_info: next } }] : []),
  ],
  transitions: next ? [{ from: "start", to: "next", gate: { q: "go", op: "==", v: true }, priority: 0 }] : [],
  roster: [],
});
const storyA = gatedStory("wi-a", { enable: [{ lorebook: "Shared", comments: ["A start"] }] }, { enable: [{ lorebook: "Shared", comments: ["A next"] }], disable: [{ lorebook: "Shared", comments: ["A start"] }] });
const storyB = gatedStory("wi-b", { enable: [{ lorebook: "Shared", comments: ["B start"] }] });
const selectNothing = () => { (mockContext.chatMetadata.story_orchestrator as { selectedStoryId: string | null }).selectedStoryId = null; };

describe("RuntimeManager pacing", () => {
  beforeEach(() => resetHost());

  it("clears the pacing prompt when no story is selected", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(story));
    await manager.applyExtractionAudit(tensionAudit("critical", 0.75), []);
    mockContext.chat = [{ mes: "danger" }];
    await manager.commitBoundary();
    expect(mockExtensionPrompts.story_orchestrator_pacing?.value).toContain("Pacing:");

    const metadata = mockContext.chatMetadata.story_orchestrator as { selectedStoryId: string | null };
    metadata.selectedStoryId = null;
    await manager.loadSelectedFromChat();

    expect(mockExtensionPrompts.story_orchestrator_pacing).toBeUndefined();
  });

  it("does not expose tension or steering until the extraction delta reaches a boundary", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(story));

    await manager.applyExtractionAudit(tensionAudit("critical", 0.75), []);

    expect(manager.getSnapshot().tension.smoothed).toBeNull();
    expect(mockExtensionPrompts.story_orchestrator_pacing).toBeUndefined();

    mockContext.chat = [{ mes: "danger" }];
    await manager.commitBoundary();

    expect(manager.getSnapshot().tension.smoothed).toBe(0.75);
    expect(mockExtensionPrompts.story_orchestrator_pacing?.value).toContain("Pacing:");
  });

  it("rewinds committed tension and clears steering on rollback", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(story));
    await manager.applyExtractionAudit(tensionAudit("critical", 0.75), []);
    mockContext.chat = [{ mes: "danger" }];
    await manager.commitBoundary();

    expect(manager.getSnapshot().tension.smoothed).toBe(0.75);

    await manager.rollbackFromMessage(0);

    expect(manager.getSnapshot().tension.smoothed).toBeNull();
    expect(mockExtensionPrompts.story_orchestrator_pacing).toBeUndefined();
  });

  it("prefers the active checkpoint tension_target over the arc shape", async () => {
    const manager = new RuntimeManager();
    const targeted = { ...story, checkpoints: [{ ...story.checkpoints[0], tension_target: "peak" }, story.checkpoints[1]] };
    await manager.importStory(JSON.stringify(targeted));
    await manager.applyExtractionAudit(tensionAudit("stirring", 0.25), []);
    mockContext.chat = [{ mes: "quiet camp" }];
    await manager.commitBoundary();

    const snapshot = manager.getSnapshot();
    expect(snapshot.tension.expected).toBe(1);
    expect(snapshot.tension.hint?.direction).toBe("escalate");
    expect(mockExtensionPrompts.story_orchestrator_pacing?.value).toContain("peak");
  });

  it("falls back to the arc template when the checkpoint has no tension_target", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(story));
    await manager.applyExtractionAudit(tensionAudit("stirring", 0.25), []);
    mockContext.chat = [{ mes: "quiet camp" }];
    await manager.commitBoundary();

    expect(manager.getSnapshot().tension.expected).toBe(0.5);
  });
});

describe("RuntimeManager memory migration", () => {
  beforeEach(() => resetHost());

  it("migrates a legacy extras.extraction.facts blob into the facts memory tier on hydrate", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(story));
    const storyId = manager.getSnapshot().storyId as string;

    const blob = mockContext.chatMetadata.story_orchestrator as { stories: Record<string, { extras: Record<string, unknown> }> };
    const persistedExtras = blob.stories[storyId].extras;
    delete persistedExtras.memory;
    persistedExtras.extraction = {
      ...(persistedExtras.extraction as Record<string, unknown>),
      facts: [{ text: "Mara trusts the player.", evidence: "I trust you.", importance: 2, boundary: 1, messageId: 3 }],
    };

    await manager.selectStory(storyId, "hydrate");

    const migrated = manager.getSnapshot().memory.entries;
    expect(migrated).toHaveLength(1);
    expect(migrated[0]).toMatchObject({ tier: "facts", type: "fact", text: "Mara trusts the player.", evidence: "I trust you.", importance: 2, expiration: "permanent", createdAt: 1, messageId: 3 });
  });

  it("does not re-migrate once extras.memory already exists", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(story));
    const storyId = manager.getSnapshot().storyId as string;

    await manager.selectStory(storyId, "hydrate");
    expect(manager.getSnapshot().memory.entries).toHaveLength(0);
  });

  it("clears a stuck backfill.running flag on reload so a new backlog can start", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(story));
    const storyId = manager.getSnapshot().storyId as string;

    const blob = mockContext.chatMetadata.story_orchestrator as { stories: Record<string, { extras: { memory: { backfill: unknown } } }> };
    blob.stories[storyId].extras.memory.backfill = { running: true, processed: 1, total: 3, lastError: null };

    await manager.selectStory(storyId, "hydrate");
    expect(manager.getSnapshot().memory.backfill).toMatchObject({ running: false, processed: 1, total: 3 });
  });
});

const sceneStory = {
  format: 2,
  title: "Scene Detection Test",
  description: "Scene detection regression fixture.",
  qualities: [
    { key: "location", type: "enum", values: ["hall", "vault"], source: "extractor", rubric: "Where is the party now?" },
  ],
  checkpoints: [
    {
      id: "start",
      name: "Start",
      objective: "Start.",
      type: "anchor",
      start: true,
      effects: { npc_replies: [{ trigger: "sceneBreak", member: "Narrator", kind: "scripted", text: "The scene shifts." }] },
    },
  ],
  transitions: [],
  roster: [],
};

const sceneBreakAudit = (): SharedReadAudit => ({
  id: "audit-scene",
  createdAt: "2026-07-05T00:00:00.000Z",
  priority: 0,
  reason: "scene:location",
  contractHash: "hash",
  scope: [],
  window: { from: 0, to: 2 },
  prompt: "prompt",
  rawResponse: "raw",
  acceptedDeltas: [],
  rejected: [],
  sceneBreak: { at: 2, reason: "location" },
});

describe("RuntimeManager scene detection", () => {
  beforeEach(() => {
    resetHost();
    delete globalThis.storyOrchestratorDebugSceneSummaryResponse;
  });

  it("returns null before any story is loaded", () => {
    const manager = new RuntimeManager();
    expect(manager.detectSceneBreak()).toBeNull();
  });

  it("detects a location-quality change once a known baseline is established", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(sceneStory));
    mockContext.chat = [{ mes: "They talk in the hall." }];
    await manager.setQuality("location", "hall");

    expect(manager.detectSceneBreak()?.hit).toBe(false);

    await manager.setQuality("location", "vault");
    const hit = manager.detectSceneBreak();
    expect(hit?.hit).toBe(true);
    expect(hit?.reason).toBe("location");
  });

  it("notifies scene-break listeners only when the audit confirms a break", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(sceneStory));
    const heard: SharedReadAudit[] = [];
    manager.onSceneBreakConfirmed((audit) => heard.push(audit));

    await manager.applyExtractionAudit({ ...sceneBreakAudit(), sceneBreak: undefined }, []);
    expect(heard).toHaveLength(0);

    await manager.applyExtractionAudit(sceneBreakAudit(), []);
    expect(heard).toHaveLength(1);
  });

  it("runs the scene-break pass: adds a scene summary, expires scene-scoped entries, and fires the sceneBreak reply", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(sceneStory));
    await manager.applyExtractionAudit({ ...sceneBreakAudit(), sceneBreak: undefined }, [], [
      { tier: "session_details", type: "scene", importance: 1, expiration: "scene", entities: [], text: "Old scene detail worth keeping temporarily.", evidence: "quote" },
    ]);
    expect(manager.getSnapshot().memory.entries.some((entry) => entry.expiration === "scene")).toBe(true);

    globalThis.storyOrchestratorDebugSceneSummaryResponse = "They lingered in the hall, tension building before the vault door.";
    const audit = sceneBreakAudit();
    await manager.runSceneBreakPass(audit);

    const snapshot = manager.getSnapshot();
    expect(snapshot.memory.entries.some((entry) => entry.expiration === "scene")).toBe(false);
    expect(snapshot.memory.entries.some((entry) => entry.tier === "scene_history" && entry.text === globalThis.storyOrchestratorDebugSceneSummaryResponse)).toBe(true);
    expect(snapshot.memory.sceneCount).toBe(1);
    expect(executeSlashCommands).toHaveBeenCalledWith(expect.stringContaining("The scene shifts."), expect.anything());
  });

  it("stores the answer, not the reasoning, and writes no summary when the model only reasoned", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(sceneStory));

    globalThis.storyOrchestratorDebugSceneSummaryResponse = "<think>\nThe hall scene ends here.\n</think>\nThey lingered in the hall.";
    await manager.runSceneBreakPass(sceneBreakAudit());
    globalThis.storyOrchestratorDebugSceneSummaryResponse = "<think>\nThe vault scene is about to";
    await manager.runSceneBreakPass({ ...sceneBreakAudit(), id: "audit-scene-2", window: { from: 3, to: 4 } });

    const scenes = manager.getSnapshot().memory.entries.filter((entry) => entry.tier === "scene_history");
    expect(scenes.map((entry) => entry.text)).toEqual(["They lingered in the hall."]);
    expect(manager.getSnapshot().memory.sceneCount).toBe(2);
  });

  it("fires the sceneBreak reply once per distinct break, not once per checkpoint", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(sceneStory));
    (executeSlashCommands as jest.Mock).mockClear();

    globalThis.storyOrchestratorDebugSceneSummaryResponse = "First scene summary.";
    await manager.runSceneBreakPass(sceneBreakAudit());
    globalThis.storyOrchestratorDebugSceneSummaryResponse = "Second scene summary.";
    await manager.runSceneBreakPass({ ...sceneBreakAudit(), id: "audit-scene-2" });

    const shiftCalls = (executeSlashCommands as jest.Mock).mock.calls.filter(([command]) => typeof command === "string" && command.includes("The scene shifts."));
    expect(shiftCalls).toHaveLength(2);
    expect(manager.getSnapshot().memory.sceneCount).toBe(2);
  });
});

describe("RuntimeManager short-term rolling compaction", () => {
  const chatOf = (count: number) => Array.from({ length: count }, (_, index) => ({ name: index % 2 ? "Arin" : "Max", mes: `Message ${index} of the long scene.` }));

  beforeEach(() => {
    resetHost();
    delete globalThis.storyOrchestratorDebugShortTermResponse;
  });

  it("compacts once enough messages accumulate, then holds until the watermark is passed again", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(sceneStory));
    mockContext.chat = chatOf(6);
    expect(manager.shouldCompactShortTerm(5)).toBe(false);

    mockContext.chat = chatOf(13);
    expect(manager.shouldCompactShortTerm(12)).toBe(true);
    globalThis.storyOrchestratorDebugShortTermResponse = "The party searched the ruins for hours.";
    await manager.runShortTermCompaction();

    const entries = manager.getSnapshot().memory.entries.filter((entry) => entry.tier === "short_term");
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe("The party searched the ruins for hours.");
    expect(manager.shouldCompactShortTerm(12)).toBe(false);
  });

  it("replaces the previous rolling entry instead of appending", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(sceneStory));
    mockContext.chat = chatOf(13);
    globalThis.storyOrchestratorDebugShortTermResponse = "First rolling summary.";
    await manager.runShortTermCompaction();
    mockContext.chat = chatOf(26);
    globalThis.storyOrchestratorDebugShortTermResponse = "Second rolling summary.";
    await manager.runShortTermCompaction();

    const entries = manager.getSnapshot().memory.entries.filter((entry) => entry.tier === "short_term");
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe("Second rolling summary.");
  });

  it("recompacts over the same window (write-log coverage must not block the rolling replace)", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(sceneStory));
    mockContext.chat = chatOf(13);
    globalThis.storyOrchestratorDebugShortTermResponse = "First pass.";
    await manager.runShortTermCompaction();
    (manager as unknown as { extras: { memory: { shortTermSummaryEnd: number } } }).extras.memory.shortTermSummaryEnd = -1;
    globalThis.storyOrchestratorDebugShortTermResponse = "Second pass over the same window.";
    await manager.runShortTermCompaction();

    const entries = manager.getSnapshot().memory.entries.filter((entry) => entry.tier === "short_term");
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe("Second pass over the same window.");
  });

  it("leaves a pinned rolling summary untouched", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(sceneStory));
    mockContext.chat = chatOf(13);
    globalThis.storyOrchestratorDebugShortTermResponse = "Pinned summary.";
    await manager.runShortTermCompaction();
    const id = manager.getSnapshot().memory.entries.find((entry) => entry.tier === "short_term")?.id ?? "";
    manager.setMemoryPinned(id, true);

    mockContext.chat = chatOf(26);
    globalThis.storyOrchestratorDebugShortTermResponse = "Should not land.";
    await manager.runShortTermCompaction();

    const entries = manager.getSnapshot().memory.entries.filter((entry) => entry.tier === "short_term");
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe("Pinned summary.");
  });
});

const castStory = {
  format: 2,
  title: "Cast Injection Test",
  description: "Cast + injection regression fixture.",
  qualities: [],
  checkpoints: [{ id: "start", name: "Start", objective: "Start.", type: "anchor", start: true }],
  transitions: [],
  roster: [{ id: "mara", name: "Mara" }, { id: "kael", name: "Kael" }],
};

const memoryAudit = (): SharedReadAudit => ({
  id: "a1",
  createdAt: "2026-07-05T00:00:00.000Z",
  priority: 0,
  reason: "manual",
  contractHash: "h",
  scope: [],
  window: { from: 0, to: 0 },
  prompt: "p",
  rawResponse: "r",
  acceptedDeltas: [],
  rejected: [],
});

describe("RuntimeManager memory injection and cast", () => {
  beforeEach(() => resetHost());

  it("resolves enabled roster ids from the active group, excluding disabled members", async () => {
    (getActiveGroup as jest.Mock).mockReturnValue({ members: ["mara.png", "kael.png"], disabled_members: ["kael.png"] });
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(castStory));
    expect(manager.getEnabledCharacterIds()).toEqual(["mara"]);
  });

  it("injects shared facts and the active speaker's own facts, excluding another character's facts", async () => {
    (getActiveGroup as jest.Mock).mockReturnValue({ members: ["mara.png", "kael.png"], disabled_members: [] });
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(castStory));
    mockContext.chat = [{ name: "Mara", mes: "Hello there.", is_user: false }];

    await manager.applyExtractionAudit(memoryAudit(), [], [
      { tier: "facts", type: "fact", importance: 2, expiration: "permanent", entities: [], text: "Shared fact for everyone.", evidence: "quote" },
      { tier: "facts", type: "relationship", importance: 2, expiration: "permanent", entities: [], characterId: "mara", text: "Mara-only relationship fact.", evidence: "quote" },
      { tier: "facts", type: "relationship", importance: 2, expiration: "permanent", entities: [], characterId: "kael", text: "Kael-only relationship fact.", evidence: "quote" },
    ]);

    const factsPrompt = mockExtensionPrompts.story_orchestrator_memory_facts?.value ?? "";
    expect(factsPrompt).toContain("Shared fact for everyone.");
    expect(factsPrompt).toContain("Mara-only relationship fact.");
    expect(factsPrompt).not.toContain("Kael-only relationship fact.");
    expect(mockExtensionPrompts.story_orchestrator_memory_scene_history).toBeUndefined();
  });

  it("stops injecting a character's facts once they are disabled from the cast", async () => {
    (getActiveGroup as jest.Mock).mockReturnValue({ members: ["mara.png"], disabled_members: [] });
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(castStory));
    mockContext.chat = [{ name: "Mara", mes: "Hello there.", is_user: false }];
    await manager.applyExtractionAudit(memoryAudit(), [], [
      { tier: "facts", type: "fact", importance: 2, expiration: "permanent", entities: [], characterId: "mara", text: "Mara-only fact.", evidence: "quote" },
    ]);
    expect(mockExtensionPrompts.story_orchestrator_memory_facts?.value).toContain("Mara-only fact.");

    (getActiveGroup as jest.Mock).mockReturnValue({ members: ["mara.png"], disabled_members: ["mara.png"] });
    await manager.commitBoundary();
    expect(mockExtensionPrompts.story_orchestrator_memory_facts).toBeUndefined();
  });

  it("opens and resolves story arcs through the shared-read audit", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(castStory));
    await manager.applyExtractionAudit(memoryAudit(), [], [], [
      { kind: "open", text: "Mira swore revenge on the merchant and has not acted yet." },
      { kind: "open", text: "The identity of the granary arsonist is still unknown to all." },
    ]);
    expect(manager.getArcs().filter((arc) => arc.status === "open")).toHaveLength(2);
    expect(manager.getOpenArcs()).toContain("Mira swore revenge on the merchant and has not acted yet.");

    await manager.applyExtractionAudit(memoryAudit(), [], [], [
      { kind: "resolved", text: "Mira finally took her revenge on the merchant at the market." },
    ]);
    const arcs = manager.getArcs();
    expect(arcs.find((arc) => arc.text.startsWith("Mira"))?.status).toBe("resolved");
    expect(arcs.filter((arc) => arc.status === "open")).toHaveLength(1);
  });

  it("writes per-subject epistemic entries from a shared-read audit", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(castStory));
    await manager.applyExtractionAudit(memoryAudit(), [], [], [], [
      { tag: "knows", subject: "Kael", content: "he took the gem" },
      { tag: "hiding", subject: "Kael", hiddenFrom: "Mara", content: "the theft" },
      { tag: "believes", subject: "Mara", content: "nothing was taken" },
    ]);
    const epistemic = manager.getSnapshot().memory.epistemic;
    expect(epistemic).toHaveLength(3);
    expect(epistemic.filter((entry) => entry.subject === "Kael")).toHaveLength(2);
  });

  it("drops an extracted state line for a ledger-bound field (blackboard is the single writer)", async () => {
    const boundStory = {
      ...castStory,
      qualities: [{ key: "kael_location", type: "string", source: "extractor", rubric: "Where Kael is.", ledger_binding: { entity: "Kael", field: "location" } }],
    };
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(boundStory));
    await manager.applyExtractionAudit(memoryAudit(), [], [], [], [], [
      { entity: "Kael", entityType: "character", field: "location", value: "dungeon" },
      { entity: "Kael", entityType: "character", field: "mood", value: "grim" },
    ]);
    const ledger = manager.getSnapshot().memory.ledger;
    expect(ledger).toHaveLength(1);
    expect(ledger[0].field).toBe("mood");
  });

  it("swaps in each drafted member's own private epistemic block, hiding others' knowledge", async () => {
    (getActiveGroup as jest.Mock).mockReturnValue({ members: ["mara.png", "kael.png"], disabled_members: [] });
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(castStory));
    mockContext.chat = [{ name: "Mara", mes: "We should talk.", is_user: false }];
    await manager.applyExtractionAudit(memoryAudit(), [], [], [], [
      { tag: "knows", subject: "Kael", content: "he took the gem" },
      { tag: "hiding", subject: "Kael", hiddenFrom: "Mara", content: "the theft" },
      { tag: "believes", subject: "Mara", content: "nothing was taken" },
    ]);

    manager.onMemberDrafted(1);
    const kaelBlock = mockExtensionPrompts.story_orchestrator_epistemic?.value ?? "";
    expect(kaelBlock).toContain("You know: he took the gem");
    expect(kaelBlock).toContain("You are concealing from Mara: the theft");
    expect(kaelBlock).not.toContain("nothing was taken");

    manager.onMemberDrafted(0);
    const maraBlock = mockExtensionPrompts.story_orchestrator_epistemic?.value ?? "";
    expect(maraBlock).toContain("You believe: nothing was taken");
    expect(maraBlock).not.toContain("the theft");
  });

  it("clears the private epistemic block for a non-roster drafted member instead of leaking the prior one's", async () => {
    (getActiveGroup as jest.Mock).mockReturnValue({ members: ["mara.png", "kael.png"], disabled_members: [] });
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(castStory));
    mockContext.chat = [{ name: "Mara", mes: "We should talk.", is_user: false }];
    await manager.applyExtractionAudit(memoryAudit(), [], [], [], [
      { tag: "knows", subject: "Kael", content: "he took the gem" },
      { tag: "hiding", subject: "Kael", hiddenFrom: "Mara", content: "the theft" },
    ]);

    manager.onMemberDrafted(1);
    expect(mockExtensionPrompts.story_orchestrator_epistemic?.value ?? "").toContain("the theft");

    manager.onMemberDrafted(2);
    expect(mockExtensionPrompts.story_orchestrator_epistemic?.value ?? "").toBe("");
  });

  it("leaves no private knowledge in a group's prompt between drafts, or for impersonate and quiet generations", async () => {
    (getActiveGroup as jest.Mock).mockReturnValue({ members: ["mara.png", "kael.png"], disabled_members: [] });
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(castStory));
    mockContext.chat = [{ name: "Kael", mes: "Nothing to see.", is_user: false }];
    await manager.applyExtractionAudit(memoryAudit(), [], [], [], [{ tag: "hiding", subject: "Kael", hiddenFrom: "Mara", content: "the theft" }]);
    expect(mockExtensionPrompts.story_orchestrator_epistemic?.value ?? "").toBe("");

    manager.onMemberDrafted(1);
    expect(mockExtensionPrompts.story_orchestrator_epistemic?.value ?? "").toContain("the theft");
    manager.onGenerationStarted("normal");
    expect(mockExtensionPrompts.story_orchestrator_epistemic?.value ?? "").toContain("the theft");
    manager.clearPrivateInjection();
    expect(mockExtensionPrompts.story_orchestrator_epistemic?.value ?? "").toBe("");

    for (const type of ["impersonate", "quiet"]) {
      manager.onMemberDrafted(1);
      manager.onGenerationStarted(type);
      expect(mockExtensionPrompts.story_orchestrator_epistemic?.value ?? "").toBe("");
    }
  });

  it("keeps a solo character's private knowledge at rest, but not for impersonate", async () => {
    (getActiveGroup as jest.Mock).mockReturnValue(null);
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(castStory));
    mockContext.chat = [{ name: "Kael", mes: "Nothing to see.", is_user: false }];
    await manager.applyExtractionAudit(memoryAudit(), [], [], [], [{ tag: "hiding", subject: "Kael", hiddenFrom: "Mara", content: "the theft" }]);
    manager.clearPrivateInjection();
    expect(mockExtensionPrompts.story_orchestrator_epistemic?.value ?? "").toContain("the theft");
    manager.onGenerationStarted("impersonate");
    expect(mockExtensionPrompts.story_orchestrator_epistemic?.value ?? "").toBe("");
  });

  it("injects the state-ledger grounding block", async () => {
    (getActiveGroup as jest.Mock).mockReturnValue({ members: ["mara.png"], disabled_members: [] });
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(castStory));
    await manager.applyExtractionAudit(memoryAudit(), [], [], [], [], [
      { entity: "Kael", entityType: "character", field: "location", value: "the dungeon" },
    ]);
    expect(mockExtensionPrompts.story_orchestrator_ledger?.value).toContain("Kael: location=the dungeon");
  });

  it("runs the P2 pass adding knowledge and retiring a superseded false belief on reveal", async () => {
    delete globalThis.storyOrchestratorDebugEpistemicResponse;
    delete globalThis.storyOrchestratorDebugLedgerResponse;
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(castStory));
    await manager.applyExtractionAudit(memoryAudit(), [], [], [], [
      { tag: "believes", subject: "Mara", content: "nothing was taken from the vault" },
    ]);
    globalThis.storyOrchestratorDebugEpistemicResponse = "[knows] Mara | Kael took the gem\n[retire] 1";
    globalThis.storyOrchestratorDebugLedgerResponse = "[state:Kael:character] location=dungeon | mood=grim";
    const changed = await manager.runEpistemicLedgerPass({ ...memoryAudit(), sceneBreak: { at: 0, reason: "divider" } });
    expect(changed).toBe(true);
    const epistemic = manager.getSnapshot().memory.epistemic;
    expect(epistemic.find((entry) => entry.tag === "believes")?.supersededBy).toBeTruthy();
    expect(epistemic.some((entry) => entry.tag === "knows" && entry.subject === "Mara")).toBe(true);
    expect(manager.getSnapshot().memory.ledger.find((row) => row.field === "location")?.value).toBe("dungeon");
    delete globalThis.storyOrchestratorDebugEpistemicResponse;
    delete globalThis.storyOrchestratorDebugLedgerResponse;
  });

  it("skips epistemic and ledger writes when the capability profile is off", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(castStory));
    manager.setMemorySettings({ epistemicLedgerCapable: false });
    await manager.applyExtractionAudit(memoryAudit(), [], [], [], [
      { tag: "knows", subject: "Kael", content: "he took the gem" },
    ], [
      { entity: "Kael", entityType: "character", field: "mood", value: "grim" },
    ]);
    expect(manager.getSnapshot().memory.epistemic).toHaveLength(0);
    expect(manager.getSnapshot().memory.ledger).toHaveLength(0);
  });

  it("clears all memory injection prompts when no story is loaded", async () => {
    (getActiveGroup as jest.Mock).mockReturnValue({ members: ["mara.png"], disabled_members: [] });
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(castStory));
    mockContext.chat = [{ name: "Mara", mes: "Hello there.", is_user: false }];
    await manager.applyExtractionAudit(memoryAudit(), [], [
      { tier: "facts", type: "fact", importance: 2, expiration: "permanent", entities: [], text: "A shared fact.", evidence: "quote" },
    ]);
    expect(mockExtensionPrompts.story_orchestrator_memory_facts).toBeDefined();

    const metadata = mockContext.chatMetadata.story_orchestrator as { selectedStoryId: string | null };
    metadata.selectedStoryId = null;
    await manager.loadSelectedFromChat();

    expect(mockExtensionPrompts.story_orchestrator_memory_facts).toBeUndefined();
  });

  it("stops injecting and skips memory writes when memory is disabled", async () => {
    (getActiveGroup as jest.Mock).mockReturnValue({ members: ["mara.png"], disabled_members: [] });
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(castStory));
    mockContext.chat = [{ name: "Mara", mes: "Hello there.", is_user: false }];
    await manager.applyExtractionAudit(memoryAudit(), [], [
      { tier: "facts", type: "fact", importance: 2, expiration: "permanent", entities: [], text: "A shared fact.", evidence: "quote" },
    ]);
    expect(mockExtensionPrompts.story_orchestrator_memory_facts).toBeDefined();

    manager.setMemorySettings({ enabled: false });
    expect(mockExtensionPrompts.story_orchestrator_memory_facts).toBeUndefined();

    await manager.applyExtractionAudit({ ...memoryAudit(), window: { from: 5, to: 9 } }, [], [
      { tier: "facts", type: "fact", importance: 2, expiration: "permanent", entities: [], text: "Should not be stored.", evidence: "quote" },
    ]);
    expect(manager.getSnapshot().memory.entries.some((entry) => entry.text === "Should not be stored.")).toBe(false);
  });
});

const backlogStory = {
  format: 2,
  title: "Memorize Backlog Test",
  description: "Memorize backlog regression fixture.",
  qualities: [
    { key: "player_has_key", type: "bool", source: "extractor", latching: true, rubric: "Did the player obtain the key?" },
  ],
  checkpoints: [{ id: "start", name: "Start", objective: "Start.", type: "anchor", start: true }],
  transitions: [],
  roster: [],
};

describe("RuntimeManager memorize backlog", () => {
  beforeEach(() => {
    resetHost();
    delete globalThis.storyOrchestratorDebugExtractionResponse;
  });

  it("does nothing when no story is loaded", async () => {
    const manager = new RuntimeManager();
    expect(await manager.runMemorizeBacklog()).toBe(false);
  });

  it("backfills memory tiers across windowed reads and applies the final full-scope blackboard read", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(backlogStory));
    // The read's evidence has to be a span of the window it was given (plan 02's R6 screening), so
    // the phrase the mocked response quotes is in the transcript.
    mockContext.chat = Array.from({ length: 10 }, (_, index) => ({ mes: index === 4 ? "Max took the key from the table." : `Message ${index}.` }));
    globalThis.storyOrchestratorDebugExtractionResponse = [
      "DELTA q=player_has_key value=true evidence=\"took the key\"",
      "MEMORY type=fact importance=2 expiration=permanent text=\"The player found a brass key.\" evidence=\"took the key\"",
    ].join("\n");

    const ok = await manager.runMemorizeBacklog(8);
    expect(ok).toBe(true);

    const snapshot = manager.getSnapshot();
    expect(snapshot.memory.backfill).toEqual({ running: false, processed: 3, total: 3, lastError: null });
    expect(snapshot.memory.entries.filter((entry) => entry.text === "The player found a brass key.").length).toBeGreaterThanOrEqual(2);
    expect(snapshot.blackboard.player_has_key).toBe(true);
  });

  it("records a backfill error without leaving it stuck running", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(backlogStory));
    mockContext.chat = [{ mes: "Only one message." }];
    globalThis.storyOrchestratorDebugExtractionResponse = undefined;

    const ok = await manager.runMemorizeBacklog(8);
    expect(ok).toBe(false);
    expect(manager.getSnapshot().memory.backfill?.running).toBe(false);
    expect(manager.getSnapshot().memory.backfill?.lastError).toBeTruthy();
  });

  it("refuses to start a second backfill while one is already running", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(backlogStory));
    mockContext.chat = Array.from({ length: 8 }, (_, index) => ({ mes: `Message ${index}.` }));
    globalThis.storyOrchestratorDebugExtractionResponse = "NO_DELTA";

    const first = manager.runMemorizeBacklog(8);
    const second = await manager.runMemorizeBacklog(8);
    expect(second).toBe(false);
    expect(await first).toBe(true);
  });
});

describe("RuntimeManager manual memory controls", () => {
  beforeEach(() => resetHost());

  it("pins and unpins an entry so it survives rollback either side of the toggle", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(story));
    await manager.applyExtractionAudit(memoryAudit(), [], [
      { tier: "facts", type: "fact", importance: 2, expiration: "permanent", entities: [], text: "A pinnable fact.", evidence: "quote" },
    ]);
    const id = manager.getSnapshot().memory.entries[0].id;

    await manager.setMemoryPinned(id, true);
    expect(manager.getSnapshot().memory.entries.find((entry) => entry.id === id)?.pinned).toBe(true);

    await manager.setMemoryPinned(id, false);
    expect(manager.getSnapshot().memory.entries.find((entry) => entry.id === id)?.pinned).toBe(false);
  });

  it("excludes an entry and never re-admits matching content from a later read", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(story));
    await manager.applyExtractionAudit(memoryAudit(), [], [
      { tier: "facts", type: "fact", importance: 2, expiration: "permanent", entities: [], text: "An excludable fact.", evidence: "quote" },
    ]);
    const id = manager.getSnapshot().memory.entries[0].id;

    await manager.excludeMemoryEntry(id);
    expect(manager.getSnapshot().memory.entries).toHaveLength(0);
    expect(manager.getSnapshot().memory.excluded.length).toBeGreaterThan(0);

    await manager.applyExtractionAudit({ ...memoryAudit(), window: { from: 5, to: 9 } }, [], [
      { tier: "facts", type: "fact", importance: 2, expiration: "permanent", entities: [], text: "An excludable fact.", evidence: "quote" },
    ]);
    expect(manager.getSnapshot().memory.entries).toHaveLength(0);
  });

  it("edits an entry's text in place", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(story));
    await manager.applyExtractionAudit(memoryAudit(), [], [
      { tier: "facts", type: "fact", importance: 2, expiration: "permanent", entities: [], text: "Old text.", evidence: "quote" },
    ]);
    const id = manager.getSnapshot().memory.entries[0].id;

    await manager.editMemoryEntry(id, "Corrected text.");
    expect(manager.getSnapshot().memory.entries.find((entry) => entry.id === id)?.text).toBe("Corrected text.");
  });
});

const bridgeStory = {
  format: 2,
  title: "Bridge Test",
  description: "Arc bridge regression fixture.",
  qualities: [],
  checkpoints: [
    { id: "start", name: "Start", objective: "Start.", type: "anchor", start: true },
    { id: "reveal", name: "Reveal", objective: "The truth comes out.", type: "anchor", convergence_threshold: 2 },
  ],
  transitions: [
    { from: "start", to: "reveal", priority: 1, gate: { q: "progress_toward_reveal", op: ">=", v: 2 } },
  ],
  roster: [],
  arc_bridges: [{ arcMatch: "granary", anchor: "reveal", amount: 2 }],
};

describe("RuntimeManager arc bridge and canon", () => {
  beforeEach(() => resetHost());
  afterEach(() => {
    delete globalThis.storyOrchestratorDebugArcSummaryResponse;
    delete globalThis.storyOrchestratorDebugCanonResponse;
  });

  it("applies a declared arc bridge increment on resolution, opening the anchor gate", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(bridgeStory));
    await manager.applyExtractionAudit(memoryAudit(), [], [], [{ kind: "open", text: "The identity of the granary arsonist is still unknown to all." }]);
    await manager.applyExtractionAudit(memoryAudit(), [], [], [{ kind: "resolved", text: "The granary arsonist is now known to all." }]);
    await manager.commitBoundary();

    const state = manager.getEngineState();
    expect(state?.blackboard.values.progress_toward_reveal).toBe(2);
    expect(state?.activeCheckpointId).toBe("reveal");
    expect(manager.getArcs().find((arc) => arc.status === "resolved")?.bridgeApplied).toBe(true);
  });

  it("recovers a bridge increment whose pending queue was dropped by a reload", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(bridgeStory));
    const storyId = manager.getSnapshot().storyId as string;
    await manager.applyExtractionAudit(memoryAudit(), [], [], [{ kind: "open", text: "The identity of the granary arsonist is still unknown to all." }]);
    await manager.applyExtractionAudit(memoryAudit(), [], [], [{ kind: "resolved", text: "The granary arsonist is now known to all." }]);
    expect(manager.getArcs().find((arc) => arc.status === "resolved")?.bridgeApplied).toBeFalsy();

    await manager.selectStory(storyId, "hydrate");
    expect(manager.getEngineState()?.blackboard.values.progress_toward_reveal ?? 0).not.toBe(2);

    await manager.commitBoundary();
    expect(manager.getEngineState()?.blackboard.values.progress_toward_reveal).toBe(2);
    expect(manager.getEngineState()?.activeCheckpointId).toBe("reveal");
    expect(manager.getArcs().find((arc) => arc.status === "resolved")?.bridgeApplied).toBe(true);

    await manager.commitBoundary();
    expect(manager.getEngineState()?.blackboard.values.progress_toward_reveal).toBe(2);
  });

  it("summarizes a resolved arc and derives canon, caching by input hash", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(bridgeStory));
    await manager.applyExtractionAudit(memoryAudit(), [], [], [{ kind: "open", text: "The identity of the granary arsonist is still unknown to all." }]);
    await manager.applyExtractionAudit(memoryAudit(), [], [], [{ kind: "resolved", text: "The granary arsonist is now known to all." }]);
    const resolved = manager.getArcs().find((arc) => arc.status === "resolved");
    if (!resolved) throw new Error("expected a resolved arc");

    expect(typeof manager.getCanon()).toBe("string");

    globalThis.storyOrchestratorDebugArcSummaryResponse = "The granary arsonist was unmasked as the steward, ending the mystery.";
    globalThis.storyOrchestratorDebugCanonResponse = "WHAT HAS HAPPENED: The granary mystery was solved.";
    await manager.runArcSummaryPass([resolved.id]);

    expect(manager.getArcs().find((arc) => arc.status === "resolved")?.summary).toContain("unmasked as the steward");
    expect(manager.getCanon()).toContain("granary mystery was solved");

    globalThis.storyOrchestratorDebugCanonResponse = "DIFFERENT CANON TEXT";
    expect(await manager.regenerateCanon()).toBe(false);
    expect(manager.getCanon()).toContain("granary mystery was solved");
    expect(await manager.regenerateCanon(true)).toBe(true);
    expect(manager.getCanon()).toBe("DIFFERENT CANON TEXT");
  });

  // v2.3 plan 05: the canon is prose, so its sentences cannot carry envelopes of their own. What a
  // reader can check is what it was BUILT from — recorded as it stood at the moment of synthesis —
  // and a decided conflict or a rollback marks the whole text stale rather than leaving it in play.
  it("records what the canon was built from, and holds a stale canon out of play", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(bridgeStory));
    await manager.applyExtractionAudit(memoryAudit(), [], [], [{ kind: "open", text: "The identity of the granary arsonist is still unknown to all." }]);
    await manager.applyExtractionAudit(memoryAudit(), [], [], [{ kind: "resolved", text: "The granary arsonist is now known to all." }]);
    const resolved = manager.getArcs().find((arc) => arc.status === "resolved");
    if (!resolved) throw new Error("expected a resolved arc");
    globalThis.storyOrchestratorDebugArcSummaryResponse = "The steward was unmasked.";
    globalThis.storyOrchestratorDebugCanonResponse = "WHAT HAS HAPPENED:\nThe steward was unmasked.";
    await manager.runArcSummaryPass([resolved.id]);

    const canon = manager.getSnapshot().memory.canon;
    expect(canon?.sources?.map((source) => source.id)).toContain(resolved.id);
    expect(canon?.stale).toBe(false);

    const prose = () => manager.getSnapshot().narrative.sections.find((section) => section.id === "story")?.lines ?? [];
    expect(prose()).toEqual(["The steward was unmasked."]);
    manager.getSnapshot().memory.canon!.stale = true;
    expect(prose()).toEqual([]);
    expect(manager.getSnapshot().memory.canon?.text).toContain("steward was unmasked");
    expect(manager.getCanon()).not.toContain("steward was unmasked");
  });

  it("re-derives canon after the story moves on, and shows the player only its history", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(bridgeStory));
    await manager.applyExtractionAudit(memoryAudit(), [], [], [{ kind: "open", text: "The identity of the granary arsonist is still unknown to all." }]);
    await manager.applyExtractionAudit(memoryAudit(), [], [], [{ kind: "resolved", text: "The granary arsonist is now known to all." }]);
    const resolved = manager.getArcs().find((arc) => arc.status === "resolved");
    if (!resolved) throw new Error("expected a resolved arc");
    globalThis.storyOrchestratorDebugArcSummaryResponse = "The steward was unmasked.";
    globalThis.storyOrchestratorDebugCanonResponse = "WHAT HAS HAPPENED:\nThe steward was unmasked.\n\nCURRENT STATE:\nThe village waits for the reveal.";
    await manager.runArcSummaryPass([resolved.id]);
    expect(await manager.regenerateCanon()).toBe(false);

    await manager.commitBoundary();
    expect(manager.getEngineState()?.activeCheckpointId).toBe("reveal");
    globalThis.storyOrchestratorDebugCanonResponse = "WHAT HAS HAPPENED:\nThe steward was unmasked and confessed.\n\nCURRENT STATE:\nThe reveal is under way.";
    expect(await manager.regenerateCanon()).toBe(true);
    expect(manager.getCanon()).toContain("The reveal is under way.");
    const story = manager.getSnapshot().narrative.sections.find((section) => section.id === "story");
    expect(story?.lines).toEqual(["The steward was unmasked and confessed."]);
  });

  it("clears derived canon on a rollback that changes the resolved-arc set", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(bridgeStory));
    await manager.applyExtractionAudit({ ...memoryAudit(), window: { from: 0, to: 0 } }, [], [], [{ kind: "open", text: "The identity of the granary arsonist is still unknown to all." }]);
    await manager.applyExtractionAudit({ ...memoryAudit(), window: { from: 0, to: 0 } }, [], [], [{ kind: "resolved", text: "The granary arsonist is now known to all." }]);
    const resolved = manager.getArcs().find((arc) => arc.status === "resolved");
    if (!resolved) throw new Error("expected a resolved arc");

    globalThis.storyOrchestratorDebugArcSummaryResponse = "The mystery closed.";
    globalThis.storyOrchestratorDebugCanonResponse = "WHAT HAS HAPPENED: the mystery was solved.";
    await manager.runArcSummaryPass([resolved.id]);
    expect(manager.getSnapshot().memory.canon?.text).toContain("solved");

    mockContext.chat = [{ mes: "m0" }];
    await manager.commitBoundary();
    await manager.rollbackFromMessage(0);

    expect(manager.getSnapshot().memory.canon).toBeNull();
    expect(manager.getArcs().some((arc) => arc.status === "resolved")).toBe(false);
  });
});

const copilotDraft = {
  format: 2,
  title: "Copilot Draft",
  description: "",
  qualities: [{ key: "has_key", type: "bool", source: "extractor", rubric: "Does the crew have the vault key?" }],
  checkpoints: [{ id: "start", name: "Start", objective: "Case the vault.", type: "anchor", start: true }],
  transitions: [],
  roster: [],
};

const driverStory = {
  format: 2,
  title: "Driver Test",
  description: "Driver context fixture.",
  qualities: [{ key: "has_key", type: "bool", source: "extractor", rubric: "Does the crew have the vault key?" }],
  checkpoints: [
    { id: "start", name: "Start", objective: "Find the key.", type: "anchor", start: true },
    { id: "vault", name: "Vault", objective: "Open the vault.", type: "anchor", convergence_threshold: 1 },
  ],
  transitions: [
    { from: "start", to: "vault", priority: 0, gate: { q: "has_key", op: "==", v: true }, effects: { progress: { anchor: "vault", amount: 1 } } },
  ],
  roster: [],
};

describe("RuntimeManager copilot seam", () => {
  beforeEach(() => resetHost());

  it("defaults copilot enabled and toggles the setting", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(story));
    expect(manager.getSnapshot().copilot.enabled).toBe(true);

    manager.setCopilotSettings({ enabled: false });
    expect(manager.getSnapshot().copilot.enabled).toBe(false);
  });

  it("returns an ok proposal for a valid debug response", async () => {
    const manager = new RuntimeManager();
    const debugResponse = JSON.stringify({ summary: "q", ops: [{ kind: "addQuality", quality: { key: "trust", type: "int", source: "extractor", rubric: "How much trust?" } }] });
    const result = await manager.runCopilotStage({ draft: copilotDraft, stage: "qualities", message: "", history: [] }, debugResponse);
    expect(result.status).toBe("ok");
    expect(result.proposal.ops).toHaveLength(1);
    expect(result.preview.errors).toEqual([]);
  });

  it("builds a driver context with unmet gates and upcoming anchors", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(driverStory));
    const context = manager.getDriverContext();
    expect(context?.activeCheckpointId).toBe("start");
    expect(context?.unmetGates.some((gate) => gate.includes("has_key"))).toBe(true);
    expect(context?.upcomingAnchors.some((anchor) => anchor.id === "vault")).toBe(true);
  });

  it("returns driver suggestions from a debug response", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(driverStory));
    const suggestions = await manager.runCopilotSuggest(JSON.stringify({ suggestions: [{ title: "Find the key", rationale: "has_key is false" }] }));
    expect(suggestions).toEqual([{ title: "Find the key", rationale: "has_key is false" }]);
  });

  it("sets a nudge extension prompt and clears it", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(driverStory));

    manager.setCopilotNudge("Escalate the standoff.");
    expect(mockExtensionPrompts.story_copilot_nudge?.value).toBe("Escalate the standoff.");

    manager.clearCopilotNudge();
    expect(mockExtensionPrompts.story_copilot_nudge).toBeUndefined();
  });

  it("suppresses nudges and clears an active one when copilot is disabled", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(driverStory));

    manager.setCopilotNudge("Steer harder.");
    expect(mockExtensionPrompts.story_copilot_nudge?.value).toBe("Steer harder.");

    manager.setCopilotSettings({ enabled: false });
    expect(mockExtensionPrompts.story_copilot_nudge).toBeUndefined();

    manager.setCopilotNudge("Ignored while off.");
    expect(mockExtensionPrompts.story_copilot_nudge).toBeUndefined();
  });
});

describe("RuntimeManager plan-13 surfacing", () => {
  beforeEach(() => resetHost());

  const gatedStory = {
    ...story,
    title: "Surfacing Test",
    qualities: [{ key: "has_key", type: "bool", source: "extractor", latching: true, rubric: "Key?" }],
    transitions: [{ from: "start", to: "end", priority: 1, gate: { q: "has_key", op: "==", v: true } }],
  };

  it("renders possible transitions with gate text and target name", async () => {
    const manager = new RuntimeManager();
    expect(manager.getPossibleTransitions()).toEqual([]);
    await manager.importStory(JSON.stringify(gatedStory));
    expect(manager.getPossibleTransitions()).toEqual(["→ End when has_key == true"]);
  });

  it("keeps only the last five payload captures, newest first", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(gatedStory));
    mockExtensionPrompts.story_orchestrator_pacing = { value: "Pacing: hold.", depth: 2 };
    for (let index = 1; index <= 7; index += 1) manager.capturePayload(`reason-${index}`);
    const captures = manager.getPayloadCaptures();
    expect(captures).toHaveLength(5);
    expect(captures[0].reason).toBe("reason-7");
    expect(captures[4].reason).toBe("reason-3");
    expect(captures[0].blocks.map((block) => block.key)).toContain("story_orchestrator_pacing");
  });

  it("detects an away recap on hydrate after a long gap and none after a short one", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(gatedStory));
    const metadata = mockContext.chatMetadata.story_orchestrator as { stories: Record<string, { extras: { lastSessionAt: string | null } }> };
    const storyId = Object.keys(metadata.stories)[0];

    metadata.stories[storyId].extras.lastSessionAt = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString();
    await manager.selectStory(storyId, "hydrate");
    const recap = manager.getAwayRecap();
    expect(recap).not.toBeNull();
    expect(recap?.lines[0]).toContain("Start");

    metadata.stories[storyId].extras.lastSessionAt = new Date().toISOString();
    await manager.selectStory(storyId, "hydrate");
    expect(manager.getAwayRecap()).toBeNull();
  });

  it("showAwayRecap consumes the pending recap once", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(gatedStory));
    const metadata = mockContext.chatMetadata.story_orchestrator as { stories: Record<string, { extras: { lastSessionAt: string | null } }> };
    const storyId = Object.keys(metadata.stories)[0];
    metadata.stories[storyId].extras.lastSessionAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await manager.selectStory(storyId, "hydrate");
    expect(await manager.showAwayRecap()).toBe(true);
    expect(manager.getAwayRecap()).toBeNull();
    expect(await manager.showAwayRecap()).toBe(false);
  });

  // S3 (v2.3 plan 03): the recap is a host modal, so an open one makes the whole document inert to
  // a pointer. It described the chat it was computed for and outlived it, blocking the next chat.
  const openRecap = async (manager: RuntimeManager) => {
    mockContext.chatId = "chat-a";
    await manager.importStory(JSON.stringify(gatedStory));
    const metadata = mockContext.chatMetadata.story_orchestrator as { selectedStoryId: string | null; stories: Record<string, { extras: { lastSessionAt: string | null } }> };
    const storyId = Object.keys(metadata.stories)[0];
    metadata.stories[storyId].extras.lastSessionAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await manager.selectStory(storyId, "hydrate");
    await manager.showAwayRecap();
    return metadata;
  };

  it("takes an open recap down when another chat loads a story", async () => {
    const manager = new RuntimeManager();
    const metadata = await openRecap(manager);
    const before = mockPopupCloses.count;
    mockContext.chatId = "chat-b";
    await manager.selectStory(Object.keys(metadata.stories)[0], "hydrate");
    expect(mockPopupCloses.count).toBe(before + 1);
  });

  it("takes an open recap down when another chat has no story to load", async () => {
    const manager = new RuntimeManager();
    const metadata = await openRecap(manager);
    const before = mockPopupCloses.count;
    mockContext.chatId = "chat-b";
    metadata.selectedStoryId = null;
    await manager.loadSelectedFromChat();
    expect(mockPopupCloses.count).toBe(before + 1);
  });

  // J4 caught this the other way round: dismissing on every load took the recap down on a page
  // reload and nothing put it back, because the first load's save stamps lastSessionAt.
  it("leaves an open recap up when the same chat reloads", async () => {
    const manager = new RuntimeManager();
    const metadata = await openRecap(manager);
    const before = mockPopupCloses.count;
    metadata.stories[Object.keys(metadata.stories)[0]].extras.lastSessionAt = new Date().toISOString();
    await manager.selectStory(Object.keys(metadata.stories)[0], "hydrate");
    expect(mockPopupCloses.count).toBe(before);
  });

  it("strips channel noise from persisted memory prose on hydrate", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(gatedStory));
    await manager.applyExtractionAudit({ ...sceneBreakAudit(), sceneBreak: undefined }, [], [
      { tier: "session_details", type: "detail", importance: 1, expiration: "session", entities: [], text: "Clean detail.", evidence: "quote" },
    ]);
    const metadata = mockContext.chatMetadata.story_orchestrator as { stories: Record<string, { extras: { memory: { entries: Array<{ text: string }>; arcs: unknown[]; canon: unknown } } }> };
    const storyId = Object.keys(metadata.stories)[0];
    const memory = metadata.stories[storyId].extras.memory;
    memory.entries[0].text = "<|channel>thought\n<channel|>The party searched the ruins.";
    memory.arcs = [{ id: "arc-1", text: "<channel|>Find the key.", status: "resolved", summary: "<|channel>thought\nKey found.", openedAt: 0, messageId: 0 }];
    memory.canon = { text: "<|channel>thought\n<channel|>Canon so far.", inputHash: "x", updatedAt: "2026-07-06T00:00:00.000Z" };

    await manager.selectStory(storyId, "hydrate");
    const snapshot = manager.getSnapshot();
    expect(snapshot.memory.entries[0].text).toBe("The party searched the ruins.");
    const arcs = manager.getArcs();
    expect(arcs[0].text).toBe("Find the key.");
    expect(arcs[0].summary).toBe("");
    expect(manager.getCanon()).toContain("Canon so far.");
  });
});

describe("RuntimeManager transition announcements and pending deltas", () => {
  beforeEach(() => resetHost());

  const gatedStory = {
    ...story,
    title: "Announce Test",
    qualities: [{ key: "has_key", type: "bool", source: "extractor", latching: true, rubric: "Key?" }],
    transitions: [{ from: "start", to: "end", priority: 1, gate: { q: "has_key", op: "==", v: true } }],
  };

  const keyAudit = (): SharedReadAudit => ({
    id: "audit-key",
    createdAt: "2026-07-05T00:00:00.000Z",
    priority: 0,
    reason: "test",
    contractHash: "hash",
    scope: ["has_key"],
    window: { from: 0, to: 0 },
    prompt: "prompt",
    rawResponse: "raw",
    acceptedDeltas: [{ delta: { q: "has_key", v: true, source: "extractor" }, evidence: "found the key" }],
    rejected: [],
  });

  it("posts a compact comment to chat when a transition fires", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(gatedStory));
    (executeSlashCommands as jest.Mock).mockClear();
    await manager.setQuality("has_key", "true");
    const commentCalls = (executeSlashCommands as jest.Mock).mock.calls.filter(([command]) => typeof command === "string" && command.startsWith("/comment"));
    expect(commentCalls).toHaveLength(1);
    expect(commentCalls[0][0]).toContain("compact=true");
    expect(commentCalls[0][0]).toContain("End");
  });

  it("stays silent when announcements are disabled", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(gatedStory));
    manager.setUiSettings({ announceTransitions: false });
    (executeSlashCommands as jest.Mock).mockClear();
    await manager.setQuality("has_key", "true");
    const commentCalls = (executeSlashCommands as jest.Mock).mock.calls.filter(([command]) => typeof command === "string" && command.startsWith("/comment"));
    expect(commentCalls).toHaveLength(0);
    expect(manager.getSnapshot().activeCheckpointId).toBe("end");
  });

  it("does not announce boundaries without a fired transition", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(gatedStory));
    (executeSlashCommands as jest.Mock).mockClear();
    mockContext.chat = [{ mes: "nothing decisive" }];
    await manager.commitBoundary();
    const commentCalls = (executeSlashCommands as jest.Mock).mock.calls.filter(([command]) => typeof command === "string" && command.startsWith("/comment"));
    expect(commentCalls).toHaveLength(0);
  });

  it("exposes accepted-but-unapplied deltas until the next boundary", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(gatedStory));
    await manager.applyExtractionAudit(keyAudit(), []);
    expect(manager.getSnapshot().pendingDeltas).toEqual([{ quality: "has_key", value: true, source: "extractor" }]);
    mockContext.chat = [{ mes: "found it" }];
    await manager.commitBoundary();
    expect(manager.getSnapshot().pendingDeltas).toEqual([]);
    expect(manager.getSnapshot().activeCheckpointId).toBe("end");
  });

  it("defaults ui settings on hydrate and persists overrides", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(gatedStory));
    expect(manager.getSnapshot().ui).toEqual({ authorView: false, announceTransitions: true, hudEnabled: true });
    manager.setUiSettings({ authorView: true });
    const metadata = mockContext.chatMetadata.story_orchestrator as { stories: Record<string, { extras: { ui?: { authorView?: boolean } } }> };
    const storyId = Object.keys(metadata.stories)[0];
    delete metadata.stories[storyId].extras.ui;
    await manager.selectStory(storyId, "hydrate");
    expect(manager.getSnapshot().ui.authorView).toBe(false);
  });
});

describe("RuntimeManager checkpoint world info", () => {
  beforeEach(() => {
    resetHost();
    mockLorebooks.Shared = { "A start": false, "A next": true, "B start": true, "Always": true };
  });

  it("rebuilds the playing story's entries from its path and releases the story a chat leaves", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(storyA));
    expect(mockLorebooks.Shared).toEqual({ "A start": true, "A next": false, "B start": true, "Always": true });
    await manager.activateCheckpoint("next");
    expect(mockLorebooks.Shared).toMatchObject({ "A start": false, "A next": true });

    await manager.importStory(JSON.stringify(storyB));
    expect(mockLorebooks.Shared).toEqual({ "A start": false, "A next": false, "B start": true, "Always": true });

    selectNothing();
    await manager.loadSelectedFromChat();
    expect(mockLorebooks.Shared).toEqual({ "A start": false, "A next": false, "B start": false, "Always": true });
  });

  it("clears what a story left on when ST closed mid-story, before any chat plays it again", async () => {
    await new RuntimeManager().importStory(JSON.stringify(storyA));
    mockLorebooks.Shared["A next"] = true;
    selectNothing();
    await new RuntimeManager().loadSelectedFromChat();
    expect(mockLorebooks.Shared).toEqual({ "A start": false, "A next": false, "B start": true, "Always": true });
  });

  it("restores the entries of the checkpoint a rollback returns to", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(storyA));
    mockContext.chat = [{ mes: "one" }];
    await manager.commitBoundary();
    mockContext.chat = [{ mes: "one" }, { mes: "they set off" }];
    await manager.setQuality("go", "true");
    expect(manager.getSnapshot().activeCheckpointId).toBe("next");
    expect(mockLorebooks.Shared).toMatchObject({ "A start": false, "A next": true });
    await manager.rollbackFromMessage(1);
    expect(manager.getSnapshot().activeCheckpointId).toBe("start");
    expect(mockLorebooks.Shared).toMatchObject({ "A start": true, "A next": false });
  });
});

// v2.3 plan 03: the manager is what supplies ownership to every coordinator, so the identity it
// reports has to move when the world moves. The coordinator-level contract (R1) proves the check;
// these prove the manager feeds it the truth.
describe("RuntimeManager run ownership", () => {
  beforeEach(() => resetHost());

  it("reports the chat and story in-flight work belongs to", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(story));
    (mockContext as { chatId?: string }).chatId = 'chat-a';
    const context = manager.getRunContext();
    expect(context.chatId).toBe('chat-a');
    // The identity in-flight work is checked against must be the story this chat actually plays,
    // so it has to agree with the snapshot the UI reads.
    expect(context.storyId).toBe(manager.getSnapshot().storyId);
    expect(context.storyId).not.toBeNull();

    // Opening another chat changes what in-flight work is checked against, which is the whole
    // point: two chats at the same message index used to compare equal.
    (mockContext as { chatId?: string }).chatId = 'chat-b';
    expect(manager.getRunContext().chatId).toBe('chat-b');
  });

  it("bumps the epoch when the story is cleared, so work from before it is stale", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(story));
    const before = manager.getRunContext().sessionEpoch;
    selectNothing();
    await manager.loadSelectedFromChat();
    expect(manager.getRunContext().sessionEpoch).toBeGreaterThan(before);
    expect(manager.getRunContext().storyId).toBeNull();
  });

  it("bumps the epoch on a story load", async () => {
    const manager = new RuntimeManager();
    const before = manager.getRunContext().sessionEpoch;
    await manager.importStory(JSON.stringify(story));
    expect(manager.getRunContext().sessionEpoch).toBeGreaterThan(before);
  });

  it("records WHERE the transcript was edited, not just that it was", async () => {
    // A read over [0, 7] must survive a reply appended at 9 and die on an edit at 5, so the
    // position is what matters — a bare counter cannot tell those apart.
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(story));
    expect(manager.getRunContext().lowestMutatedMessageId).toBeNull();

    await manager.rollbackFromMessage(9);
    expect(manager.getRunContext().lowestMutatedMessageId).toBe(9);
    const afterFirst = manager.getRunContext().windowRevision;

    await manager.rollbackFromMessage(5);
    expect(manager.getRunContext().lowestMutatedMessageId).toBe(5);
    expect(manager.getRunContext().windowRevision).toBeGreaterThan(afterFirst);

    // A later edit does not raise the low-water mark: the earliest damage is what bounds validity.
    await manager.rollbackFromMessage(8);
    expect(manager.getRunContext().lowestMutatedMessageId).toBe(5);
  });

  it("clears the mutation low-water mark when the epoch moves", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(story));
    await manager.rollbackFromMessage(3);
    expect(manager.getRunContext().lowestMutatedMessageId).toBe(3);
    selectNothing();
    await manager.loadSelectedFromChat();
    expect(manager.getRunContext().lowestMutatedMessageId).toBeNull();
    expect(manager.getRunContext().windowRevision).toBe(0);
  });
});

type AsyncBoundaryProbe = {
  effects: {
    applyCheckpoint: jest.Mock<Promise<undefined>>;
    announceTransition: jest.Mock<Promise<undefined>>;
    fireNpcReplies: jest.Mock<Promise<undefined>>;
  };
  stagecraft: { applyAccepted: jest.Mock<Promise<undefined>> };
  pacing: {
    applyCommitted: jest.Mock<void>;
    clearPending: jest.Mock<void>;
    updateSteering: jest.Mock<void>;
  };
  expansion: { revalidateInserted: jest.Mock<void> };
  memory: {
    enqueueArcBridges: jest.Mock<unknown[]>;
    markBridgesApplied: jest.Mock<void>;
    updateInjection: jest.Mock<void>;
  };
  engine: { commitBoundary: jest.Mock };
  persist: jest.Mock<Promise<undefined>>;
};

function asyncGate() {
  let finish!: (value: undefined) => void;
  const promise = new Promise<undefined>((done) => { finish = done; });
  return { promise, resolve: () => finish(undefined) };
}

async function settleAsync() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function boundaryHarness() {
  const manager = new RuntimeManager();
  await manager.importStory(JSON.stringify(story));
  const probe = manager as unknown as AsyncBoundaryProbe;
  const result = { fired: true, activeCheckpointId: "start", effects: {} };
  probe.effects.applyCheckpoint = jest.fn(async () => undefined);
  probe.effects.announceTransition = jest.fn(async () => undefined);
  probe.effects.fireNpcReplies = jest.fn(async () => undefined);
  probe.stagecraft.applyAccepted = jest.fn(async () => undefined);
  probe.pacing.applyCommitted = jest.fn();
  probe.pacing.clearPending = jest.fn();
  probe.pacing.updateSteering = jest.fn();
  probe.expansion.revalidateInserted = jest.fn();
  probe.memory.enqueueArcBridges = jest.fn(() => []);
  probe.memory.markBridgesApplied = jest.fn();
  probe.memory.updateInjection = jest.fn();
  probe.engine.commitBoundary = jest.fn(() => result);
  probe.persist = jest.fn(async () => undefined);
  const notify = jest.spyOn(manager, "notify").mockImplementation(() => undefined);
  const boundary = jest.fn();
  manager.onBoundary(boundary);
  return { manager, probe, result, notify, boundary };
}

describe("RuntimeManager async boundary ownership", () => {
  beforeEach(() => resetHost());

  control("afterSpeak persists and notifies when its world stays current", async () => {
    const h = await boundaryHarness();
    const gate = asyncGate();
    h.probe.effects.fireNpcReplies.mockImplementationOnce(() => gate.promise);

    const pending = h.manager.fireAfterSpeak();
    gate.resolve();
    await pending;

    expect(h.probe.persist).toHaveBeenCalledTimes(1);
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  control("afterSpeak writes nothing after its world lapses", async () => {
    const h = await boundaryHarness();
    const gate = asyncGate();
    h.probe.effects.fireNpcReplies.mockImplementationOnce(() => gate.promise);

    const pending = h.manager.fireAfterSpeak();
    h.manager.invalidateRuns();
    gate.resolve();
    await pending;

    expect(h.probe.persist).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
  });

  control("a same-world boundary reaches every post-await write", async () => {
    const h = await boundaryHarness();

    expect(await h.manager.commitBoundary()).toBe(h.result);
    expect(h.probe.effects.applyCheckpoint).toHaveBeenCalledTimes(1);
    expect(h.probe.stagecraft.applyAccepted).toHaveBeenCalledTimes(1);
    expect(h.probe.pacing.applyCommitted).toHaveBeenCalledTimes(1);
    expect(h.probe.memory.updateInjection).toHaveBeenCalledTimes(1);
    expect(h.probe.persist).toHaveBeenCalledTimes(1);
    expect(h.probe.effects.announceTransition).toHaveBeenCalledTimes(1);
    expect(h.boundary).toHaveBeenCalledTimes(1);
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  control("a boundary that lapses during checkpoint effects stops before stagecraft", async () => {
    const h = await boundaryHarness();
    const gate = asyncGate();
    h.probe.effects.applyCheckpoint.mockImplementationOnce(() => gate.promise);

    const pending = h.manager.commitBoundary();
    h.manager.invalidateRuns();
    gate.resolve();
    expect(await pending).toBeNull();

    expect(h.probe.stagecraft.applyAccepted).not.toHaveBeenCalled();
    expect(h.probe.persist).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
  });

  control("a boundary that lapses during stagecraft stops before runtime state writes", async () => {
    const h = await boundaryHarness();
    const gate = asyncGate();
    h.probe.stagecraft.applyAccepted.mockImplementationOnce(() => gate.promise);

    const pending = h.manager.commitBoundary();
    await settleAsync();
    expect(h.probe.stagecraft.applyAccepted).toHaveBeenCalledTimes(1);
    h.manager.invalidateRuns();
    gate.resolve();
    expect(await pending).toBeNull();

    expect(h.probe.pacing.applyCommitted).not.toHaveBeenCalled();
    expect(h.probe.persist).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
  });

  control("a boundary that lapses during persistence stops before announcement", async () => {
    const h = await boundaryHarness();
    const gate = asyncGate();
    h.probe.persist.mockImplementationOnce(() => gate.promise);

    const pending = h.manager.commitBoundary();
    await settleAsync();
    expect(h.probe.persist).toHaveBeenCalledTimes(1);
    h.manager.invalidateRuns();
    gate.resolve();
    expect(await pending).toBeNull();

    expect(h.probe.effects.announceTransition).not.toHaveBeenCalled();
    expect(h.boundary).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
  });

  control("a boundary that lapses during announcement stops before observers", async () => {
    const h = await boundaryHarness();
    const gate = asyncGate();
    h.probe.effects.announceTransition.mockImplementationOnce(() => gate.promise);

    const pending = h.manager.commitBoundary();
    await settleAsync();
    expect(h.probe.effects.announceTransition).toHaveBeenCalledTimes(1);
    h.manager.invalidateRuns();
    gate.resolve();
    expect(await pending).toBeNull();

    expect(h.boundary).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
  });
});

describe("V4: a boundary committed for an earlier reply", () => {
  beforeEach(() => resetHost());

  it("is pinned to that reply's message, not to the end of the chat", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(story));
    mockContext.chat = [{ mes: "a" }, { mes: "b" }, { mes: "c" }, { mes: "d" }];
    await manager.commitBoundary(1);
    expect(manager.getEngineState()?.lastMessageId).toBe(1);
    await manager.commitBoundary(9);
    expect(manager.getEngineState()?.lastMessageId).toBe(3);
  });

  it("control: without a message it reads the end of the chat", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(story));
    mockContext.chat = [{ mes: "a" }, { mes: "b" }, { mes: "c" }];
    await manager.commitBoundary();
    expect(manager.getEngineState()?.lastMessageId).toBe(2);
  });
});

describe("V5: opening a chat whose saved state is stamped for another chat", () => {
  beforeEach(() => resetHost());

  it("journals the mismatch and leaves the stored state untouched", async () => {
    const foreign = { version: 4, chatId: "chat-elsewhere", selectedStoryId: "s1", stories: {} };
    mockContext.chatMetadata = { story_orchestrator: foreign };
    const manager = new RuntimeManager();
    await manager.loadSelectedFromChat();
    expect(JSON.stringify(manager.getSessionJournal())).toContain("blob-chat-mismatch: stamped for chat-elsewhere");
    expect(mockContext.chatMetadata.story_orchestrator).toBe(foreign);
  });
});

describe("V3: an exit that a newer load overtakes leaves the newer load alone", () => {
  beforeEach(() => resetHost());

  it("a story imported while the exit restore runs keeps its fresh state", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(story));
    const internals = manager as unknown as { selectionDeps: { clearStory: (status: string) => Promise<void> }; extras: { lastAppliedCheckpointId: string | null } };
    const clearing = internals.selectionDeps.clearStory("No story selected for this chat");
    const importing = manager.importStory(JSON.stringify(story));
    await Promise.all([clearing, importing]);
    expect(manager.getSnapshot().storyId).not.toBeNull();
    expect(manager.getSnapshot().status).not.toBe("No story selected for this chat");
    expect(internals.extras.lastAppliedCheckpointId).not.toBeNull();
  });

  it("control: an exit nothing overtakes clears the story", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(story));
    const internals = manager as unknown as { selectionDeps: { clearStory: (status: string) => Promise<void> } };
    await internals.selectionDeps.clearStory("No story selected for this chat");
    expect(manager.getSnapshot().storyId).toBeNull();
    expect(manager.getSnapshot().status).toBe("No story selected for this chat");
  });
});

describe("V3: a superseded load or activation stops before its tail", () => {
  beforeEach(() => {
    resetHost();
    mockLorebooks.Shared = { "A start": false, "A next": true, "B start": false, "Always": true };
  });

  it("an activation overtaken mid-staging reports nothing and stamps nothing", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(storyA));
    (disableWIEntry as jest.Mock).mockImplementationOnce(async (lorebook: string, comments: string | string[]) => {
      (manager as unknown as { invalidateRuns: () => void }).invalidateRuns();
      return mockSwitchEntries(lorebook, comments, false);
    });
    expect(await manager.activateCheckpoint("next")).toBe(false);
    expect(manager.getSnapshot().status).not.toBe("Now at Next");
  });

  it("a load overtaken during its staging does not release the lore of the world that replaced it", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(storyA));
    expect(mockLorebooks.Shared["A start"]).toBe(true);
    (enableWIEntry as jest.Mock).mockImplementationOnce(async (lorebook: string, comments: string | string[]) => {
      (manager as unknown as { invalidateRuns: () => void }).invalidateRuns();
      return mockSwitchEntries(lorebook, comments, true);
    });
    await manager.importStory(JSON.stringify(storyB));
    expect(mockLorebooks.Shared["A start"]).toBe(true);
    expect(manager.getSnapshot().status).not.toBe("Started wi-b");
  });

  it("a hot swap overtaken during its staging does not go on to stamp the chat", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(storyA));
    const internals = manager as unknown as { loaded: unknown; swapStory: (loaded: unknown, state: null, reanchored: boolean) => Promise<void>; invalidateRuns: () => void };
    const before = manager.getSnapshot().status;
    (disableWIEntry as jest.Mock).mockImplementationOnce(async (lorebook: string, comments: string | string[]) => {
      internals.invalidateRuns();
      return mockSwitchEntries(lorebook, comments, false);
    });
    await internals.swapStory(internals.loaded, null, false);
    expect(manager.getSnapshot().status).toBe(before);
  });

  it("control: an unmoved load releases the story it left", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(storyA));
    await manager.importStory(JSON.stringify(storyB));
    expect(mockLorebooks.Shared["A start"]).toBe(false);
    expect(manager.getSnapshot().status).toBe("Started wi-b");
  });
});

describe("RuntimeManager: an expansion merged between boundaries (L4)", () => {
  beforeEach(() => resetHost());

  const forkStory = () => readFileSync(join(__dirname, "..", "..", "test", "fixtures", "generated-fork.story.json"), "utf-8");
  const forkGolden = () => readFileSync(join(__dirname, "..", "..", "test", "goldens", "generation", "generated-fork.3.response.txt"), "utf-8");
  const keyAudit = (): SharedReadAudit => ({ ...tensionAudit("stirring", 0), id: "audit-key", scope: ["key_found"], acceptedDeltas: [{ delta: { q: "key_found", v: true, source: "extractor" }, evidence: "the key" }] });

  it("keeps the extraction delta the next boundary was going to commit", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(forkStory());
    await manager.applyExtractionAudit(keyAudit(), []);
    expect(await manager.runExpansionNow(forkGolden())).toBe(true);
    expect(manager.getEngineState()?.activeCheckpointId).toBe("start");
    mockContext.chat = [{ mes: "found it" }];
    const result = await manager.commitBoundary();
    expect(result?.queue.applied).toHaveLength(1);
    expect(manager.getEngineState()?.blackboard.values.key_found).toBe(true);
    expect(manager.getEngineState()?.activeCheckpointId).toBe("gen_fork_stub_1");
  });
});
