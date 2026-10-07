import { parseStoryV2OrThrow, type NormalizedStoryV2 } from "@engine/index";
import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import { startPlayerRole } from "./playerRoleHost";
import { installPersonaHost } from "./playerSetupPort";
import type { RuntimeManager } from "./runtimeManager";

const mockPrompts: Record<string, { text: string; depth: number }> = {};
const mockPersona = { description: "", name: "Max" };
const mockEvents: Record<string, () => void> = {};

jest.mock("@services/STAPI", () => ({
  setStoryExtensionPrompt: (key: string, text: string, depth: number) => { mockPrompts[key] = { text, depth }; return { ok: true }; },
  clearStoryExtensionPrompt: (key: string) => { delete mockPrompts[key]; return { ok: true }; },
  loadPersonasModule: async () => null,
  readPersonas: () => ({ avatarId: "max.png", name: mockPersona.name, description: mockPersona.description, lockedAvatarId: null, personas: [], canCreate: true }),
  selectPersona: async () => ({ ok: true, avatarId: "max.png" }),
  lockPersonaToChat: async () => ({ ok: true, avatarId: "max.png" }),
  createPersona: async () => ({ ok: true, avatarId: "new.png" }),
  subscribeToHostEvents: (entries: Array<{ eventName: string; handler: () => void }>) => {
    entries.forEach((entry) => { mockEvents[entry.eventName] = entry.handler; });
    return () => entries.forEach((entry) => { delete mockEvents[entry.eventName]; });
  },
}));

const storyWith = (player?: Record<string, unknown>): NormalizedStoryV2 => parseStoryV2OrThrow({
  format: 2, id: "road", title: "The Road", description: "D", qualities: [], transitions: [], roster: [],
  checkpoints: [{ id: "start", name: "Start", objective: "o", type: "anchor", start: true }], ...(player ? { player } : {}),
});

const fakeManager = (story: NormalizedStoryV2 | null, chat: string | null = "chat-1") => {
  const listeners = new Set<() => void>();
  const state = { story, chat };
  const manager = {
    getStory: () => state.story,
    getLoadedChatId: () => state.chat,
    notify: () => listeners.forEach((listener) => listener()),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); },
  } as unknown as RuntimeManager;
  return { manager, state };
};

const KEY = INJECTION_REGISTRY.playerRole.key;
const failed = async () => ({ ok: false as const, reason: "not in this test" });
installPersonaHost({
  read: () => ({ avatarId: "max.png", name: mockPersona.name, description: mockPersona.description, lockedAvatarId: null, personas: [], canCreate: true }),
  select: failed, lock: failed, create: failed,
});

describe("v2.7 34 the player-role block reaches the prompt (declared payload change)", () => {
  beforeEach(() => {
    Object.keys(mockPrompts).forEach((key) => { delete mockPrompts[key]; });
    mockPersona.description = "";
  });

  it("invariance: a story without a player block adds nothing to the prompt", () => {
    const { manager } = fakeManager(storyWith());
    const stop = startPlayerRole(manager);
    expect(mockPrompts).toEqual({});
    stop();
  });

  it("a player story adds exactly one line, at the registry key and depth, and re-checks on every persona edit", () => {
    const { manager } = fakeManager(storyWith({ role: "a courier", summary: "You carry a letter." }));
    const stop = startPlayerRole(manager);
    expect(mockPrompts).toEqual({ [KEY]: { text: "In this story, {{user}} is a courier: You carry a letter.", depth: INJECTION_REGISTRY.playerRole.depth } });
    mockPersona.description = "In this story, {{user}} is a courier: You carry a letter.";
    mockEvents.PERSONA_UPDATED?.();
    expect(mockPrompts).toEqual({});
    mockPersona.description = "Edited.";
    mockEvents.PERSONA_UPDATED?.();
    expect(Object.keys(mockPrompts)).toEqual([KEY]);
    stop();
    expect(mockPrompts).toEqual({});
  });

  it("nothing is added while no chat owns a story", () => {
    const { manager } = fakeManager(storyWith({ role: "a courier" }), null);
    const stop = startPlayerRole(manager);
    expect(mockPrompts).toEqual({});
    stop();
  });
});
