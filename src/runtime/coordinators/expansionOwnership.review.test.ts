// v2.3 plan 11 §Fault matrix — expansion under a world switch.
//
// Found by the census, not by a journey. `ExpansionCoordinator.generate` awaits a model call that
// can run for minutes and then writes `this.entries[key]` and rebuilds the merged story through
// accessors that resolve to whatever chat is open *when the answer arrives*. Every other async
// writer in the runtime takes an ownership token (memory, extraction, scene, copilot, stagecraft,
// the judge ring, the effect ledger); this one did not, so a chain generated for chat A was filed
// into chat B's cache and merged into chat B's story.
//
// The store is modelled as one object per chat, which is the shape the bug needs: after the switch
// `getExpansion()` returns a DIFFERENT object, and a write that lands there is the defect.
//
// Owner: plan 11. Flips the `expansion|worldSwitched` row of `test/findings/faultMatrix.json`.

import { parseStoryV2OrThrow, type EngineState } from "@engine/index";
import type { ExpansionCacheEntry, ExpansionRuntimeState } from "@generation/index";
import type { RunContext, RunOwnership } from "./../runToken";
import { mintToken, tokenMatches } from "./../runToken";
import { ExpansionCoordinator } from "./expansionCoordinator";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getPlayerName: () => "Max",
  sendConnectionProfileRequest: jest.fn() }));

const story = parseStoryV2OrThrow({
  format: 2,
  id: "expansion-ownership",
  title: "Expansion ownership",
  description: "One stub off the active checkpoint.",
  qualities: [{ key: "done", type: "bool", source: "extractor", rubric: "Done?" }],
  checkpoints: [
    { id: "a", name: "A", objective: "Start.", type: "anchor", start: true },
    { id: "s0", name: "S0", objective: "Bridge.", type: "intermediate" },
    { id: "b", name: "B", objective: "End.", type: "anchor" },
  ],
  transitions: [
    { from: "a", to: "s0", priority: 1, gate: { q: "done", op: "==", v: true } },
    { from: "s0", to: "b", priority: 1, gate: { q: "done", op: "==", v: true } },
  ],
  roster: [],
});

const candidate = { sourceCheckpointId: "a", stubId: "s0", targetAnchorId: "b" };

function harness(options: { switchDuringGeneration: boolean; ownership?: boolean }) {
  // One store per chat, so a write that lands after the switch lands somewhere visible.
  const stores: Record<string, ExpansionRuntimeState> = {
    "chat-a": { entries: {}, scheduler: { queueDepth: 0, inFlight: false, lastError: null } },
    "chat-b": { entries: {}, scheduler: { queueDepth: 0, inFlight: false, lastError: null } },
  };
  const context: RunContext = { chatId: "chat-a", storyId: "expansion-ownership", playedVersion: 1, sessionEpoch: 1, windowRevision: 0 };
  const ownership: RunOwnership = { mint: (window) => mintToken(context, window), check: (token) => tokenMatches(context, token) };
  let persists = 0;
  const coordinator = new ExpansionCoordinator({
    getStory: () => story,
    getStoryRaw: () => ({}),
    getState: () => ({ activeCheckpointId: "a", blackboard: { values: {}, versions: {}, latched: {} } }) as unknown as EngineState,
    getExpansion: () => stores[String(context.chatId ?? "")],
    getSettings: () => ({ enabled: true, profileId: "p1", cadence: 3, reconciliationMultiplier: 1.5, stabilityLag: 0 }),
    getCanon: () => "",
    getFactTexts: () => [],
    replaceStory: () => undefined,
    setStatus: () => undefined,
    persist: async () => { persists += 1; },
    notify: () => undefined,
    ownership: options.ownership === false ? undefined : ownership,
  } as never);
  return {
    coordinator, stores, context, persists: () => persists,
    switchChat: () => { context.chatId = "chat-b"; context.sessionEpoch += 1; },
  };
}

describe("expansion generation is owned by the world it started in (plan 11)", () => {
  it("files a chain into the chat that asked for it", async () => {
    const env = harness({ switchDuringGeneration: false });
    await env.coordinator.generate(candidate as never);
    const entry: ExpansionCacheEntry | undefined = env.stores["chat-a"].entries["a->s0->b"];
    expect(entry).toBeDefined();
    expect(entry?.status).toBe("failed");
    expect(env.stores["chat-b"].entries).toEqual({});
  });

  it("writes nothing into the chat that replaced it, and persists nothing for it", async () => {
    const env = harness({ switchDuringGeneration: true });
    const pending = env.coordinator.generate(candidate as never);
    env.switchChat();
    await pending;
    expect(Object.keys(env.stores["chat-b"].entries)).toEqual([]);
    expect(env.persists()).toBe(0);
  });

  it("leaves its in-flight marker in its own chat, so a wedged stub is visible where it wedged", async () => {
    const env = harness({ switchDuringGeneration: true });
    const pending = env.coordinator.generate(candidate as never);
    env.switchChat();
    await pending;
    expect(env.stores["chat-a"].entries["a->s0->b"]?.status).toBe("generating");
  });

  // The negative control, and the reason the two above prove anything: an UNOWNED run never lapses,
  // so the same sequence writes the chain into the chat that replaced it. Take the token away and
  // the defect is back — which is what the census recorded before this landed.
  it("writes into the replacing chat when the run is given no ownership at all", async () => {
    const env = harness({ switchDuringGeneration: true, ownership: false });
    const pending = env.coordinator.generate(candidate as never);
    env.switchChat();
    await pending;
    expect(env.stores["chat-b"].entries["a->s0->b"]?.status).toBe("failed");
  });
});
