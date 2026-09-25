import { parseStoryV2OrThrow, type EngineState, type NormalizedStoryV2 } from "@engine/index";
import { defaultJudgeSettings, type JudgeRequest, type JudgeSettings } from "@judge/index";
import { clearStoryExtensionPrompt, setStoryExtensionPrompt } from "@services/STAPI";
import { composeWardenNote, type WardenCheckFinding, type WardenCheckInput, type WardenNoteOp } from "@stagecraft/index";
import { StagecraftCoordinator, type StagecraftCoordinatorDeps } from "./stagecraftCoordinator";
import { createStagecraft } from "../extras";
import { createWarden, wardenFamilies } from "../continuity";
import { JudgeRuntime } from "../judge";
import type { ExtractionRuntimeSettings, StagecraftRuntimeState } from "../types";

const mockChat: Array<Record<string, unknown>> = [];

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  setStoryExtensionPrompt: jest.fn(),
  clearStoryExtensionPrompt: jest.fn(),
  loadLorebook: jest.fn(),
  readWIEntry: jest.fn(),
  readWIEntryAt: jest.fn(),
  restoreWIEntryAt: jest.fn(),
  upsertWIEntry: jest.fn(),
  enableWIEntry: jest.fn(),
  disableWIEntry: jest.fn(),
  getPlayerName: () => "Max",
  getContext: () => ({ extensionSettings: {}, chat: mockChat }),
}));

const KEY = "story_orchestrator_continuity";
const RULES = ["No character uses a gun.", "Magic cannot heal wounds."];

const story = (agency?: { never_narrate_player_action: boolean }): NormalizedStoryV2 => parseStoryV2OrThrow({
  format: 2,
  id: "warden-families",
  title: "Families",
  description: "Warden.",
  qualities: [{ key: "crossed", type: "bool", source: "extractor", rubric: "Crossed?" }],
  checkpoints: [{ id: "cp1", name: "The bank", objective: "Cross", type: "anchor", start: true, ...(agency ? { agency } : {}) }],
  transitions: [],
  roster: [],
  house_rules: RULES,
});

const engineState = { activeCheckpointId: "cp1", boundary: 3, lastMessageId: 1 } as unknown as EngineState;

const agencyFinding: WardenCheckFinding = { family: "agency", text: "Agency: Max's own words and decisions are theirs to write: do not narrate Max acting, accepting, agreeing or refusing.", facts: [], score: 3.4 };
const ruleFinding: WardenCheckFinding = { family: "house-rule", text: `House rule: "${RULES[0]}" — keep the next reply within it.`, facts: [], rules: [RULES[0]] };
const continuityFinding: WardenCheckFinding = { family: "continuity", text: "Continuity: established — The bridge fell. Keep the next reply consistent with it.", facts: ["The bridge fell."] };

const harness = (options: { continuity?: boolean; mode?: "auto" | "review" | "off"; agency?: boolean; houseRules?: string[]; findings?: WardenCheckFinding[] | null } = {}) => {
  let state: StagecraftRuntimeState = { ...createStagecraft(), settings: { curatorEnabled: false, acceptMode: "review", wardenEnabled: options.continuity ?? false, wardenAcceptMode: options.mode ?? "auto" } };
  const inputs: WardenCheckInput[] = [];
  const families = { agency: options.agency ?? false, houseRules: options.houseRules ?? [] };
  const coordinator = new StagecraftCoordinator({
    getStory: () => story(),
    getState: () => engineState,
    getStagecraft: () => state,
    setStagecraft: (next) => { state = next; },
    getExtractionSettings: () => ({ profileId: "p" } as ExtractionRuntimeSettings),
    getCanon: () => "",
    getOpenArcs: () => [],
    warden: {
      check: async (input) => { inputs.push(input); return options.findings === undefined ? [agencyFinding] : options.findings; },
      facts: () => [{ id: "f", text: "The bridge fell." }],
      families: () => families,
      nudgeActive: () => false,
    },
    journal: () => undefined,
    persist: async () => undefined,
    notify: () => undefined,
  } as StagecraftCoordinatorDeps);
  return { coordinator, inputs, families, read: () => state };
};

beforeEach(() => {
  mockChat.splice(0, mockChat.length, { name: "Max", mes: "I wait by the gate.", is_user: true }, { name: "Guard", mes: "You shoulder your pack and walk off.", is_user: false });
  (setStoryExtensionPrompt as jest.Mock).mockClear();
  (clearStoryExtensionPrompt as jest.Mock).mockClear();
});

describe("T22/T23: the warden pass asks every family that is on", () => {
  it("asks with no facts when only the agency check is on, with the player's line and persona", async () => {
    const env = harness({ agency: true });
    expect(await env.coordinator.runWardenPass(1)).toBe(true);
    expect(env.inputs).toEqual([{ reply: { speaker: "Guard", text: "You shoulder your pack and walk off." }, facts: [], agency: { player: "Max", message: "I wait by the gate." }, houseRules: [] }]);
    const record = env.read().proposals.at(-1);
    expect(record).toMatchObject({ id: "warden-3-1", curator: "warden", reason: "agency", summary: "Guard's reply writes the player's own part", ops: [{ status: "accepted", op: { kind: "note", family: "agency", score: 3.4, replyMessageId: 1 } }] });
  });

  it("asks with no facts when only house rules are on (no facts no longer skips the call)", async () => {
    const env = harness({ houseRules: RULES, findings: [ruleFinding] });
    expect(await env.coordinator.runWardenPass(1)).toBe(true);
    expect(env.inputs[0]).toMatchObject({ facts: [], agency: null, houseRules: RULES });
    expect(env.read().proposals.at(-1)).toMatchObject({ reason: "house-rule", summary: "Guard's reply breaks a house rule", ops: [{ op: { family: "house-rule", rules: [RULES[0]] } }] });
  });

  it("makes no call and no record when every family is off", async () => {
    const env = harness();
    expect(await env.coordinator.runWardenPass(1)).toBe(false);
    expect(env.inputs).toEqual([]);
    expect(env.read().proposals).toEqual([]);
  });

  it("makes no call with every family on but the shared accept mode off", async () => {
    const env = harness({ continuity: true, agency: true, houseRules: RULES, mode: "off" });
    expect(await env.coordinator.runWardenPass(1)).toBe(false);
    expect(env.inputs).toEqual([]);
  });

  it("sends facts only while continuity is on, and no agency block without a player line", async () => {
    mockChat.splice(0, 1);
    mockChat.unshift({ name: "Narrator", mes: "Rain.", is_user: false });
    const env = harness({ agency: true, houseRules: RULES, findings: null });
    await env.coordinator.runWardenPass(1);
    expect(env.inputs[0]).toMatchObject({ facts: [], agency: null, houseRules: RULES });
    const both = harness({ continuity: true, findings: null });
    await both.coordinator.runWardenPass(1);
    expect(both.inputs[0].facts).toEqual(["The bridge fell."]);
  });

  it("records one op per family on one record, and review leaves them all pending", async () => {
    const env = harness({ continuity: true, agency: true, houseRules: RULES, mode: "review", findings: [continuityFinding, agencyFinding, ruleFinding] });
    await env.coordinator.runWardenPass(1);
    const record = env.read().proposals.at(-1)!;
    expect(record.reason).toBe("continuity+agency+house-rule");
    expect(record.summary).toBe("Guard's reply contradicts an established fact; writes the player's own part; breaks a house rule");
    expect(record.ops.map((entry) => [entry.status, (entry.op as WardenNoteOp).family ?? "continuity"])).toEqual([["pending", "continuity"], ["pending", "agency"], ["pending", "house-rule"]]);
    expect((record.ops[0].op as WardenNoteOp).sources?.map((source) => source.id)).toEqual(["f"]);
    env.coordinator.onGenerationStarted("normal", false);
    expect(setStoryExtensionPrompt).not.toHaveBeenCalled();
  });
});

describe("T22/T23: the composed note", () => {
  it("carries every accepted op of the newest noted reply in family order, spends them together on a render", async () => {
    const env = harness({ continuity: true, agency: true, houseRules: RULES, findings: [ruleFinding, agencyFinding, continuityFinding] });
    await env.coordinator.runWardenPass(1);
    env.coordinator.onGenerationStarted("normal", false);
    expect(setStoryExtensionPrompt).toHaveBeenCalledWith(KEY, [continuityFinding.text, agencyFinding.text, ruleFinding.text].join("\n"), 0);
    env.coordinator.commitNote(true);
    expect(env.read().proposals.at(-1)!.ops.map((entry) => entry.status)).toEqual(["applied", "applied", "applied"]);
  });

  it("takes the newest noted reply, not the oldest", () => {
    const env = harness({ agency: true });
    const record = (id: string, messageId: number, text: string) => ({ id, curator: "warden" as const, at: "", boundary: 1, messageId, checkpointId: "cp1", reason: "agency", summary: "", mode: "auto" as const, ops: [{ op: { kind: "note" as const, family: "agency" as const, text, facts: [], replyMessageId: messageId }, status: "accepted" as const }], dropped: [] });
    env.read().proposals.push(record("old", 1, "Agency: old."), record("new", 3, "Agency: new."));
    env.coordinator.onGenerationStarted("normal", false);
    expect(setStoryExtensionPrompt).toHaveBeenCalledWith(KEY, "Agency: new.", 0);
  });

  it("caps the composed block at four lines", () => {
    const ops: WardenNoteOp[] = [
      { kind: "note", family: "house-rule", text: "R1\nR2", facts: [], replyMessageId: 1, rules: ["a", "b"] },
      { kind: "note", text: "C1\nC2", facts: ["x", "y"], replyMessageId: 1 },
      { kind: "note", family: "agency", text: "A1", facts: [], replyMessageId: 1 },
    ];
    expect(composeWardenNote(ops)).toBe("C1\nC2\nA1\nR1");
  });

  it("injects only the families still on: a family switched off after its note was accepted stays out", async () => {
    const env = harness({ continuity: true, agency: true, findings: [continuityFinding, agencyFinding] });
    await env.coordinator.runWardenPass(1);
    env.families.agency = false;
    env.coordinator.onGenerationStarted("normal", false);
    expect(setStoryExtensionPrompt).toHaveBeenCalledWith(KEY, continuityFinding.text, 0);
    env.coordinator.commitNote(true);
    expect(env.read().proposals.at(-1)!.ops.map((entry) => entry.status)).toEqual(["applied", "accepted"]);
  });

  it("a newer reply lapses an unapplied note of every family, and a rollback withdraws them", async () => {
    const env = harness({ agency: true, houseRules: RULES, mode: "review", findings: [agencyFinding, ruleFinding] });
    await env.coordinator.runWardenPass(1);
    mockChat.push({ name: "Max", mes: "I stay.", is_user: true }, { name: "Guard", mes: "The guard shrugs.", is_user: false });
    env.coordinator["deps"].warden!.check = async () => null;
    await env.coordinator.runWardenPass(3);
    expect(env.read().proposals.find((record) => record.messageId === 1)!.ops.map((entry) => entry.message)).toEqual(["lapsed", "lapsed"]);
    const rolled = harness({ agency: true, findings: [agencyFinding] });
    await rolled.coordinator.runWardenPass(1);
    await rolled.coordinator.revertAppliedSince(1);
    expect(rolled.read().proposals.at(-1)!.ops[0]).toMatchObject({ status: "rejected", message: "reverted" });
  });
});

describe("T23: a hot-swap that removes a rule", () => {
  it("withdraws the unapplied note that named it at the next generation, and never injects it", async () => {
    const env = harness({ houseRules: RULES, findings: [ruleFinding] });
    await env.coordinator.runWardenPass(1);
    env.read().proposals.at(-1)!.ops[0].op = { ...(env.read().proposals.at(-1)!.ops[0].op as WardenNoteOp), rules: ["A rule the story no longer has."] };
    env.families.houseRules = ["A rule the story no longer has."];
    env.coordinator.onGenerationStarted("normal", false);
    expect(setStoryExtensionPrompt).not.toHaveBeenCalled();
    expect(env.read().proposals.at(-1)!.ops[0]).toMatchObject({ status: "rejected", message: "rule removed" });
  });

  it("keeps a note whose rule is still in the story", async () => {
    const env = harness({ houseRules: RULES, findings: [ruleFinding] });
    await env.coordinator.runWardenPass(1);
    env.coordinator.onGenerationStarted("normal", false);
    expect(setStoryExtensionPrompt).toHaveBeenCalledWith(KEY, ruleFinding.text, 0);
    expect(env.read().proposals.at(-1)!.ops[0].status).toBe("accepted");
  });
});

describe("T22/T23 wiring (runtime/continuity.ts)", () => {
  const judgeWith = (uses: Partial<JudgeSettings["uses"]>, enabled = true) => {
    const settings: JudgeSettings = { ...defaultJudgeSettings(), enabled, uses: { ...defaultJudgeSettings().uses, ...uses } };
    const requests: JudgeRequest[] = [];
    const judge = new JudgeRuntime({
      getSettings: () => settings,
      transport: async (request) => { requests.push(request); return { model: "jev-1.13.0", answers: { agency: { type: "score", score: 3.2, confidence: 0.9, probabilities: {} }, "rule:0": { type: "noul", noul: 0.9 }, "rule:1": { type: "noul", noul: 0.1 } } }; },
      status: async () => ({ configured: true }),
      record: () => undefined,
      context: () => ({ boundary: 1, messageId: 1 }),
    });
    return { judge, requests };
  };
  const view = (agency?: { never_narrate_player_action: boolean }) => ({ getStory: () => story(agency), getState: () => engineState });

  it("each family is its own default-off key", () => {
    expect(wardenFamilies(() => judgeWith({}).judge, view())()).toEqual({ agency: false, houseRules: [] });
    expect(wardenFamilies(() => judgeWith({ agencyCheck: true, houseRules: true }, false).judge, view())()).toEqual({ agency: false, houseRules: [] });
    expect(wardenFamilies(() => judgeWith({ agencyCheck: true }).judge, view())()).toEqual({ agency: true, houseRules: [] });
    expect(wardenFamilies(() => judgeWith({ houseRules: true }).judge, view())()).toEqual({ agency: false, houseRules: RULES });
  });

  it("the agency check stands down where the checkpoint lets narration write the player", () => {
    expect(wardenFamilies(() => judgeWith({ agencyCheck: true }).judge, view({ never_narrate_player_action: false }))().agency).toBe(false);
  });

  it("asks one combined request and reads every family's finding", async () => {
    const { judge, requests } = judgeWith({ agencyCheck: true, houseRules: true });
    const warden = createWarden(() => judge, view(), { facts: () => [], nudgeActive: () => false });
    const findings = await warden.check({ reply: { speaker: "Guard", text: "You leave." }, facts: [], agency: { player: "Max", message: "I wait." }, houseRules: RULES });
    expect(requests).toHaveLength(1);
    expect(Object.keys(requests[0].questions)).toEqual(["agency", "rule:0", "rule:1"]);
    expect(findings?.map((finding) => finding.family)).toEqual(["agency", "house-rule"]);
    expect(await warden.check({ reply: { speaker: "Guard", text: "You leave." }, facts: [], agency: null, houseRules: [] })).toBeNull();
    expect(requests).toHaveLength(1);
  });
});
