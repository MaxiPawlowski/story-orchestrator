const mockChat: unknown[] = [];
const mockEntries: Array<{ eventName: string; handler: (...args: unknown[]) => unknown }> = [];

jest.mock("@services/STAPI", () => ({
  setStoryExtensionPrompt: () => undefined,
  clearStoryExtensionPrompt: () => undefined,
  subscribeToHostEvents: (entries: Array<{ eventName: string; handler: (...args: unknown[]) => unknown }>) => { mockEntries.push(...entries); return () => undefined; },
  getContext: () => ({ chat: mockChat }),
  readReasoningTags: () => ({}),
  rearmHostMacros: () => 0,
  noteHostSettingsLoaded: () => undefined,
  EXTENSION_SETTINGS_LOADED_EVENT: "EXTENSION_SETTINGS_LOADED",
}));

jest.mock("../runtimeManager", () => ({
  runtimeManager: {
    getStory: () => null,
    getEngineState: () => null,
    getCachedSnapshot: () => ({ carry: null }),
  },
}));

import { GenerationLifecycle } from "../generationLifecycle";
import { isPlayerRow, isPlayerSend, ownPost } from "../playerSend";
import { subscribeGenerationEvents } from "./generation";

const fire = async (event: string, ...args: unknown[]) => {
  for (const entry of mockEntries.filter((candidate) => candidate.eventName === event)) await entry.handler(...args);
};

const calls = { player: 0, lore: 0 };
const live = { loudGate: { release: () => undefined }, draftedBeat: { drafted: () => undefined }, talk: { onPlayerMessage: () => { calls.player += 1; } } };
const lore = {
  loreWatch: { opened: () => undefined, settled: () => undefined, reassert: () => undefined },
  scanGating: { reassert: () => undefined },
  storyLore: { reassert: () => undefined },
  onGenerationStarted: async () => undefined,
  onMessageSent: async () => { calls.lore += 1; },
};

const COMMENT = { name: "Note", is_user: false, is_system: true, mes: "Following Waystation camp", extra: { type: "comment", isSmallSys: true } };
const NARRATOR = { name: "System", is_user: false, is_system: false, mes: "The rain stops.", extra: { type: "narrator" } };
const PLAYER = { name: "Rook", is_user: true, is_system: false, mes: "Onward.", extra: {} };

beforeEach(() => {
  mockEntries.length = 0;
  mockChat.length = 0;
  calls.player = 0;
  calls.lore = 0;
  subscribeGenerationEvents(live as never, new GenerationLifecycle(() => true), lore as never, () => mockChat.length - 1, () => undefined);
});

describe("v3.0 19 fix 2: a posted note is not a player turn", () => {
  it("the transition note (/comment) and a /sys line reach neither the talk chain nor the lore pick", async () => {
    mockChat.push(PLAYER, { name: "Mara", is_user: false, mes: "We go." }, COMMENT);
    await fire("MESSAGE_SENT", 2);
    mockChat.push(NARRATOR);
    await fire("MESSAGE_SENT", 3);
    expect(calls).toEqual({ player: 0, lore: 0 });
  });

  it("control: the player's own line still yields the chain and starts the lore pick", async () => {
    mockChat.push(PLAYER);
    await fire("MESSAGE_SENT", 0);
    expect(calls).toEqual({ player: 1, lore: 1 });
  });

  it("our own posting path is never a player turn, whatever the row says", async () => {
    mockChat.push(PLAYER);
    const own = ownPost();
    await fire("MESSAGE_SENT", 0);
    own();
    own();
    expect(calls).toEqual({ player: 0, lore: 0 });
    await fire("MESSAGE_SENT", 0);
    expect(calls).toEqual({ player: 1, lore: 1 });
  });

  it("reads the row ST names: a user row that is hidden, a missing row or no id is not a send", () => {
    expect(isPlayerRow(PLAYER)).toBe(true);
    expect(isPlayerRow({ ...PLAYER, is_system: true })).toBe(false);
    expect(isPlayerRow(COMMENT)).toBe(false);
    expect(isPlayerSend(5, [PLAYER])).toBe(false);
    expect(isPlayerSend(null, [PLAYER])).toBe(false);
  });
});
