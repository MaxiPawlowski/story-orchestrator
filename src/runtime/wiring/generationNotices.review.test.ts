import { INJECTION_REGISTRY } from "@constants/injectionRegistry";

const mockPrompts: Record<string, string> = {};
const mockEntries: Array<{ eventName: string; handler: (...args: unknown[]) => unknown }> = [];

jest.mock("@services/STAPI", () => ({
  setStoryExtensionPrompt: (key: string, text: string) => { mockPrompts[key] = text; },
  clearStoryExtensionPrompt: (key: string) => { delete mockPrompts[key]; },
  subscribeToHostEvents: (entries: Array<{ eventName: string; handler: (...args: unknown[]) => unknown }>) => { mockEntries.push(...entries); return () => undefined; },
  getContext: () => ({ chat: [] }),
  readReasoningTags: () => ({}),
  rearmHostMacros: () => 0,
  noteHostSettingsLoaded: () => undefined,
  EXTENSION_SETTINGS_LOADED_EVENT: "EXTENSION_SETTINGS_LOADED",
}));

jest.mock("../runtimeManager", () => ({
  runtimeManager: {
    getStory: () => null,
    getEngineState: () => null,
    getCachedSnapshot: () => ({ carry: { block: "PREVIOUSLY: the last run ended at the harbour." } }),
    onGenerationStarted: () => undefined,
    setGenerationOpen: () => undefined,
    capturePayload: () => undefined,
    clearPrivateInjection: () => undefined,
    restoreTurnNotes: () => undefined,
    clearCopilotNudge: () => undefined,
    commitContinuityNote: () => undefined,
    onMemberDrafted: () => undefined,
  },
}));

jest.mock("../awayNotice", () => ({
  ...jest.requireActual("../awayNotice"),
  awayNoticeLine: () => "Arin is not here.",
}));

import { GenerationLifecycle } from "../generationLifecycle";
import { subscribeGenerationEvents } from "./generation";

const fire = async (event: string, ...args: unknown[]) => {
  for (const entry of mockEntries.filter((candidate) => candidate.eventName === event)) await entry.handler(...args);
};

const live = { loudGate: { release: () => undefined }, draftedBeat: { drafted: () => undefined } };
const lore = {
  loreWatch: { opened: () => undefined, settled: () => undefined, reassert: () => undefined },
  scanGating: { reassert: () => undefined },
  storyLore: { reassert: () => undefined },
  onGenerationStarted: async () => undefined,
  onMessageSent: async () => undefined,
};

const AWAY = INJECTION_REGISTRY.awayNotice.key;
const PREVIOUSLY = INJECTION_REGISTRY.previously.key;

beforeEach(() => {
  for (const key of Object.keys(mockPrompts)) delete mockPrompts[key];
  mockEntries.length = 0;
  subscribeGenerationEvents(live as never, new GenerationLifecycle(() => true), lore as never, () => 3, () => undefined);
});

describe("review 2026-10-16 #5: a nested withholding run withholds the wiring-owned notices and the outer run gets them back", () => {
  it.each(["quiet", "impersonate"])("nested %s: away notice and Previously are absent while it runs and restored when it ends", async (type) => {
    await fire("GENERATION_STARTED", "normal", {}, false);
    expect(mockPrompts[AWAY]).toBe("Arin is not here.");
    expect(mockPrompts[PREVIOUSLY]).toContain("PREVIOUSLY");
    await fire("GENERATION_STARTED", type, {}, false);
    expect(mockPrompts[AWAY]).toBeUndefined();
    expect(mockPrompts[PREVIOUSLY]).toBeUndefined();
    await fire("GENERATION_ENDED", 3);
    expect(mockPrompts[AWAY]).toBe("Arin is not here.");
    expect(mockPrompts[PREVIOUSLY]).toContain("PREVIOUSLY");
  });

  it("control: a nested loud run keeps both, and the outer run's end clears both", async () => {
    await fire("GENERATION_STARTED", "normal", {}, false);
    await fire("GENERATION_STARTED", "continue", {}, false);
    expect(Object.keys(mockPrompts).sort()).toEqual([AWAY, PREVIOUSLY].sort());
    await fire("GENERATION_ENDED", 3);
    await fire("GENERATION_ENDED", 3);
    expect(mockPrompts[AWAY]).toBeUndefined();
    expect(mockPrompts[PREVIOUSLY]).toBeUndefined();
  });
});
