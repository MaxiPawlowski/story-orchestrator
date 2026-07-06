import type { SharedReadAudit } from "@extraction/index";
import { executeSlashCommands, getActiveGroup } from "@services/STAPI";
import { RuntimeManager } from "./runtimeManager";

const mockExtensionPrompts: Record<string, { value: string; depth: number }> = {};
const mockContext = {
  chat: [] as Array<{ mes: string }>,
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
    getActiveGroup: getActiveGroupMock,
    resolveGroupMemberId: resolveGroupMemberIdMock,
    getCharacterNameById: (id: number) => (id === 0 ? "Mara" : id === 1 ? "Kael" : id === 2 ? "Narrator" : undefined),
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
  Object.keys(mockExtensionPrompts).forEach((key) => { delete mockExtensionPrompts[key]; });
  (getActiveGroup as jest.Mock).mockReturnValue(null);
};

describe("RuntimeManager pacing", () => {
  beforeEach(() => resetHost());

  it("clears the pacing prompt when no story is selected", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(story));
    await manager.applyExtractionAudit(tensionAudit("critical", 0.75), []);
    mockContext.chat = [{ mes: "danger" }];
    await manager.commitBoundary();
    expect(mockExtensionPrompts.story_orchestrator_pacing?.value).toContain("Pacing:");

    const metadata = mockContext.chatMetadata.story_orchestrator as { selectedStoryHash: string | null };
    metadata.selectedStoryHash = null;
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
});

describe("RuntimeManager memory migration", () => {
  beforeEach(() => resetHost());

  it("migrates a legacy extras.extraction.facts blob into the facts memory tier on hydrate", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(story));
    const hash = manager.getSnapshot().storyHash as string;

    const blob = mockContext.chatMetadata.story_orchestrator as { stories: Record<string, { extras: Record<string, unknown> }> };
    const persistedExtras = blob.stories[hash].extras;
    delete persistedExtras.memory;
    persistedExtras.extraction = {
      ...(persistedExtras.extraction as Record<string, unknown>),
      facts: [{ text: "Mara trusts the player.", evidence: "I trust you.", importance: 2, boundary: 1, messageId: 3 }],
    };

    await manager.selectStory(hash, "hydrate");

    const migrated = manager.getSnapshot().memory.entries;
    expect(migrated).toHaveLength(1);
    expect(migrated[0]).toMatchObject({ tier: "facts", type: "fact", text: "Mara trusts the player.", evidence: "I trust you.", importance: 2, expiration: "permanent", createdAt: 1, messageId: 3 });
  });

  it("does not re-migrate once extras.memory already exists", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(story));
    const hash = manager.getSnapshot().storyHash as string;

    await manager.selectStory(hash, "hydrate");
    expect(manager.getSnapshot().memory.entries).toHaveLength(0);
  });

  it("clears a stuck backfill.running flag on reload so a new backlog can start", async () => {
    const manager = new RuntimeManager();
    await manager.importStory(JSON.stringify(story));
    const hash = manager.getSnapshot().storyHash as string;

    const blob = mockContext.chatMetadata.story_orchestrator as { stories: Record<string, { extras: { memory: { backfill: unknown } } }> };
    blob.stories[hash].extras.memory.backfill = { running: true, processed: 1, total: 3, lastError: null };

    await manager.selectStory(hash, "hydrate");
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

    const metadata = mockContext.chatMetadata.story_orchestrator as { selectedStoryHash: string | null };
    metadata.selectedStoryHash = null;
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
    mockContext.chat = Array.from({ length: 10 }, (_, index) => ({ mes: `Message ${index}.` }));
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
    const hash = manager.getSnapshot().storyHash as string;
    await manager.applyExtractionAudit(memoryAudit(), [], [], [{ kind: "open", text: "The identity of the granary arsonist is still unknown to all." }]);
    await manager.applyExtractionAudit(memoryAudit(), [], [], [{ kind: "resolved", text: "The granary arsonist is now known to all." }]);
    expect(manager.getArcs().find((arc) => arc.status === "resolved")?.bridgeApplied).toBeFalsy();

    await manager.selectStory(hash, "hydrate");
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
