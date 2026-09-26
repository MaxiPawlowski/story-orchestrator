const world = { chatId: "chat-a", metadata: {} as Record<string, Record<string, unknown>> };

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  getContext: () => ({ chat: [], chatId: world.chatId, extensionSettings: {}, chatMetadata: world.metadata[world.chatId] ?? {}, characters: [] }),
  applyBackground: async () => ({ ok: true }),
  applyCharacterAN: async (text: string) => ({ ok: true, text }),
  clearCharacterAN: async () => ({ ok: true, text: "" }),
  samplerApi: () => "textgen",
  readSamplerPreset: () => null,
  disableWIEntry: async () => ({ ok: true, changed: true }),
  enableWIEntry: async () => ({ ok: true, changed: true }),
  lorebookExists: () => true,
  executeSlashCommands: async () => ({ pipe: "" }),
  getActiveGroup: () => null,
  resolveGroupMemberId: (name: string) => name,
  setGroupMembersDisabled: async () => ({ ok: true }),
  getCurrentBackground: () => ({ name: "" }),
  readGroupMemberDisabled: () => null,
  setGroupMemberDisabled: async () => ({ ok: true }),
}));

import { parseStoryV2OrThrow } from "@engine/index";
import { couldNot, wrote } from "@utils/writeResult";
import { EffectsApplier } from "../effectsApplier";
import { effectExtension, registerEffectExtension } from "../effectExtensions";
import { readEffectTarget, restoreEffectTarget } from "../effectHost";
import type { EffectLedgerRow, RuntimeExtras } from "../types";
import { testOwnership } from "../../../test/findings/testOwnership";
import { SP5_EXTENSION, competingCards, createScenarioExtension, lastOwnScenario, planScenario, scenarioForPath, storySetsScenario, type ScenarioHost } from "./sp5Scenario";

const ONE = "SO-SP5 scenario one: the party waits at the city gate.";
const THREE = "SO-SP5 scenario three: the party stands in the guild hall.";
const USER = "SO-SP5 user override: a quiet night at the inn.";

const storyWith = (effects: Record<string, Record<string, unknown>>) => {
  return parseStoryV2OrThrow({
    format: 2, id: "so-v25-sp5", version: 1, title: "SO-SP5 Scenario", description: "d",
    qualities: [{ key: "step", type: "int", source: "code", rubric: "Spike step." }],
    roster: [],
    checkpoints: ["gate", "road", "hall"].map((id, index) => ({ id, name: id, objective: "o", type: "anchor", ...(index === 0 ? { start: true } : {}), ...(effects[id] ? { effects: effects[id] } : {}) })),
    transitions: [
      { from: "gate", to: "road", priority: 1, gate: { q: "step", op: ">=", v: 1 } },
      { from: "road", to: "hall", priority: 1, gate: { q: "step", op: ">=", v: 2 } },
    ],
  });
};
const story = storyWith({ gate: { scenario: ONE }, hall: { scenario: THREE } });
const silent = storyWith({});

const cast = { members: [] as Array<{ name: string; scenario: string }> };
let enabled = true;
const host: ScenarioHost = {
  enabled: () => enabled,
  read: () => (world.chatId ? { chatId: world.chatId, text: String(world.metadata[world.chatId]?.scenario ?? "") } : null),
  write: (chatId, text) => {
    if (chatId !== world.chatId) return couldNot("not the open chat");
    const metadata = (world.metadata[chatId] ??= {});
    if (text) metadata.scenario = text;
    else delete metadata.scenario;
    return wrote({ chatId, text });
  },
  cast: () => cast.members,
};

const extrasFor = (): RuntimeExtras => ({
  requirements: { ready: true }, firedNpcReplies: {}, lastSelfInjectionMessageId: -1, lastAppliedCheckpointId: null, updatedAt: "x", settings: {}, effects: { ledger: [], cast: [] },
}) as unknown as RuntimeExtras;

const harness = () => {
  const notes: Array<{ summary: string; note?: string }> = [];
  const applier = new EffectsApplier(testOwnership(), { reads: { read: readEffectTarget }, restore: restoreEffectTarget, persist: async () => {}, journal: (summary, note) => { notes.push({ summary, note }); } });
  const apply = (extras: RuntimeExtras, path: string[], mode: "activate" | "hydrate" = "activate", which = story) =>
    applier.applyCheckpoint(which, which.checkpointById[path[path.length - 1]], extras, {} as never, mode, path);
  return { applier, notes, apply };
};

const rows = (extras: RuntimeExtras): EffectLedgerRow[] => extras.effects.ledger.filter((row) => row.target.kind === "extension");
const scenarioOf = (chatId: string) => world.metadata[chatId]?.scenario;

let unregister: () => void = () => {};
beforeEach(() => {
  world.chatId = "chat-a";
  world.metadata = { "chat-a": {}, "chat-b": {}, "chat-c": {} };
  cast.members = [];
  enabled = true;
  unregister = registerEffectExtension(createScenarioExtension(host));
});
afterEach(() => unregister());

describe("SP5 path replay (pure)", () => {
  it("the scenario is the last checkpoint on the path that authors one; a checkpoint without the key inherits", () => {
    expect(scenarioForPath(story, ["gate"])).toBe(ONE);
    expect(scenarioForPath(story, ["gate", "road"])).toBe(ONE);
    expect(scenarioForPath(story, ["gate", "road", "hall"])).toBe(THREE);
    expect(scenarioForPath(silent, ["gate", "road", "hall"])).toBeNull();
    expect(scenarioForPath(storyWith({ gate: { scenario: ONE }, hall: { scenario: null } }), ["gate", "road", "hall"])).toBe("");
  });

  it("a story sets a scenario when any checkpoint authors the key", () => {
    expect(storySetsScenario(story)).toBe(true);
    expect(storySetsScenario(silent)).toBe(false);
  });

  it("own = the newest APPLIED scenario row; reverted and refused rows are not ours", () => {
    const row = (status: EffectLedgerRow["status"], text: string): EffectLedgerRow => ({ id: text + status, effect: "scenario", target: { kind: "extension", name: SP5_EXTENSION }, before: { text: "" }, after: { text }, checkpointId: null, boundary: 0, messageId: 0, at: "t", status });
    expect(lastOwnScenario([])).toBeNull();
    expect(lastOwnScenario([row("applied", ONE), row("reverted", THREE)])).toBe(ONE);
    expect(lastOwnScenario([row("applied", ONE), row("externally-changed", THREE)])).toBe(ONE);
  });

  it("flag off: no step and no note, whatever the story says", () => {
    enabled = false;
    cast.members = [{ name: "Arin", scenario: "card" }];
    expect(planScenario({ story, checkpoint: story.checkpointById.gate, path: ["gate"], ledger: [], mode: "activate" }, host)).toEqual({ step: null, notes: [] });
  });
});

describe("SP5 C1 plumbing (deterministic half; the condition itself is live)", () => {
  it("each chat holds its own path's scenario, a no-story chat none, and leaving never writes the chat left behind", async () => {
    const h = harness();
    const a = extrasFor();
    await h.apply(a, ["gate", "road", "hall"]);
    world.chatId = "chat-b";
    await h.applier.restoreFor(a, "leave");
    const b = extrasFor();
    await h.apply(b, ["gate"]);
    world.chatId = "chat-c";
    await h.applier.restoreFor(b, "leave");
    expect({ a: scenarioOf("chat-a"), b: scenarioOf("chat-b"), c: scenarioOf("chat-c") }).toEqual({ a: THREE, b: ONE, c: undefined });
    world.chatId = "chat-a";
    await h.apply(a, ["gate", "road", "hall"], "hydrate");
    expect(rows(a).map((row) => row.status)).toEqual(["applied"]);
  });

  it("a write whose chat moved away before it landed is refused, not written into the other chat", async () => {
    const extension = createScenarioExtension(host);
    const plan = extension.plan({ story, checkpoint: story.checkpointById.gate, path: ["gate"], ledger: [], mode: "activate" });
    world.chatId = "chat-b";
    expect((await plan.step?.write())?.ok).toBe(false);
    expect({ a: scenarioOf("chat-a"), b: scenarioOf("chat-b") }).toEqual({ a: undefined, b: undefined });
  });
});

describe("SP5 C2 user override kept (deterministic leg)", () => {
  it("a user-set override, then a checkpoint write: externally-changed recorded, the user's text kept, no duplicate on hydrate", async () => {
    world.metadata["chat-a"].scenario = USER;
    const h = harness();
    const extras = extrasFor();
    await h.apply(extras, ["gate"]);
    await h.apply(extras, ["gate"], "hydrate");
    expect(scenarioOf("chat-a")).toBe(USER);
    expect(rows(extras).map((row) => ({ status: row.status, found: row.found, after: row.after }))).toEqual([{ status: "externally-changed", found: { text: USER }, after: { text: ONE } }]);
    expect(h.notes.map((note) => note.summary)).toContain("scenario effect was not applied");
  });

  it("the story's write, then a user edit, then restart or leave: the restore is refused and the user's text kept", async () => {
    const h = harness();
    const extras = extrasFor();
    await h.apply(extras, ["gate"]);
    world.metadata["chat-a"].scenario = USER;
    world.chatId = "chat-b";
    expect(await h.applier.restoreFor(extras, "leave")).toEqual({ reverted: 0, refused: 0 });
    world.chatId = "chat-a";
    expect(await h.applier.restoreFor(extras, "restart")).toEqual({ reverted: 0, refused: 1 });
    expect(scenarioOf("chat-a")).toBe(USER);
    expect(rows(extras).map((row) => row.status)).toEqual(["externally-changed"]);
  });

  it("control: with no user edit the same restart puts the chat back to what it held before the story", async () => {
    world.metadata["chat-a"].scenario = "";
    const h = harness();
    const extras = extrasFor();
    await h.apply(extras, ["gate"]);
    expect(await h.applier.restoreFor(extras, "restart")).toEqual({ reverted: 1, refused: 0 });
    expect(scenarioOf("chat-a")).toBeUndefined();
  });
});

describe("SP5 C3 rollback (deterministic leg)", () => {
  it("rollback past the scenario-writing checkpoint restores the previous scenario through a RESTORABLE row, and the replay adds nothing", async () => {
    const h = harness();
    const extras = extrasFor();
    await h.apply(extras, ["gate"]);
    extras.effects.ledger = extras.effects.ledger.map((row) => ({ ...row, messageId: 1 }));
    await h.apply(extras, ["gate", "road", "hall"]);
    extras.effects.ledger = extras.effects.ledger.map((row, index) => (index === 1 ? { ...row, messageId: 5 } : row));
    expect(scenarioOf("chat-a")).toBe(THREE);
    expect(await h.applier.restoreFor(extras, { since: 5 })).toEqual({ reverted: 1, refused: 0 });
    await h.apply(extras, ["gate", "road"], "hydrate");
    expect(scenarioOf("chat-a")).toBe(ONE);
    expect(rows(extras).map((row) => row.status)).toEqual(["applied", "reverted"]);
  });

  it("control: a scenario row whose extension is not registered cannot be put back (revert-failed), so restorability is the registration", async () => {
    const h = harness();
    const extras = extrasFor();
    await h.apply(extras, ["gate"]);
    unregister();
    expect(effectExtension(SP5_EXTENSION)).toBeNull();
    world.metadata["chat-a"].scenario = ONE;
    const outcome = await h.applier.restoreFor(extras, "restart");
    expect(outcome.reverted).toBe(0);
    expect(scenarioOf("chat-a")).toBe(ONE);
  });
});

describe("SP5 C5 competing cards (deterministic leg)", () => {
  it("a story that sets none names every card scenario that frames the chat, in the journal only", async () => {
    cast.members = [{ name: "Arin", scenario: "Arin's card scene." }, { name: "Luke", scenario: "" }, { name: "Ponticius", scenario: "Guild hall." }];
    const h = harness();
    await h.apply(extrasFor(), ["gate"], "activate", silent);
    expect(h.notes).toEqual([{ summary: "2 character card scenario(s) frame this chat and the story sets none", note: "Arin, Ponticius" }]);
  });

  it("controls: a story that sets one, a user override, and a hydrate name nothing", async () => {
    cast.members = [{ name: "Arin", scenario: "Arin's card scene." }];
    expect(competingCards(story, "", cast.members)).toEqual([]);
    expect(competingCards(silent, USER, cast.members)).toEqual([]);
    const h = harness();
    await h.apply(extrasFor(), ["gate"], "hydrate", silent);
    expect(h.notes).toEqual([]);
  });
});
