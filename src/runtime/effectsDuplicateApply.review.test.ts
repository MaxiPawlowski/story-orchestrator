const host = {
  disabled: [] as string[],
  calls: [] as string[],
  gate: null as null | Promise<void>,
};

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ groupId: "g-test", chat: [], chatId: "chat-a", extensionSettings: {}, chatMetadata: {}, characters: [] }),
  applyBackground: async (name: string) => { host.calls.push(`bg:${name}`); return { ok: true, changed: true, from: "", to: name }; },
  applyCharacterAN: async (text: string) => ({ ok: true, text }),
  clearCharacterAN: async () => ({ ok: true, text: "" }),
  samplerApi: () => "chat",
  readSamplerPreset: () => null,
  disableWIEntry: async () => ({ ok: true, changed: true }),
  enableWIEntry: async () => ({ ok: true, changed: true }),
  lorebookExists: () => true,
  executeSlashCommands: async (command: string) => { host.calls.push(`slash:${command}`); return { pipe: "" }; },
  getActiveGroup: () => ({ id: "g1", disabled_members: [...host.disabled] }),
  resolveGroupMemberId: (name: string) => name,
  setGroupMembersDisabled: async (enable: string[], disable: string[]) => {
    host.calls.push(`cast:+${enable.join(",")}-${disable.join(",")}`);
    if (host.gate) await host.gate;
    host.disabled = [...host.disabled.filter((member) => !enable.includes(member)), ...disable];
    return { ok: true, group: "g1" };
  },
}));

import { parseStoryV2OrThrow } from "@engine/index";
import { EffectsApplier } from "./effectsApplier";
import type { RuntimeExtras } from "./types";
import { testOwnership } from "../../test/findings/testOwnership";
import { mintToken, type RunContext, type RunOwnership } from "./runToken";

const story = parseStoryV2OrThrow({
  format: 2, id: "saga", title: "Saga", description: "",
  qualities: [{ key: "done", type: "bool", source: "extractor", rubric: "Done?" }],
  checkpoints: [
    {
      id: "start", name: "Start", objective: "", type: "anchor", start: true,
      effects: {
        background: "start.jpg",
        cast_changes: { disable: ["Mara", "Finn", "Leila"] },
        npc_replies: [{ trigger: "onEnter", member: "Narrator", kind: "scripted", text: "It begins.", new_chat_only: true }],
      },
    },
    { id: "end", name: "End", objective: "", type: "anchor" },
  ],
  transitions: [{ from: "start", to: "end", priority: 1, gate: { q: "done", op: "==", v: true } }],
  roster: [],
});

const extras = () => ({
  requirements: { ready: true }, firedNpcReplies: {}, firedNpcRepliesAt: {}, lastSelfInjectionMessageId: null, lastAppliedCheckpointId: null,
  updatedAt: "x", ui: { announceTransitions: false }, effects: { ledger: [], cast: [] },
}) as unknown as RuntimeExtras;

const applier = (ownership: RunOwnership = testOwnership()) => new EffectsApplier(ownership, {
  reads: { read: (target) => (target.kind === "cast" ? { disabled: host.disabled.includes(target.member) } : null) },
  persist: async () => {},
  restore: async () => true,
});

beforeEach(() => {
  host.disabled = [];
  host.calls = [];
  host.gate = null;
});

describe("AS-10: an import's activate and a concurrent hydrate of the same checkpoint apply it once", () => {
  it("a hydrate asked while the activate is still writing the cast waits for it instead of writing again", async () => {
    let release: () => void = () => undefined;
    host.gate = new Promise<void>((resolve) => { release = resolve; });
    const effects = applier();
    const state = extras();
    const activate = effects.applyCheckpoint(story, story.checkpointById.start, state, {} as never, "activate", ["start"]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const hydrate = effects.applyCheckpoint(story, story.checkpointById.start, state, {} as never, "hydrate", ["start"]);
    release();
    host.gate = null;
    await Promise.all([activate, hydrate]);
    expect(host.calls.filter((call) => call.startsWith("cast:"))).toEqual(["cast:+-Mara", "cast:+-Finn", "cast:+-Leila"]);
    expect(state.effects.ledger.filter((row) => row.effect === "cast")).toHaveLength(3);
    expect(host.calls.filter((call) => call.startsWith("bg:"))).toEqual(["bg:start.jpg"]);
    expect(state.lastAppliedCheckpointId).toBe("start");
  });

  it("control: a hydrate after the activate settled still runs (idempotent, nothing to write for the cast)", async () => {
    const effects = applier();
    const state = extras();
    await effects.applyCheckpoint(story, story.checkpointById.start, state, {} as never, "activate", ["start"]);
    await effects.applyCheckpoint(story, story.checkpointById.start, state, {} as never, "hydrate", ["start"]);
    expect(host.calls.filter((call) => call.startsWith("cast:"))).toEqual(["cast:+-Mara", "cast:+-Finn", "cast:+-Leila"]);
    expect(host.calls.filter((call) => call.startsWith("bg:"))).toEqual(["bg:start.jpg", "bg:start.jpg"]);
  });
});

describe("v2.6 03 SP5: a hydrate never joins an activate that the same world change made lapse", () => {
  it("the epoch moves while the activate writes the cast: the hydrate applies the checkpoint itself", async () => {
    const world: RunContext = { chatId: "chat-a", storyId: "saga", storyHash: "h1", sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
    const ownership: RunOwnership = {
      mint: (window) => mintToken(world, window ?? null),
      check: (token) => (token.sessionEpoch === world.sessionEpoch ? { ok: true } : { ok: false, reason: "epoch", detail: "moved" }),
    };
    let release: () => void = () => undefined;
    host.gate = new Promise<void>((resolve) => { release = resolve; });
    const effects = applier(ownership);
    const state = extras();
    const activate = effects.applyCheckpoint(story, story.checkpointById.start, state, {} as never, "activate", ["start"]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    world.sessionEpoch = 2;
    host.gate = null;
    const hydrate = effects.applyCheckpoint(story, story.checkpointById.start, state, {} as never, "hydrate", ["start"]);
    release();
    await Promise.all([activate, hydrate]);
    expect(host.calls.filter((call) => call.startsWith("bg:"))).toEqual(["bg:start.jpg"]);
    expect(state.lastAppliedCheckpointId).toBe("start");
  });
});
