// v2.4 plan 02 §8 (H18): a persona switch to the persona a story requires used to leave it not-ready
// until the next turn, because requirements were re-read only at commit, activate, load and rollback.
// This drives the manager's own `requirementsHost` (the refresh the watch calls), so the before/after
// reading and the hydrate apply are the manager's real ones, not a replica.

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => globalThis.__requirementsTestContext,
  listGroupMembers: () => [],
  listGlobalLorebooks: () => [],
}));

import { RuntimeManager } from "./runtimeManager";
import { refreshRequirementsNow } from "./requirementsWatch";

declare global {
  // eslint-disable-next-line no-var
  var __requirementsTestContext: { chatId: string; name1: string; chat: unknown[]; chatMetadata: Record<string, unknown>; extensionSettings: Record<string, unknown> };
}

interface Probe {
  loaded: unknown;
  engine: { activeCheckpoint: { id: string }; checkpointPath: string[]; serialize: () => unknown };
  extras: { requirements: { ready: boolean }; lastAppliedCheckpointId: string | null };
  effects: { applyCheckpoint: jest.Mock; restoreFor: jest.Mock };
  getSnapshot: () => unknown;
  persist: jest.Mock;
}

function loadedManager(persona: string, lastApplied: string | null) {
  globalThis.__requirementsTestContext = { chatId: "chat-a", name1: persona, chat: [], chatMetadata: {}, extensionSettings: {} };
  const manager = new RuntimeManager();
  const probe = manager as unknown as Probe;
  probe.loaded = { record: { id: "s1", version: 1, hash: "h", raw: {} }, story: { title: "S", requirements: { personas: ["Mira"] } } };
  probe.engine = { activeCheckpoint: { id: "start" }, checkpointPath: ["start"], serialize: () => ({ boundary: 1, lastMessageId: 0 }) };
  probe.extras.requirements = { ready: persona === "Mira" };
  probe.extras.lastAppliedCheckpointId = lastApplied;
  probe.effects.applyCheckpoint = jest.fn(async () => undefined);
  probe.effects.restoreFor = jest.fn(async () => ({ reverted: 0, refused: 0 }));
  probe.getSnapshot = () => ({});
  probe.persist = jest.fn(async () => undefined);
  return { manager, probe };
}

describe("v2.4 plan 02 §8: the manager's requirements host", () => {
  it("switching to the required persona reads not-ready -> ready and applies the owed checkpoint in hydrate mode", async () => {
    const { manager, probe } = loadedManager("Traveller", null);
    globalThis.__requirementsTestContext.name1 = "Mira";
    expect(await refreshRequirementsNow(manager.requirementsHost)).toBe("hydrated");
    expect(probe.extras.requirements.ready).toBe(true);
    expect(probe.effects.applyCheckpoint).toHaveBeenCalledTimes(1);
    expect(probe.effects.applyCheckpoint.mock.calls[0]?.[4]).toBe("hydrate");
    expect(probe.persist).toHaveBeenCalledTimes(1);
  });

  it("control: a checkpoint already applied in this chat is not applied again", async () => {
    const { manager, probe } = loadedManager("Traveller", "start");
    globalThis.__requirementsTestContext.name1 = "Mira";
    expect(await refreshRequirementsNow(manager.requirementsHost)).toBe("refreshed");
    expect(probe.effects.applyCheckpoint).not.toHaveBeenCalled();
  });

  it("switching away from the required persona restores nothing and saves nothing", async () => {
    const { manager, probe } = loadedManager("Mira", "start");
    globalThis.__requirementsTestContext.name1 = "Traveller";
    expect(await refreshRequirementsNow(manager.requirementsHost)).toBe("refreshed");
    expect(probe.extras.requirements.ready).toBe(false);
    expect(probe.effects.applyCheckpoint).not.toHaveBeenCalled();
    expect(probe.effects.restoreFor).not.toHaveBeenCalled();
    expect(probe.persist).not.toHaveBeenCalled();
  });
});
