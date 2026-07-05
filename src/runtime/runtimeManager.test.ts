import type { SharedReadAudit } from "@extraction/index";
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

jest.mock("@services/STAPI", () => ({
  getContext: () => mockContext,
  setStoryExtensionPrompt: (key: string, text: string, depth: number) => { mockExtensionPrompts[key] = { value: text, depth }; },
  clearStoryExtensionPrompt: (key: string) => { delete mockExtensionPrompts[key]; },
  applyCharacterAN: jest.fn(async () => undefined),
  clearCharacterAN: jest.fn(async () => undefined),
  applyTextGenPresetRuntime: jest.fn(),
  findTextGenPreset: jest.fn(() => null),
  disableWIEntry: jest.fn(async () => undefined),
  enableWIEntry: jest.fn(async () => undefined),
  executeSlashCommands: jest.fn(async () => undefined),
  setGroupMembersDisabled: jest.fn(async () => undefined),
}));

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
