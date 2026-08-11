import type { Checkpoint } from "@engine/index";
import { executeSlashCommands } from "@services/STAPI";
import { EffectsApplier } from "./effectsApplier";
import type { RuntimeExtras } from "./types";

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
