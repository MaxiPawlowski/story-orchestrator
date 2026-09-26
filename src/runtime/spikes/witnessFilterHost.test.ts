import { startWitnessFilter, type WitnessFilterDeps } from "./witnessFilterHost";
import { IGNORE } from "./witnessFilter";
import { defaultGlobalSettings, sanitizeGlobalSettings } from "../settingsModel";

const mockHost = { handlers: new Map<string, (...args: unknown[]) => unknown>() };

jest.mock("@services/STAPI", () => ({
  subscribeToHostEvents: (entries: Array<{ eventName: string; handler: (...args: unknown[]) => unknown }>) => {
    for (const entry of entries) mockHost.handlers.set(entry.eventName, entry.handler);
    return () => mockHost.handlers.clear();
  },
}));

const row = (name: string, isUser = false) => ({ name, is_user: isUser, mes: `${name} speaks`, extra: {} as Record<PropertyKey, unknown> });

const setup = (overrides: Partial<WitnessFilterDeps> = {}) => {
  const chat = [row("DM Narrator"), row("You", true), row("Arin"), row("You", true)];
  const state = { enabled: ["DM Narrator", "Arin", "Ponticius"], drafted: "Ponticius" as string | null, group: true };
  const filter = startWitnessFilter({
    enabledNames: () => state.enabled,
    drafted: () => state.drafted,
    chat: () => chat,
    isGroup: () => state.group,
    now: () => 0,
    ...overrides,
  });
  return { chat, state, filter };
};

const hidden = (core: unknown[]) => core.map((entry) => Boolean((entry as { extra: Record<PropertyKey, unknown> }).extra[IGNORE]));

describe("SP9 witness filter host", () => {
  afterEach(() => mockHost.handlers.clear());

  it("records presence when ST posts or renders a message, and hides from the drafted member what it did not witness", () => {
    const { chat, state, filter } = setup();
    mockHost.handlers.get("CHARACTER_MESSAGE_RENDERED")?.(0);
    state.enabled = ["DM Narrator", "Arin"];
    mockHost.handlers.get("MESSAGE_SENT")?.(1);
    mockHost.handlers.get("MESSAGE_RECEIVED")?.(2);
    const core = chat.map((entry) => ({ ...entry }));
    filter.intercept(core, "normal");
    expect(hidden(core)).toEqual([false, true, true, false]);
    expect(chat.every((entry) => Object.getOwnPropertySymbols(entry.extra).length === 0)).toBe(true);
    expect(globalThis.storyOrchestratorWitness?.export().map((entry) => entry.presence))
      .toEqual([["DM Narrator", "Arin", "Ponticius"], ["DM Narrator", "Arin"], ["DM Narrator", "Arin"], null]);
    filter.dispose();
  });

  it("authored sets from the dev handle win, and clearing them falls back to presence", () => {
    const { chat, filter } = setup();
    for (const id of [0, 1, 2, 3]) mockHost.handlers.get("MESSAGE_RECEIVED")?.(id);
    expect(globalThis.storyOrchestratorWitness?.setAuthored({ 2: ["Arin"], 9: ["Arin"] })).toBe(1);
    const authored = chat.map((entry) => ({ ...entry }));
    filter.intercept(authored, "normal");
    expect(hidden(authored)).toEqual([false, false, true, false]);
    globalThis.storyOrchestratorWitness?.clearAuthored();
    const cleared = chat.map((entry) => ({ ...entry }));
    filter.intercept(cleared, "normal");
    expect(hidden(cleared)).toEqual([false, false, false, false]);
    expect(globalThis.storyOrchestratorWitness?.timings()).toHaveLength(2);
    filter.dispose();
    expect(globalThis.storyOrchestratorWitness).toBeUndefined();
  });

  it("leaves quiet, impersonate, solo and undrafted generations alone, and keeps a continued message", () => {
    const { chat, state, filter } = setup();
    state.enabled = ["Arin"];
    for (const id of [0, 1, 2, 3]) mockHost.handlers.get("MESSAGE_RECEIVED")?.(id);
    for (const type of ["quiet", "impersonate"]) {
      const core = chat.map((entry) => ({ ...entry }));
      filter.intercept(core, type);
      expect(hidden(core)).toEqual([false, false, false, false]);
    }
    const continued = chat.map((entry) => ({ ...entry }));
    filter.intercept(continued, "continue");
    expect(hidden(continued)).toEqual([true, true, true, false]);
    state.group = false;
    const solo = chat.map((entry) => ({ ...entry }));
    filter.intercept(solo, "normal");
    expect(hidden(solo)).toEqual([false, false, false, false]);
    state.group = true;
    state.drafted = null;
    const undrafted = chat.map((entry) => ({ ...entry }));
    filter.intercept(undrafted, "normal");
    expect(hidden(undrafted)).toEqual([false, false, false, false]);
    filter.dispose();
  });

  it("the flag is install-wide, off by default, and only a literal true turns it on", () => {
    expect(defaultGlobalSettings().spikes.witnessFilter).toBe(false);
    expect(Object.values(defaultGlobalSettings().spikes).every((flag) => flag === false)).toBe(true);
    expect(sanitizeGlobalSettings({ spikes: { witnessFilter: "yes" } }).spikes.witnessFilter).toBe(false);
    expect(sanitizeGlobalSettings({ spikes: { witnessFilter: true } }).spikes.witnessFilter).toBe(true);
    expect(sanitizeGlobalSettings({}).spikes.witnessFilter).toBe(false);
  });
});
