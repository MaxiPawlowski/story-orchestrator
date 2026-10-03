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
import { EffectsApplier, NO_OPEN_CHAT } from "./effectsApplier";
import { effectExtension, registerEffectExtension } from "./effectExtensions";
import { readEffectTarget, restoreEffectTarget } from "./effectHost";
import type { EffectLedgerRow, RuntimeExtras } from "./types";
import { testOwnership } from "../../test/findings/testOwnership";
import {
  SCENARIO_EFFECT, competingCards, competingScenarios, createScenarioExtension, lastOwnScenario, planScenario, scenarioForPath, storySetsScenario, type ScenarioHost,
} from "./storyScenario";

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
const host: ScenarioHost = {
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

const extrasFor = (ready = true): RuntimeExtras => ({
  requirements: { ready }, firedNpcReplies: {}, lastSelfInjectionMessageId: -1, lastAppliedCheckpointId: null, updatedAt: "x", settings: {}, effects: { ledger: [], cast: [] },
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
  unregister = registerEffectExtension(createScenarioExtension(host));
});
afterEach(() => unregister());

describe("story scenario path replay (pure)", () => {
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
    const row = (status: EffectLedgerRow["status"], text: string): EffectLedgerRow => ({ id: text + status, effect: "scenario", target: { kind: "extension", name: SCENARIO_EFFECT }, before: { text: "" }, after: { text }, checkpointId: null, boundary: 0, messageId: 0, at: "t", status });
    expect(lastOwnScenario([])).toBeNull();
    expect(lastOwnScenario([row("applied", ONE), row("reverted", THREE)])).toBe(ONE);
    expect(lastOwnScenario([row("applied", ONE), row("externally-changed", THREE)])).toBe(ONE);
  });

  it("no open chat: no step and no note, whatever the story says", () => {
    world.chatId = "";
    cast.members = [{ name: "Arin", scenario: "card" }];
    expect(planScenario({ story, checkpoint: story.checkpointById.gate, path: ["gate"], ledger: [], mode: "activate" }, host)).toEqual({ step: null, notes: [] });
  });

  it("reads the typed field: a parsed null and an empty string both clear", () => {
    const cleared = storyWith({ gate: { scenario: ONE }, road: { scenario: "" }, hall: { scenario: null } });
    expect(cleared.checkpointById.hall.effects?.scenario).toBe("");
    expect(scenarioForPath(cleared, ["gate", "road"])).toBe("");
    expect(storySetsScenario(cleared)).toBe(true);
  });
});

describe("v2.7 02 C1: the promoted effect keeps the shipped invariants", () => {
  it("no chat open: EffectsApplier refuses with NO_OPEN_CHAT and writes nothing", async () => {
    const h = harness();
    const extras = extrasFor();
    world.chatId = "";
    await h.apply(extras, ["gate"]);
    expect(h.notes).toEqual([{ summary: "checkpoint effects were not applied", note: NO_OPEN_CHAT }]);
    expect(rows(extras)).toEqual([]);
    expect(Object.values(world.metadata).map((metadata) => metadata.scenario)).toEqual([undefined, undefined, undefined]);
  });

  it("held while requirements are unmet: no scenario row, and the chat keeps its own value", async () => {
    world.metadata["chat-a"].scenario = "";
    const h = harness();
    const extras = extrasFor(false);
    await h.apply(extras, ["gate"]);
    expect(rows(extras)).toEqual([]);
    expect(scenarioOf("chat-a")).toBe("");
  });

  it("control: the same apply with requirements met writes the gate's scenario", async () => {
    const h = harness();
    const extras = extrasFor(true);
    await h.apply(extras, ["gate"]);
    expect(rows(extras).map((row) => row.status)).toEqual(["applied"]);
    expect(scenarioOf("chat-a")).toBe(ONE);
  });

  it("a jump releases the source's scenario and applies the target alone: a target that authors none plays with the pre-story value", async () => {
    world.metadata["chat-a"].scenario = "";
    const h = harness();
    const extras = extrasFor();
    await h.apply(extras, ["gate"]);
    await h.applier.releaseStaging(story, extras, { stillOwns: () => true } as never);
    await h.apply(extras, ["road"]);
    expect(scenarioOf("chat-a")).toBeUndefined();
    await h.apply(extras, ["hall"]);
    expect(scenarioOf("chat-a")).toBe(THREE);
    expect(rows(extras).map((row) => row.status)).toEqual(["reverted", "applied"]);
  });

  it("T7 triage, toy C2 order 1: a user override, then a jump, then leave and come back: two refused rows (the released source + the target), and the hydrate adds none", async () => {
    const h = harness();
    const extras = extrasFor();
    await h.apply(extras, ["gate"]);
    world.metadata["chat-a"].scenario = USER;
    await h.applier.releaseStaging(story, extras, { stillOwns: () => true } as never);
    await h.apply(extras, ["hall"]);
    world.chatId = "chat-c";
    await h.applier.restoreFor(extras, "leave");
    world.chatId = "chat-a";
    await h.apply(extras, ["hall"], "hydrate");
    expect(scenarioOf("chat-a")).toBe(USER);
    expect(rows(extras).map((row) => ({ status: row.status, after: row.after }))).toEqual([
      { status: "externally-changed", after: { text: ONE } },
      { status: "externally-changed", after: { text: THREE } },
    ]);
  });

  it("rollback equals replay: restoring past a write and re-applying the shorter path holds what a fresh replay of that path holds", async () => {
    const h = harness();
    const live = extrasFor();
    await h.apply(live, ["gate"]);
    live.effects.ledger = live.effects.ledger.map((row) => ({ ...row, messageId: 1 }));
    await h.apply(live, ["gate", "road", "hall"]);
    live.effects.ledger = live.effects.ledger.map((row, index) => (index === 1 ? { ...row, messageId: 5 } : row));
    await h.applier.restoreFor(live, { since: 5 });
    await h.apply(live, ["gate", "road"], "hydrate");
    const rolledBack = scenarioOf("chat-a");
    world.chatId = "chat-b";
    const replay = harness();
    await replay.apply(extrasFor(), ["gate", "road"]);
    expect(rolledBack).toBe(scenarioOf("chat-b"));
    expect(rolledBack).toBe(ONE);
  });
});

describe("story scenario C1 plumbing (deterministic half; the condition itself is live)", () => {
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

describe("story scenario C2 user override kept (deterministic leg)", () => {
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

describe("story scenario C3 rollback (deterministic leg)", () => {
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
    expect(effectExtension(SCENARIO_EFFECT)).toBeNull();
    world.metadata["chat-a"].scenario = ONE;
    const outcome = await h.applier.restoreFor(extras, "restart");
    expect(outcome.reverted).toBe(0);
    expect(scenarioOf("chat-a")).toBe(ONE);
  });
});

describe("story scenario C5 competing cards (deterministic leg)", () => {
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

  it("the author view reads the same names from the live frame; no story or no frame names none", () => {
    const frame = { override: "", cast: [{ name: "Arin", scenario: "Arin's card scene." }, { name: "Luke", scenario: "" }] };
    expect(competingScenarios(silent, frame)).toEqual(["Arin"]);
    expect(competingScenarios(story, frame)).toEqual([]);
    expect(competingScenarios(null, frame)).toEqual([]);
    expect(competingScenarios(silent, null)).toEqual([]);
  });
});
