import { testModel } from "../../../test/support/modelCallHost";
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
import { EXPANSION_CONTRACT, type ExpansionCacheEntry, type ExpansionRuntimeState } from "@generation/index";
import type { RunContext, RunOwnership } from "./../runToken";
import { mintToken, tokenMatches } from "./../runToken";
import { sanitizeExpansion } from "../extras";
import type { RuntimeExtras } from "../types";
import { ExpansionCoordinator } from "./expansionCoordinator";
import { testOwnership } from "../../../test/findings/testOwnership";

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

const candidate = { sourceCheckpointId: "a", stubId: "s0", targetAnchorId: "b", transition: story.outgoingByCheckpoint.a[0] };

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
    model: testModel("p1"),
    getCanon: () => "",
    getFactTexts: () => [],
    replaceStory: () => undefined,
    setStatus: () => undefined,
    persist: async () => { persists += 1; },
    notify: () => undefined,
    ownership: options.ownership === false ? testOwnership() : ownership,
  } as never);
  return {
    coordinator, stores, context, persists: () => persists,
    switchChat: () => { context.chatId = "chat-b"; context.sessionEpoch += 1; },
    returnToChatA: () => { context.chatId = "chat-a"; context.sessionEpoch += 1; },
  };
}

const scheduled = () => {
  const reasons: string[] = [];
  return { reasons, schedule: (reason: string) => { reasons.push(reason); } };
};

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

describe("v2.4 plan 03 D4: a queued or generating stub no live job holds is re-queueable", () => {
  it("a switched-away chain is re-queueable on return", async () => {
    const env = harness({ switchDuringGeneration: true });
    const pending = env.coordinator.generate(candidate as never);
    env.switchChat();
    await pending;
    env.returnToChatA();
    const queue = scheduled();
    expect(env.coordinator.scheduleForActive(queue.schedule)).toBe(true);
    expect(queue.reasons).toEqual(["expand:s0"]);
    expect(env.stores["chat-a"].entries["a->s0->b"]?.status).toBe("queued");
  });

  it("a stub queued before a switch, whose job the switch dropped, is re-queued on return", () => {
    const env = harness({ switchDuringGeneration: false });
    const queue = scheduled();
    expect(env.coordinator.scheduleForActive(queue.schedule)).toBe(true);
    env.switchChat();
    env.returnToChatA();
    expect(env.coordinator.scheduleForActive(queue.schedule)).toBe(true);
    expect(queue.reasons).toEqual(["expand:s0", "expand:s0"]);
  });

  it("control: a stub whose job is still queued is not queued twice", () => {
    const env = harness({ switchDuringGeneration: false });
    const queue = scheduled();
    expect(env.coordinator.scheduleForActive(queue.schedule)).toBe(true);
    expect(env.coordinator.scheduleForActive(queue.schedule)).toBe(false);
    expect(queue.reasons).toEqual(["expand:s0"]);
  });

  it("control: a stub whose generation is in flight is not queued beside it", async () => {
    const env = harness({ switchDuringGeneration: false });
    const pending = env.coordinator.generate(candidate as never);
    const queue = scheduled();
    expect(env.stores["chat-a"].entries["a->s0->b"]?.status).toBe("generating");
    expect(env.coordinator.scheduleForActive(queue.schedule)).toBe(false);
    await pending;
    expect(queue.reasons).toEqual([]);
  });

  it("a persisted generating entry is re-queueable on hydrate", () => {
    const persisted = (status: string, origin: "active" | "lookahead") => sanitizeExpansion({
      expansion: {
        entries: { "a->s0->b": { key: "a->s0->b", status, origin, contract: EXPANSION_CONTRACT, sourceCheckpointId: "a", stubId: "s0", targetAnchorId: "b", basis: {}, blackboardVersionSum: 0, beats: [], needsReview: false, verdicts: [], codeCheck: null, insertedCheckpointIds: [], lastError: null, attempts: 1, updatedAt: "t" } },
        scheduler: { queueDepth: 1, inFlight: true, lastError: null },
      },
    } as unknown as RuntimeExtras);
    expect(persisted("generating", "active").entries).toEqual({});
    expect(persisted("queued", "active").entries).toEqual({});
    expect(persisted("generating", "lookahead").entries["a->s0->b"]?.status).toBe("stale");
    expect(persisted("queued", "lookahead").entries["a->s0->b"]?.status).toBe("stale");
    expect(persisted("generating", "active").scheduler).toEqual({ queueDepth: 0, inFlight: false, lastError: null });

    const env = harness({ switchDuringGeneration: false });
    env.stores["chat-a"] = persisted("generating", "active");
    const queue = scheduled();
    expect(env.coordinator.scheduleForActive(queue.schedule)).toBe(true);
    expect(queue.reasons).toEqual(["expand:s0"]);
  });

  it("control: hydrate keeps a settled chain as it was saved", () => {
    const entry = { key: "a->s0->b", status: "failed", origin: "active", contract: EXPANSION_CONTRACT, sourceCheckpointId: "a", stubId: "s0", targetAnchorId: "b", basis: {}, blackboardVersionSum: 0, beats: [], needsReview: false, verdicts: [], codeCheck: null, insertedCheckpointIds: [], lastError: "x", attempts: 1, updatedAt: "t" };
    const hydrated = sanitizeExpansion({ expansion: { entries: { "a->s0->b": entry }, scheduler: { queueDepth: 0, inFlight: false, lastError: null } } } as unknown as RuntimeExtras);
    expect(hydrated.entries["a->s0->b"]).toEqual(entry);
  });
});
