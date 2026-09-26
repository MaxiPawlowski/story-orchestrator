import type { Checkpoint, NormalizedStoryV2 } from "@engine/index";
import { parseStoryV2OrThrow } from "@engine/validate";
import { applyBackground, applyCharacterAN, clearCharacterAN, disableWIEntry, enableWIEntry, executeSlashCommands, setGroupMembersDisabled } from "@services/STAPI";
import { EffectsApplier, PENDING_NOT_SAVED } from "./effectsApplier";
import { setScanGatingActive } from "./worldInfoMode";
import type { RuntimeExtras, RuntimeSnapshot } from "./types";
import { testOwnership } from "../../test/findings/testOwnership";

const mockContext = { chat: [{ mes: "one" }, { mes: "two" }] };

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => mockContext,
  executeSlashCommands: jest.fn(async () => undefined),
  setGroupMembersDisabled: jest.fn(async () => undefined),
  applyCharacterAN: jest.fn(async (text: string) => ({ ok: true, text })),
  clearCharacterAN: jest.fn(async () => ({ ok: true, text: "" })),
  applyTextGenPresetRuntime: jest.fn(),
  findTextGenPreset: jest.fn(() => null),
  disableWIEntry: jest.fn(async () => ({ ok: true, changed: true })),
  enableWIEntry: jest.fn(async () => ({ ok: true, changed: true })),
  lorebookExists: jest.fn((name: string) => name !== "Missing Book"),
  applyBackground: jest.fn(async () => ({ ok: true, changed: true, from: "old.jpg", to: "tavern day.jpg" })),
  getActiveGroup: jest.fn(() => ({ id: "g1", disabled_members: [] })),
  resolveGroupMemberId: jest.fn((name: string) => (name === "Mara" ? "mara-chid" : null)),
}));

const makeExtras = (): RuntimeExtras => ({
  firedNpcReplies: {},
  lastSelfInjectionMessageId: null,
  effects: { ledger: [], cast: [] },
} as unknown as RuntimeExtras);

const checkpointWith = (replies: unknown[]): Checkpoint => ({
  id: "cp",
  name: "CP",
  objective: "",
  type: "anchor",
  effects: { npc_replies: replies },
}) as unknown as Checkpoint;

describe("fireNpcReplies v1 parity", () => {
  beforeEach(() => {
    (executeSlashCommands as jest.Mock).mockClear();
    mockContext.chat = [{ mes: "one" }, { mes: "two" }];
  });

  it("skips replies with enabled false", async () => {
    const applier = new EffectsApplier(testOwnership());
    const checkpoint = checkpointWith([
      { trigger: "afterSpeak", member: "Mara", kind: "scripted", text: "Halt!", enabled: false },
      { trigger: "afterSpeak", member: "Finn", kind: "scripted", text: "Hm." },
    ]);
    await applier.fireNpcReplies(checkpoint, makeExtras(), "afterSpeak");
    expect(executeSlashCommands).toHaveBeenCalledTimes(1);
    expect((executeSlashCommands as jest.Mock).mock.calls[0][0]).toContain("Finn");
  });

  it("sends a scripted line with raw=false, so /sendas strips the quotes instead of posting them", async () => {
    const applier = new EffectsApplier(testOwnership());
    await applier.fireNpcReplies(checkpointWith([
      { trigger: "afterSpeak", member: "Finn", kind: "scripted", text: 'Halt | "who"\ngoes there?' },
    ]), makeExtras(), "afterSpeak");
    expect((executeSlashCommands as jest.Mock).mock.calls[0][0]).toBe('/sendas name="Finn" raw=false "Halt | \\"who\\"\ngoes there?"');
  });

  it("fires after_member replies only when the speaker matches an alias", async () => {
    const applier = new EffectsApplier(testOwnership());
    const checkpoint = checkpointWith([
      { trigger: "afterSpeak", member: "Finn", kind: "scripted", text: "After Mara.", after_member: "guard" },
    ]);
    const extras = makeExtras();
    await applier.fireNpcReplies(checkpoint, extras, "afterSpeak", undefined, ["Kael", "sage"]);
    expect(executeSlashCommands).not.toHaveBeenCalled();
    await applier.fireNpcReplies(checkpoint, extras, "afterSpeak", undefined, ["Mara", "GUARD"]);
    expect(executeSlashCommands).toHaveBeenCalledTimes(1);
  });

  it("ignores after_member outside afterSpeak", async () => {
    const applier = new EffectsApplier(testOwnership());
    const checkpoint = checkpointWith([
      { trigger: "onEnter", member: "Finn", kind: "scripted", text: "Enter.", after_member: "guard" },
    ]);
    await applier.fireNpcReplies(checkpoint, makeExtras(), "onEnter");
    expect(executeSlashCommands).toHaveBeenCalledTimes(1);
  });

  it("still enforces maxTriggers counters with after_member gating", async () => {
    const applier = new EffectsApplier(testOwnership());
    const checkpoint = checkpointWith([
      { trigger: "afterSpeak", member: "Finn", kind: "scripted", text: "Once.", after_member: "Mara" },
    ]);
    const extras = makeExtras();
    await applier.fireNpcReplies(checkpoint, extras, "afterSpeak", undefined, ["Mara"]);
    mockContext.chat = [...mockContext.chat, { mes: "three" }];
    await applier.fireNpcReplies(checkpoint, extras, "afterSpeak", undefined, ["Mara"]);
    expect(executeSlashCommands).toHaveBeenCalledTimes(1);
  });

  // plan 11 §Fault matrix (effects | duplicateCompletion). The same checkpoint can be applied twice
  // — a duplicate completion at one boundary, or a hydrate immediately after an activate — and the
  // one effect that SPEAKS must not speak twice. `maxTriggers` (default 1) is what makes that true,
  // and its key names the checkpoint, the trigger, the member and the reply's index, so a second
  // apply of the same checkpoint addresses the counter the first one incremented.
  it("fires a one-shot reply once when the same checkpoint is applied twice, and twice when it is asked to", async () => {
    const once = new EffectsApplier(testOwnership());
    const extras = makeExtras();
    const checkpoint = checkpointWith([{ trigger: "onEnter", member: "Mara", kind: "scripted", text: "Halt!" }]);
    await once.fireNpcReplies(checkpoint, extras, "onEnter");
    await once.fireNpcReplies(checkpoint, extras, "onEnter");
    expect(executeSlashCommands).toHaveBeenCalledTimes(1);
    expect(extras.firedNpcReplies).toEqual({ "cp:onEnter:Mara:0": 1 });

    // The counter is what stops it, not a coincidence: asking for two lets exactly two through.
    (executeSlashCommands as jest.Mock).mockClear();
    const twice = new EffectsApplier(testOwnership());
    const allowed = makeExtras();
    const repeated = checkpointWith([{ trigger: "onEnter", member: "Mara", kind: "scripted", text: "Halt!", maxTriggers: 2 }]);
    await twice.fireNpcReplies(repeated, allowed, "onEnter");
    await twice.fireNpcReplies(repeated, allowed, "onEnter");
    await twice.fireNpcReplies(repeated, allowed, "onEnter");
    expect(executeSlashCommands).toHaveBeenCalledTimes(2);
  });
});

describe("background effect", () => {
  const story = { title: "Fixture" } as unknown as NormalizedStoryV2;
  const snapshot = {} as unknown as RuntimeSnapshot;
  const readyExtras = () => ({ ...makeExtras(), requirements: { ready: true } } as unknown as RuntimeExtras);
  const withBackground = (background: unknown): Checkpoint =>
    ({ id: "cp", name: "CP", objective: "", type: "anchor", effects: background === undefined ? {} : { background } }) as unknown as Checkpoint;

  beforeEach(() => (applyBackground as jest.Mock).mockClear());

  it("switches the background when the checkpoint names one, on activate and on hydrate", async () => {
    const applier = new EffectsApplier(testOwnership());
    await applier.applyCheckpoint(story, withBackground({ name: "tavern day.jpg" }), readyExtras(), snapshot, "activate", []);
    await applier.applyCheckpoint(story, withBackground({ name: "tavern day.jpg" }), readyExtras(), snapshot, "hydrate", []);
    expect(applyBackground).toHaveBeenCalledTimes(2);
    expect(applyBackground).toHaveBeenCalledWith("tavern day.jpg");
  });

  it("leaves the background alone when the checkpoint says nothing about it", async () => {
    const applier = new EffectsApplier(testOwnership());
    await applier.applyCheckpoint(story, withBackground(undefined), readyExtras(), snapshot, "activate", []);
    expect(applyBackground).not.toHaveBeenCalled();
  });
});

describe("author note effect", () => {
  const story = { title: "Fixture" } as unknown as NormalizedStoryV2;
  const snapshot = {} as unknown as RuntimeSnapshot;
  const readyExtras = () => ({ ...makeExtras(), requirements: { ready: true } } as unknown as RuntimeExtras);
  const withAuthorNote = (author_note: unknown): Checkpoint =>
    ({ id: "cp", name: "CP", objective: "", type: "anchor", effects: { author_note } }) as unknown as Checkpoint;

  beforeEach(() => {
    (applyCharacterAN as jest.Mock).mockClear();
    (clearCharacterAN as jest.Mock).mockClear();
  });

  it("carries the authored role and placement through to the host", async () => {
    const applier = new EffectsApplier(testOwnership());
    const note = { text: "[Whisper.]", position: "chat", depth: 2, interval: 3, role: "user" };
    await applier.applyCheckpoint(story, withAuthorNote(note), readyExtras(), snapshot, "activate", []);
    expect(applyCharacterAN).toHaveBeenCalledWith("[Whisper.]", { position: "chat", depth: 2, interval: 3, role: "user" });
  });

  it("re-applies the role on hydrate", async () => {
    const applier = new EffectsApplier(testOwnership());
    await applier.applyCheckpoint(story, withAuthorNote({ text: "Narrate.", role: "assistant" }), readyExtras(), snapshot, "hydrate", []);
    expect(applyCharacterAN).toHaveBeenCalledWith("Narrate.", expect.objectContaining({ role: "assistant" }));
  });

  it("drops an unknown role so the host default applies", async () => {
    const applier = new EffectsApplier(testOwnership());
    await applier.applyCheckpoint(story, withAuthorNote({ text: "Narrate.", role: "narrator" }), readyExtras(), snapshot, "activate", []);
    expect(applyCharacterAN).toHaveBeenCalledWith("Narrate.", expect.objectContaining({ role: undefined }));
  });

  it("a bare string note and a null note map to apply-with-defaults and clear", async () => {
    const applier = new EffectsApplier(testOwnership());
    await applier.applyCheckpoint(story, withAuthorNote("Plain."), readyExtras(), snapshot, "activate", []);
    expect(applyCharacterAN).toHaveBeenCalledWith("Plain.");
    await applier.applyCheckpoint(story, withAuthorNote(null), readyExtras(), snapshot, "activate", []);
    expect(clearCharacterAN).toHaveBeenCalledTimes(1);
  });
});

describe("world_info effect", () => {
  const story = parseStoryV2OrThrow({
    format: 2,
    title: "Gated",
    description: "World info gate fixture.",
    qualities: [],
    checkpoints: [
      { id: "one", name: "One", objective: "One.", type: "anchor", start: true, effects: { world_info: { enable: [{ lorebook: "Checkpoints", comments: ["One"] }, { lorebook: "Missing Book", comments: ["Gone"] }] } } },
      { id: "two", name: "Two", objective: "Two.", type: "anchor", effects: { world_info: { enable: [{ lorebook: "Checkpoints", comments: ["Two"] }], disable: [{ lorebook: "Checkpoints", comments: ["One"] }] } } },
      { id: "three", name: "Three", objective: "Three.", type: "anchor" },
    ],
    transitions: [],
    roster: [],
  });
  const other = { checkpoints: [{ effects: { world_info: { enable: [{ lorebook: "Other", comments: ["Theirs"] }, { lorebook: "Checkpoints", comments: ["Two"] }] } } }] };
  const snapshot = {} as unknown as RuntimeSnapshot;
  const extras = (ready: boolean) => ({ ...makeExtras(), requirements: { ready } } as unknown as RuntimeExtras);
  const calls = (mock: unknown) => (mock as jest.Mock).mock.calls;

  beforeEach(() => {
    (disableWIEntry as jest.Mock).mockClear();
    (enableWIEntry as jest.Mock).mockClear();
  });

  it("rebuilds the whole gated set from the path, not just the active checkpoint's own switches", async () => {
    await new EffectsApplier(testOwnership()).applyCheckpoint(story, story.checkpointById.three, extras(true), snapshot, "hydrate", ["one", "two", "three"]);
    expect(calls(disableWIEntry)).toEqual([["Checkpoints", ["One"]]]);
    expect(calls(enableWIEntry)).toEqual([["Checkpoints", ["Two"]]]);
  });

  it("turns off entries a later checkpoint on the path has not reached yet, whatever the book says now", async () => {
    await new EffectsApplier(testOwnership()).applyCheckpoint(story, story.checkpointById.one, extras(true), snapshot, "activate", ["one"]);
    expect(calls(disableWIEntry)).toEqual([["Checkpoints", ["Two"]]]);
    expect(calls(enableWIEntry)).toEqual([["Checkpoints", ["One"]]]);
  });

  it("never writes to a lorebook that does not exist, and leaves world info alone while requirements are unmet", async () => {
    const applier = new EffectsApplier(testOwnership());
    await applier.applyCheckpoint(story, story.checkpointById.one, extras(true), snapshot, "activate", ["one"]);
    expect([...calls(disableWIEntry), ...calls(enableWIEntry)].some(([lorebook]) => lorebook === "Missing Book")).toBe(false);
    (disableWIEntry as jest.Mock).mockClear();
    (enableWIEntry as jest.Mock).mockClear();
    await applier.applyCheckpoint(story, story.checkpointById.two, extras(false), snapshot, "activate", ["one", "two"]);
    expect(disableWIEntry).not.toHaveBeenCalled();
    expect(enableWIEntry).not.toHaveBeenCalled();
  });

  it("marks a checkpoint without effects as applied, so its world info is not rebuilt at every boundary", async () => {
    const ready = extras(true);
    await new EffectsApplier(testOwnership()).applyCheckpoint(story, story.checkpointById.three, ready, snapshot, "hydrate", ["one", "three"]);
    expect(ready.lastAppliedCheckpointId).toBe("three");
  });

  it("releases what leaving stories gate, minus what the incoming story gates, and only ever disables", async () => {
    await new EffectsApplier(testOwnership()).releaseWorldInfo([other, story], story);
    expect(calls(disableWIEntry)).toEqual([["Other", ["Theirs"]]]);
    expect(enableWIEntry).not.toHaveBeenCalled();
  });

  // V17: both toggles' answers were discarded, so a lost lorebook write read as an applied checkpoint.
  it("journals a toggle the host refused, carries on with the rest, and journals nothing when both land", async () => {
    const journalled: Array<[string, string | undefined]> = [];
    const applier = new EffectsApplier(testOwnership(), { journal: (summary, note) => { journalled.push([summary, note]); } });
    (disableWIEntry as jest.Mock).mockResolvedValueOnce({ ok: false, reason: "the server still holds the old flag" });
    await applier.applyCheckpoint(story, story.checkpointById.three, extras(true), snapshot, "hydrate", ["one", "two", "three"]);
    expect(calls(enableWIEntry)).toEqual([["Checkpoints", ["Two"]]]);
    expect(journalled).toEqual([["world_info effect could not be applied", "the server still holds the old flag"]]);
    journalled.length = 0;
    await applier.applyCheckpoint(story, story.checkpointById.three, extras(true), snapshot, "hydrate", ["one", "two", "three"]);
    expect(journalled).toEqual([]);
  });

  it("journals a refused enable as surely as a refused disable (v2.4 plan 05)", async () => {
    const journalled: Array<[string, string | undefined]> = [];
    (enableWIEntry as jest.Mock).mockResolvedValueOnce({ ok: false, reason: "\"Checkpoints\" could not be saved" });
    await new EffectsApplier(testOwnership(), { journal: (summary, note) => { journalled.push([summary, note]); } }).applyCheckpoint(story, story.checkpointById.three, extras(true), snapshot, "hydrate", ["one", "two", "three"]);
    expect(journalled).toEqual([["world_info effect could not be applied", "\"Checkpoints\" could not be saved"]]);
  });

  it("retries a refused flip at the next apply, because every apply rebuilds the whole gated set (v2.4 plan 05)", async () => {
    const applier = new EffectsApplier(testOwnership(), { journal: () => undefined });
    (disableWIEntry as jest.Mock).mockResolvedValueOnce({ ok: false, reason: "the server still holds the old flag" });
    await applier.applyCheckpoint(story, story.checkpointById.three, extras(true), snapshot, "hydrate", ["one", "two", "three"]);
    (disableWIEntry as jest.Mock).mockClear();
    await applier.applyCheckpoint(story, story.checkpointById.three, extras(true), snapshot, "activate", ["one", "two", "three"]);
    expect(calls(disableWIEntry)).toEqual([["Checkpoints", ["One"]]]);
  });

  it("under scan-time gating (T13 spike) neither the path replay nor the release writes a lorebook; off again, both do", async () => {
    setScanGatingActive(true);
    try {
      await new EffectsApplier(testOwnership()).applyCheckpoint(story, story.checkpointById.three, extras(true), snapshot, "hydrate", ["one", "two", "three"]);
      await new EffectsApplier(testOwnership()).releaseWorldInfo([other, story], story);
      expect(disableWIEntry).not.toHaveBeenCalled();
      expect(enableWIEntry).not.toHaveBeenCalled();
    } finally {
      setScanGatingActive(false);
    }
    await new EffectsApplier(testOwnership()).applyCheckpoint(story, story.checkpointById.three, extras(true), snapshot, "hydrate", ["one", "two", "three"]);
    await new EffectsApplier(testOwnership()).releaseWorldInfo([other, story], story);
    expect(calls(disableWIEntry)).toEqual([["Checkpoints", ["One"]], ["Other", ["Theirs"]]]);
  });

  it("journals a release the host refused", async () => {
    const journalled: string[] = [];
    (disableWIEntry as jest.Mock).mockResolvedValueOnce({ ok: false, reason: "refused" });
    await new EffectsApplier(testOwnership(), { journal: (summary) => { journalled.push(summary); } }).releaseWorldInfo([other, story], story);
    expect(journalled).toEqual(["world_info could not be released"]);
  });
});

// v2.3 plan 11 §Fault matrix (effects | persistFailure) — the one cell that was still unproven.
// `withLedger` records a `pending` row BEFORE the host call so a write that landed can still be
// known to have landed after a crash. `persist()` cannot tell us the row got there: it resolves
// either way, because `saveMetadata` swallows its own errors. So the applier asks the save-evidence
// reading instead, and a row that exists only in memory refuses the host write rather than producing
// an effect with no durable record. `setGroupMembersDisabled` is the host write here.
describe("the write-ahead record gates the effect (plan 11)", () => {
  const story = { title: "Fixture" } as unknown as NormalizedStoryV2;
  const snapshot = {} as unknown as RuntimeSnapshot;
  const castCheckpoint = (): Checkpoint => ({ id: "cp", name: "CP", objective: "", type: "anchor", effects: { cast_changes: { disable: ["Mara"] } } }) as unknown as Checkpoint;
  const castExtras = () => ({ ...makeExtras(), requirements: { ready: true }, effects: { ledger: [], cast: [] } } as unknown as RuntimeExtras);

  beforeEach(() => {
    (setGroupMembersDisabled as jest.Mock).mockClear();
    (setGroupMembersDisabled as jest.Mock).mockResolvedValue({ ok: true });
  });

  it("applies the cast change when the pending row is saved", async () => {
    const extras = castExtras();
    await new EffectsApplier(testOwnership(), { persist: async () => undefined, unsaved: () => false }).applyCheckpoint(story, castCheckpoint(), extras, snapshot, "activate", []);
    expect(setGroupMembersDisabled).toHaveBeenCalledTimes(1);
    expect(extras.effects.ledger.map((row) => row.status)).toEqual(["applied"]);
  });

  it("refuses it, and says why, when the pending row is still unsaved", async () => {
    const extras = castExtras();
    const journalled: string[] = [];
    await new EffectsApplier(testOwnership(), { persist: async () => undefined, unsaved: () => true, journal: (summary) => { journalled.push(summary); } }).applyCheckpoint(story, castCheckpoint(), extras, snapshot, "activate", []);
    expect(setGroupMembersDisabled).not.toHaveBeenCalled();
    expect(extras.effects.ledger.map((row) => row.status)).toEqual(["failed"]);
    expect(extras.effects.ledger[0].reason).toBe(PENDING_NOT_SAVED);
    expect(journalled).toEqual(["cast effect was not applied"]);
  });
});

describe("transition announcement leaves a trace when it is not posted (L2 J1.7)", () => {
  const checkpoint = { id: "cp2", name: "Accept the Mission", objective: "Take it.", type: "anchor" } as unknown as Checkpoint;
  const announcing = () => ({ ...makeExtras(), ui: { announceTransitions: true } } as unknown as RuntimeExtras);

  beforeEach(() => (executeSlashCommands as jest.Mock).mockReset());

  it("journals a refused /comment", async () => {
    (executeSlashCommands as jest.Mock).mockResolvedValueOnce(false);
    const journal = jest.fn();
    await new EffectsApplier(testOwnership(), { journal }).announceTransition(checkpoint, announcing());
    expect(journal).toHaveBeenCalledWith('transition to "Accept the Mission" was not announced', "the /comment that posts the note was refused");
  });

  it("journals a transition it did not post because another chat is open", async () => {
    const journal = jest.fn();
    await new EffectsApplier(testOwnership(), { journal }).announceTransition(checkpoint, announcing(), false);
    expect(executeSlashCommands).not.toHaveBeenCalled();
    expect(journal).toHaveBeenCalledWith('transition to "Accept the Mission" was not announced', "the open chat is not the chat this boundary belongs to");
  });

  it("control: a posted announcement journals nothing", async () => {
    (executeSlashCommands as jest.Mock).mockResolvedValueOnce(true);
    const journal = jest.fn();
    await new EffectsApplier(testOwnership(), { journal }).announceTransition(checkpoint, announcing());
    expect(executeSlashCommands).toHaveBeenCalledWith(expect.stringContaining("Accept the Mission"), { silent: true });
    expect(journal).not.toHaveBeenCalled();
  });
});
