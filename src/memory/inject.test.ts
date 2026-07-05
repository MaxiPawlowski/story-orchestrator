jest.mock("@services/STAPI", () => ({
  setStoryExtensionPrompt: jest.fn(),
  clearStoryExtensionPrompt: jest.fn(),
}));

import { buildMemoryInjectionBlocks, memoryExtensionKey } from "./inject";
import type { MemoryEntry } from "./types";

const entry = (overrides: Partial<MemoryEntry>): MemoryEntry => ({
  id: overrides.id ?? `id-${Math.random()}`,
  tier: "facts",
  text: "text",
  type: "fact",
  importance: 2,
  expiration: "permanent",
  entities: [],
  confidence: 1,
  activationTriggers: [],
  evidence: "evidence",
  createdAt: 0,
  recallCount: 0,
  ...overrides,
});

describe("buildMemoryInjectionBlocks", () => {
  it("includes shared (no characterId) facts regardless of active speaker", () => {
    const blocks = buildMemoryInjectionBlocks([entry({ text: "Shared fact.", characterId: undefined, createdAt: 1 })], "mara");
    expect(blocks.facts).toBe("Shared fact.");
  });

  it("includes the active speaker's own facts", () => {
    const blocks = buildMemoryInjectionBlocks([entry({ text: "Mara-specific fact.", characterId: "mara", createdAt: 1 })], "mara");
    expect(blocks.facts).toBe("Mara-specific fact.");
  });

  it("excludes another character's facts when they are not the active speaker", () => {
    const blocks = buildMemoryInjectionBlocks([entry({ text: "Kael-specific fact.", characterId: "kael", createdAt: 1 })], "mara");
    expect(blocks.facts).toBe("");
  });

  it("excludes all per-character facts when there is no active speaker", () => {
    const blocks = buildMemoryInjectionBlocks([
      entry({ text: "Shared fact.", characterId: undefined, createdAt: 1 }),
      entry({ text: "Kael-specific fact.", characterId: "kael", createdAt: 2 }),
    ], null);
    expect(blocks.facts).toBe("Shared fact.");
  });

  it("does not apply characterId filtering to non-facts tiers", () => {
    const blocks = buildMemoryInjectionBlocks([entry({ tier: "session_details", type: "scene", text: "A scene detail.", characterId: "kael", createdAt: 1 })], "mara");
    expect(blocks.session_details).toBe("A scene detail.");
  });

  it("orders entries within a tier by createdAt", () => {
    const blocks = buildMemoryInjectionBlocks([
      entry({ text: "second", createdAt: 5 }),
      entry({ text: "first", createdAt: 1 }),
    ], null);
    expect(blocks.facts).toBe("first\nsecond");
  });

  it("produces an empty string for a tier with no entries", () => {
    const blocks = buildMemoryInjectionBlocks([], null);
    expect(blocks.scene_history).toBe("");
  });
});

describe("memoryExtensionKey", () => {
  it("prefixes each tier with the shared injection key namespace", () => {
    expect(memoryExtensionKey("facts")).toBe("story_orchestrator_memory_facts");
    expect(memoryExtensionKey("scene_history")).toBe("story_orchestrator_memory_scene_history");
  });
});
