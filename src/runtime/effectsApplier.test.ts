import type { Checkpoint, NormalizedStoryV2 } from "@engine/index";
import { parseStoryV2OrThrow } from "@engine/validate";
import { applyBackground, applyCharacterAN, clearCharacterAN, disableWIEntry, enableWIEntry, executeSlashCommands } from "@services/STAPI";
import { EffectsApplier } from "./effectsApplier";
import type { RuntimeExtras, RuntimeSnapshot } from "./types";

const mockContext = { chat: [{ mes: "one" }, { mes: "two" }] };

jest.mock("@services/STAPI", () => ({
  getContext: () => mockContext,
  executeSlashCommands: jest.fn(async () => undefined),
  setGroupMembersDisabled: jest.fn(async () => undefined),
  applyCharacterAN: jest.fn(async () => undefined),
  clearCharacterAN: jest.fn(async () => undefined),
  applyTextGenPresetRuntime: jest.fn(),
  findTextGenPreset: jest.fn(() => null),
  disableWIEntry: jest.fn(async () => true),
  enableWIEntry: jest.fn(async () => true),
  lorebookExists: jest.fn((name: string) => name !== "Missing Book"),
  applyBackground: jest.fn(async () => ({ changed: true, from: "old.jpg", to: "tavern day.jpg" })),
}));

const makeExtras = (): RuntimeExtras => ({
  firedNpcReplies: {},
  lastSelfInjectionMessageId: null,
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
    const applier = new EffectsApplier();
    const checkpoint = checkpointWith([
      { trigger: "afterSpeak", member: "Mara", kind: "scripted", text: "Halt!", enabled: false },
      { trigger: "afterSpeak", member: "Finn", kind: "scripted", text: "Hm." },
    ]);
    await applier.fireNpcReplies(checkpoint, makeExtras(), "afterSpeak");
    expect(executeSlashCommands).toHaveBeenCalledTimes(1);
    expect((executeSlashCommands as jest.Mock).mock.calls[0][0]).toContain("Finn");
  });

  it("sends a scripted line with raw=false, so /sendas strips the quotes instead of posting them", async () => {
    const applier = new EffectsApplier();
    await applier.fireNpcReplies(checkpointWith([
      { trigger: "afterSpeak", member: "Finn", kind: "scripted", text: 'Halt | "who"\ngoes there?' },
    ]), makeExtras(), "afterSpeak");
    expect((executeSlashCommands as jest.Mock).mock.calls[0][0]).toBe('/sendas name="Finn" raw=false "Halt | \\"who\\"\ngoes there?"');
  });

  it("fires after_member replies only when the speaker matches an alias", async () => {
    const applier = new EffectsApplier();
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
    const applier = new EffectsApplier();
    const checkpoint = checkpointWith([
      { trigger: "onEnter", member: "Finn", kind: "scripted", text: "Enter.", after_member: "guard" },
    ]);
    await applier.fireNpcReplies(checkpoint, makeExtras(), "onEnter");
    expect(executeSlashCommands).toHaveBeenCalledTimes(1);
  });

  it("still enforces maxTriggers counters with after_member gating", async () => {
    const applier = new EffectsApplier();
    const checkpoint = checkpointWith([
      { trigger: "afterSpeak", member: "Finn", kind: "scripted", text: "Once.", after_member: "Mara" },
    ]);
    const extras = makeExtras();
    await applier.fireNpcReplies(checkpoint, extras, "afterSpeak", undefined, ["Mara"]);
    mockContext.chat = [...mockContext.chat, { mes: "three" }];
    await applier.fireNpcReplies(checkpoint, extras, "afterSpeak", undefined, ["Mara"]);
    expect(executeSlashCommands).toHaveBeenCalledTimes(1);
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
    const applier = new EffectsApplier();
    await applier.applyCheckpoint(story, withBackground({ name: "tavern day.jpg" }), readyExtras(), snapshot, "activate", []);
    await applier.applyCheckpoint(story, withBackground({ name: "tavern day.jpg" }), readyExtras(), snapshot, "hydrate", []);
    expect(applyBackground).toHaveBeenCalledTimes(2);
    expect(applyBackground).toHaveBeenCalledWith("tavern day.jpg");
  });

  it("leaves the background alone when the checkpoint says nothing about it", async () => {
    const applier = new EffectsApplier();
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
    const applier = new EffectsApplier();
    const note = { text: "[Whisper.]", position: "chat", depth: 2, interval: 3, role: "user" };
    await applier.applyCheckpoint(story, withAuthorNote(note), readyExtras(), snapshot, "activate", []);
    expect(applyCharacterAN).toHaveBeenCalledWith("[Whisper.]", { position: "chat", depth: 2, interval: 3, role: "user" });
  });

  it("re-applies the role on hydrate", async () => {
    const applier = new EffectsApplier();
    await applier.applyCheckpoint(story, withAuthorNote({ text: "Narrate.", role: "assistant" }), readyExtras(), snapshot, "hydrate", []);
    expect(applyCharacterAN).toHaveBeenCalledWith("Narrate.", expect.objectContaining({ role: "assistant" }));
  });

  it("drops an unknown role so the host default applies", async () => {
    const applier = new EffectsApplier();
    await applier.applyCheckpoint(story, withAuthorNote({ text: "Narrate.", role: "narrator" }), readyExtras(), snapshot, "activate", []);
    expect(applyCharacterAN).toHaveBeenCalledWith("Narrate.", expect.objectContaining({ role: undefined }));
  });

  it("a bare string note and a null note map to apply-with-defaults and clear", async () => {
    const applier = new EffectsApplier();
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
    await new EffectsApplier().applyCheckpoint(story, story.checkpointById.three, extras(true), snapshot, "hydrate", ["one", "two", "three"]);
    expect(calls(disableWIEntry)).toEqual([["Checkpoints", ["One"]]]);
    expect(calls(enableWIEntry)).toEqual([["Checkpoints", ["Two"]]]);
  });

  it("turns off entries a later checkpoint on the path has not reached yet, whatever the book says now", async () => {
    await new EffectsApplier().applyCheckpoint(story, story.checkpointById.one, extras(true), snapshot, "activate", ["one"]);
    expect(calls(disableWIEntry)).toEqual([["Checkpoints", ["Two"]]]);
    expect(calls(enableWIEntry)).toEqual([["Checkpoints", ["One"]]]);
  });

  it("never writes to a lorebook that does not exist, and leaves world info alone while requirements are unmet", async () => {
    const applier = new EffectsApplier();
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
    await new EffectsApplier().applyCheckpoint(story, story.checkpointById.three, ready, snapshot, "hydrate", ["one", "three"]);
    expect(ready.lastAppliedCheckpointId).toBe("three");
  });

  it("releases what leaving stories gate, minus what the incoming story gates, and only ever disables", async () => {
    await new EffectsApplier().releaseWorldInfo([other, story], story);
    expect(calls(disableWIEntry)).toEqual([["Other", ["Theirs"]]]);
    expect(enableWIEntry).not.toHaveBeenCalled();
  });
});
