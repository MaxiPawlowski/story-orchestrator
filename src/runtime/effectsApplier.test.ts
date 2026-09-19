import type { Checkpoint, NormalizedStoryV2 } from "@engine/index";
import { applyBackground, applyCharacterAN, clearCharacterAN, executeSlashCommands } from "@services/STAPI";
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
  disableWIEntry: jest.fn(async () => undefined),
  enableWIEntry: jest.fn(async () => undefined),
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
    await applier.applyCheckpoint(story, withBackground({ name: "tavern day.jpg" }), readyExtras(), snapshot, "activate");
    await applier.applyCheckpoint(story, withBackground({ name: "tavern day.jpg" }), readyExtras(), snapshot, "hydrate");
    expect(applyBackground).toHaveBeenCalledTimes(2);
    expect(applyBackground).toHaveBeenCalledWith("tavern day.jpg");
  });

  it("leaves the background alone when the checkpoint says nothing about it", async () => {
    const applier = new EffectsApplier();
    await applier.applyCheckpoint(story, withBackground(undefined), readyExtras(), snapshot, "activate");
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
    await applier.applyCheckpoint(story, withAuthorNote(note), readyExtras(), snapshot, "activate");
    expect(applyCharacterAN).toHaveBeenCalledWith("[Whisper.]", { position: "chat", depth: 2, interval: 3, role: "user" });
  });

  it("re-applies the role on hydrate", async () => {
    const applier = new EffectsApplier();
    await applier.applyCheckpoint(story, withAuthorNote({ text: "Narrate.", role: "assistant" }), readyExtras(), snapshot, "hydrate");
    expect(applyCharacterAN).toHaveBeenCalledWith("Narrate.", expect.objectContaining({ role: "assistant" }));
  });

  it("drops an unknown role so the host default applies", async () => {
    const applier = new EffectsApplier();
    await applier.applyCheckpoint(story, withAuthorNote({ text: "Narrate.", role: "narrator" }), readyExtras(), snapshot, "activate");
    expect(applyCharacterAN).toHaveBeenCalledWith("Narrate.", expect.objectContaining({ role: undefined }));
  });

  it("a bare string note and a null note map to apply-with-defaults and clear", async () => {
    const applier = new EffectsApplier();
    await applier.applyCheckpoint(story, withAuthorNote("Plain."), readyExtras(), snapshot, "activate");
    expect(applyCharacterAN).toHaveBeenCalledWith("Plain.");
    await applier.applyCheckpoint(story, withAuthorNote(null), readyExtras(), snapshot, "activate");
    expect(clearCharacterAN).toHaveBeenCalledTimes(1);
  });
});
