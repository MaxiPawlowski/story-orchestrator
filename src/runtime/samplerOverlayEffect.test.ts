const host = {
  chatId: "chat-a",
  api: "chat" as "textgen" | "chat" | null,
  presets: { "Artemis Cool": { temp_openai: 0.55, top_p_openai: 0.9, openai_max_tokens: 400, stream_openai: true } } as Record<string, Record<string, unknown>>,
  textCompletionSettings: { preset: "Mine", temp: 1 } as Record<string, unknown>,
  slash: [] as string[],
};

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ groupId: "g-test", chat: [], chatId: host.chatId, extensionSettings: {}, chatMetadata: {}, characters: [], textCompletionSettings: host.textCompletionSettings }),
  applyBackground: async (name: string) => ({ ok: true, changed: true, from: "", to: name }),
  applyCharacterAN: async (text: string) => ({ ok: true, text }),
  clearCharacterAN: async () => ({ ok: true, text: "" }),
  samplerApi: () => host.api,
  readSamplerPreset: (name: string) => host.presets[name] ?? null,
  disableWIEntry: async () => ({ ok: true, changed: true }),
  enableWIEntry: async () => ({ ok: true, changed: true }),
  lorebookExists: async () => true,
  executeSlashCommands: async (command: string) => { host.slash.push(command); return { pipe: "" }; },
  getActiveGroup: () => null,
  resolveGroupMemberId: (name: string) => name,
  setGroupMembersDisabled: async () => ({ ok: true, group: "g1" }),
}));

import { EffectsApplier, OVERLAY_UNSUPPORTED_REASON } from "./effectsApplier";
import { samplerOverlay } from "./samplerOverlay";
import type { RuntimeExtras } from "./types";
import { testOwnership } from "../../test/findings/testOwnership";

const story = { title: "S", checkpointById: {}, checkpoints: [] } as never;
const extrasFor = () => ({
  requirements: { ready: true },
  firedNpcReplies: {},
  lastSelfInjectionMessageId: -1,
  lastAppliedCheckpointId: null,
  updatedAt: "x",
  settings: {},
  effects: { ledger: [], cast: [] },
}) as unknown as RuntimeExtras;

function harness() {
  const notes: Array<[string, string | undefined]> = [];
  const applier = new EffectsApplier(testOwnership(), { journal: (summary, note) => { notes.push([summary, note]); }, persist: async () => {} });
  return { applier, notes };
}

const withPreset = (preset: unknown, id = "cp-1") => ({ id, effects: { preset } }) as never;
const loud = { api: "chat" as const, chatId: "chat-a", type: null, dryRun: false, open: true, innermost: "normal" };

beforeEach(() => {
  host.chatId = "chat-a";
  host.api = "chat";
  host.slash.length = 0;
  host.textCompletionSettings = { preset: "Mine", temp: 1 };
  samplerOverlay.clear();
});

describe("v2.4 plan 06: a checkpoint preset is a per-request sampler overlay", () => {
  it("a Chat Completion connection takes a named preset: armed for this chat, the selected preset untouched, no slash command", async () => {
    const h = harness();
    const extras = extrasFor();
    await h.applier.applyCheckpoint(story, withPreset("Artemis Cool"), extras, {} as never, "activate", ["cp-1"]);
    expect(samplerOverlay.view()).toMatchObject({ chatId: "chat-a", checkpointId: "cp-1", name: "Artemis Cool", api: "chat", values: { temperature: 0.55, top_p: 0.9 } });
    expect(extras.effects.ledger).toEqual([expect.objectContaining({ effect: "preset", status: "applied", target: { kind: "preset", name: "Artemis Cool", api: "chat" }, before: null })]);
    expect(host.textCompletionSettings).toEqual({ preset: "Mine", temp: 1 });
    expect(host.slash).toEqual([]);
  });

  it("the settings a request cannot carry are named, not dropped silently", async () => {
    const h = harness();
    await h.applier.applyCheckpoint(story, withPreset("Artemis Cool"), extrasFor(), {} as never, "activate", ["cp-1"]);
    expect(samplerOverlay.view()?.unknown).toEqual(["openai_max_tokens", "stream_openai"]);
    expect(h.notes).toContainEqual(['2 setting(s) of "Artemis Cool" are not per-request samplers and are not sent', "openai_max_tokens, stream_openai"]);
  });

  it("the armed overlay reaches this chat's loud request, and only the keys the request already carries", () => {
    samplerOverlay.set({ chatId: "chat-a", checkpointId: "cp-1", name: "P", api: "chat", values: { temperature: 0.55, top_k: 40 }, unknown: [] });
    const payload: Record<string, unknown> = { temperature: 1, top_p: 1, messages: [] };
    expect(samplerOverlay.apply(payload, loud)).toEqual({ first: true, applied: ["temperature"], skipped: ["top_k"] });
    expect(payload).toEqual({ temperature: 0.55, top_p: 1, messages: [] });
  });

  it("a connection with neither hook refuses with a reason and arms nothing", async () => {
    const h = harness();
    host.api = null;
    const extras = extrasFor();
    await h.applier.applyCheckpoint(story, withPreset({ name: "Inline", settings: { temp: 0.7 } }), extras, {} as never, "activate", ["cp-1"]);
    expect(samplerOverlay.view()).toBeNull();
    expect(extras.effects.ledger[0]).toMatchObject({ status: "failed", reason: OVERLAY_UNSUPPORTED_REASON, target: { kind: "preset", name: "Inline", api: "none" } });
  });

  it("a named preset the connection's API does not have is refused, never fuzzy-matched", async () => {
    const h = harness();
    const extras = extrasFor();
    await h.applier.applyCheckpoint(story, withPreset("Artemis"), extras, {} as never, "activate", ["cp-1"]);
    expect(samplerOverlay.view()).toBeNull();
    expect(extras.effects.ledger[0]).toMatchObject({ status: "failed", reason: 'there is no Chat Completion preset named "Artemis"' });
  });

  it("a preset with no sampler the connection sends is refused", async () => {
    const h = harness();
    host.api = "textgen";
    const extras = extrasFor();
    await h.applier.applyCheckpoint(story, withPreset({ name: "Empty", settings: { temp_openai: 0.4, genamt: 300 } }), extras, {} as never, "activate", ["cp-1"]);
    expect(samplerOverlay.view()).toBeNull();
    expect(extras.effects.ledger[0]).toMatchObject({ status: "failed", reason: '"Empty" sets no sampler this connection sends' });
  });

  it("an inline preset on Text Completion maps its own keys", async () => {
    const h = harness();
    host.api = "textgen";
    await h.applier.applyCheckpoint(story, withPreset({ name: "Inline", settings: { temp: 0.7, rep_pen: 1.1 } }), extrasFor(), {} as never, "activate", ["cp-1"]);
    expect(samplerOverlay.view()?.values).toEqual({ temperature: 0.7, repetition_penalty: 1.1, rep_pen: 1.1, repeat_penalty: 1.1 });
  });

  it("a checkpoint without a preset disarms the previous checkpoint's overlay", async () => {
    const h = harness();
    const extras = extrasFor();
    await h.applier.applyCheckpoint(story, withPreset("Artemis Cool"), extras, {} as never, "activate", ["cp-1"]);
    await h.applier.applyCheckpoint(story, { id: "cp-2", effects: {} } as never, extras, {} as never, "activate", ["cp-1", "cp-2"]);
    expect(samplerOverlay.view()).toBeNull();
  });

  it("leaving the chat disarms it", async () => {
    const h = harness();
    const extras = extrasFor();
    await h.applier.applyCheckpoint(story, withPreset("Artemis Cool"), extras, {} as never, "activate", ["cp-1"]);
    host.chatId = "chat-b";
    await h.applier.restoreFor(extras, "leave");
    expect(samplerOverlay.view()).toBeNull();
  });

  it("control: an overlay armed in another chat never reaches this chat's request", () => {
    samplerOverlay.set({ chatId: "chat-b", checkpointId: "cp-1", name: "P", api: "chat", values: { temperature: 0.55 }, unknown: [] });
    const payload: Record<string, unknown> = { temperature: 1 };
    expect(samplerOverlay.apply(payload, loud)).toBeNull();
    expect(payload.temperature).toBe(1);
  });
});
