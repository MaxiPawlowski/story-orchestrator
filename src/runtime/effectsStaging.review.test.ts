const host = {
  chat: [{ mes: "hello" }] as unknown[],
  an: "",
  background: "start.jpg",
  calls: [] as string[],
};

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: host.chat, chatId: "chat-a", extensionSettings: {}, chatMetadata: {}, characters: [] }),
  applyBackground: async (name: string) => { host.calls.push(`bg:${name}`); host.background = name; return { ok: true, changed: true, from: "", to: name }; },
  applyCharacterAN: async (text: string) => { host.calls.push(`an:${text}`); host.an = text; return { ok: true, text }; },
  clearCharacterAN: async () => { host.calls.push("an:"); host.an = ""; return { ok: true, text: "" }; },
  samplerApi: () => "chat",
  readSamplerPreset: (name: string) => (name === "Cool" ? { temp_openai: 0.5 } : null),
  disableWIEntry: async (book: string, comments: string[]) => { host.calls.push(`wi-off:${book}:${comments.join(",")}`); return { ok: true, changed: true }; },
  enableWIEntry: async (book: string, comments: string[]) => { host.calls.push(`wi-on:${book}:${comments.join(",")}`); return { ok: true, changed: true }; },
  lorebookExists: () => true,
  executeSlashCommands: async (command: string) => { host.calls.push(`slash:${command}`); return { pipe: "" }; },
  getActiveGroup: () => ({ id: "g1", disabled_members: [] }),
  resolveGroupMemberId: (name: string) => name,
  setGroupMembersDisabled: async (enable: string[], disable: string[]) => { host.calls.push(`cast:+${enable.join(",")}-${disable.join(",")}`); return { ok: true, group: "g1" }; },
}));

import { parseStoryV2OrThrow, StoryEngine } from "@engine/index";
import { EffectsApplier } from "./effectsApplier";
import { samplerOverlay } from "./samplerOverlay";
import { stagedPath } from "./worldInfoGates";
import type { EffectLedgerRow, EffectTarget, RuntimeExtras } from "./types";
import { testOwnership } from "../../test/findings/testOwnership";

const story = parseStoryV2OrThrow({
  format: 2,
  id: "staging",
  title: "Staging",
  description: "",
  qualities: [{ key: "done", type: "bool", source: "extractor", rubric: "Done?" }],
  checkpoints: [
    {
      id: "hall", name: "Hall", objective: "", type: "anchor", start: true,
      effects: {
        background: "hall.jpg",
        author_note: "Rain on the roof.",
        preset: "Cool",
        cast_changes: { disable: ["Mara"] },
        npc_replies: [
          { trigger: "onEnter", member: "Narrator", kind: "scripted", text: "The hall opens.", new_chat_only: true },
          { trigger: "onEnter", member: "Mara", kind: "scripted", text: "Welcome." },
        ],
        world_info: { enable: [{ lorebook: "Book", comments: ["Hall"] }] },
      },
    },
    { id: "far", name: "Far", objective: "", type: "anchor" },
  ],
  transitions: [{ from: "hall", to: "far", priority: 1, gate: { q: "done", op: "==", v: true } }],
  roster: [{ id: "mara", name: "Mara" }],
});

const extrasFor = (ready: boolean) => ({
  requirements: { ready },
  firedNpcReplies: {},
  firedNpcRepliesAt: {},
  lastSelfInjectionMessageId: null,
  lastAppliedCheckpointId: null,
  updatedAt: "x",
  ui: { announceTransitions: false },
  effects: { ledger: [], cast: [] },
}) as unknown as RuntimeExtras;

const read = (target: EffectTarget): Record<string, unknown> | null =>
  target.kind === "an" ? { text: host.an } : target.kind === "background" ? { name: host.background } : null;

function applier() {
  const restored: EffectLedgerRow[] = [];
  const effects = new EffectsApplier(testOwnership(), {
    reads: { read },
    persist: async () => {},
    restore: async (row) => {
      restored.push(row);
      if (row.target.kind === "an") host.an = String(row.before?.text ?? "");
      if (row.target.kind === "background") host.background = String(row.before?.name ?? "");
      return true;
    },
  });
  return { effects, restored };
}

beforeEach(() => {
  host.chat = [];
  host.an = "";
  host.background = "start.jpg";
  host.calls = [];
  samplerOverlay.clear();
});

describe("v2.6 plan 04 C3: not-ready requirements still stage the presentation", () => {
  it("applies background, Author's Note and the preset overlay, and holds cast, replies and World Info", async () => {
    const extras = extrasFor(false);
    await applier().effects.applyCheckpoint(story, story.checkpointById.hall, extras, {} as never, "activate", ["hall"]);
    expect(host.calls).toEqual(["an:Rain on the roof.", "bg:hall.jpg"]);
    expect(samplerOverlay.view()).toMatchObject({ name: "Cool", checkpointId: "hall" });
    expect(extras.effects.ledger.map((row) => [row.effect, row.status])).toEqual([["author_note", "applied"], ["preset", "applied"], ["background", "applied"]]);
    expect(extras.firedNpcReplies).toEqual({});
    expect(extras.lastAppliedCheckpointId).toBeNull();
  });

  it("control: ready requirements apply every effect and mark the checkpoint applied", async () => {
    const extras = extrasFor(true);
    await applier().effects.applyCheckpoint(story, story.checkpointById.hall, extras, {} as never, "activate", ["hall"]);
    expect(host.calls).toEqual(expect.arrayContaining(["wi-on:Book:Hall", "cast:+-Mara", "bg:hall.jpg", "an:Rain on the roof."]));
    expect(host.calls.filter((call) => call.startsWith("slash:/sendas"))).toHaveLength(2);
    expect(extras.lastAppliedCheckpointId).toBe("hall");
  });
});

describe("v2.6 plan 04 C4: a jump releases the source's staging, then applies the target alone", () => {
  it("the staged path is the jump target on, and the whole path without a jump", () => {
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story);
    expect(stagedPath(engine.checkpointPath, engine.stateLog)).toEqual(["hall"]);
    engine.activateCheckpoint("far", { lastMessageId: 3, chatLength: 4 });
    expect(engine.checkpointPath).toEqual(["hall", "far"]);
    expect(stagedPath(engine.checkpointPath, engine.stateLog)).toEqual(["far"]);
  });

  it("a jump from a staged checkpoint to one with no note or background restores both, and switches the source's gated lore off", async () => {
    const { effects, restored } = applier();
    const extras = extrasFor(true);
    host.an = "Before the story.";
    await effects.applyCheckpoint(story, story.checkpointById.hall, extras, {} as never, "activate", ["hall"]);
    expect([host.an, host.background]).toEqual(["Rain on the roof.", "hall.jpg"]);
    host.calls = [];
    await effects.releaseStaging(story, extras, { stillOwns: () => true } as never);
    await effects.applyCheckpoint(story, story.checkpointById.far, extras, {} as never, "activate", ["far"]);
    expect([host.an, host.background]).toEqual(["Before the story.", "start.jpg"]);
    expect(restored.map((row) => row.target.kind).sort()).toEqual(["an", "background"]);
    expect(host.calls).toEqual(["wi-off:Book:Hall", "wi-off:Book:Hall"]);
    expect(host.calls.some((call) => call.startsWith("cast:"))).toBe(false);
  });

  it("control: without the release, the target inherits the source's note and background", async () => {
    const { effects } = applier();
    const extras = extrasFor(true);
    await effects.applyCheckpoint(story, story.checkpointById.hall, extras, {} as never, "activate", ["hall"]);
    await effects.applyCheckpoint(story, story.checkpointById.far, extras, {} as never, "activate", ["far"]);
    expect([host.an, host.background]).toEqual(["Rain on the roof.", "hall.jpg"]);
  });

  it("a note someone else changed since is left alone, and not-ready requirements leave World Info untouched", async () => {
    const { effects, restored } = applier();
    const extras = extrasFor(false);
    await effects.applyCheckpoint(story, story.checkpointById.hall, extras, {} as never, "activate", ["hall"]);
    host.an = "The player's own note.";
    host.calls = [];
    await effects.releaseStaging(story, extras, { stillOwns: () => true } as never);
    expect(host.an).toBe("The player's own note.");
    expect(restored.map((row) => row.target.kind)).toEqual(["background"]);
    expect(host.calls).toEqual([]);
  });
});
