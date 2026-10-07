import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseStoryV2OrThrow, type EngineState } from "@engine/index";
import { ATTENTION_QUESTION, buildWardenRequests, defaultJudgeSettings, readWarden, wardenRecordP, type JudgeRequest, type JudgeSettings, type WardenInput } from "@judge/index";
import { createWarden, wardenFamilies } from "../continuity";
import { JudgeRuntime } from "../judge";
import { testOwnership } from "../../../test/findings/testOwnership";

const story = parseStoryV2OrThrow({
  format: 2, id: "attention", title: "Attention", description: "N1.",
  qualities: [{ key: "crossed", type: "bool", source: "extractor", rubric: "Crossed?" }],
  checkpoints: [{ id: "cp1", name: "The bank", objective: "Cross", type: "anchor", start: true }],
  transitions: [], roster: [],
});
const view = { getStory: () => story, getState: () => ({ activeCheckpointId: "cp1" }) as unknown as EngineState };

const judgeWith = (uses: Partial<JudgeSettings["uses"]>, attentionScore = 0.2, provider?: Partial<JudgeSettings["provider"]>) => {
  const base = defaultJudgeSettings();
  const settings: JudgeSettings = {
    ...base,
    uses: { ...Object.fromEntries(Object.keys(base.uses).map((key) => [key, false])) as JudgeSettings["uses"], ...uses },
    provider: { ...base.provider, ...provider },
  };
  const requests: JudgeRequest[] = [];
  const judge = new JudgeRuntime({
    ownership: testOwnership(),
    getSettings: () => settings,
    transport: async (request) => {
      requests.push(request);
      return { model: "jev-1.13.0", answers: { agency: { type: "score", score: 0.4, confidence: 0.9, probabilities: {} }, attention: { type: "score", score: attentionScore, confidence: 0.9, probabilities: {} } } };
    },
    status: async () => ({ configured: true }),
    record: () => undefined,
    context: () => ({ boundary: 1, messageId: 1 }),
  });
  return { judge, requests };
};

const said = { player: "Max", message: "Where is the ferry?" };
const reply = { speaker: "Guard", text: "The guard polishes his helmet and talks about the weather." };

describe("v2.7 33 W3 N1: the attention question rides the warden's call", () => {
  it("is its own default-off key, and joins the families only while it is on", () => {
    expect(defaultJudgeSettings().uses.attentionCheck).toBe(false);
    expect(wardenFamilies(() => judgeWith({ agencyCheck: true }).judge, view)()).toEqual({ agency: true, houseRules: [], lore: false });
    expect(wardenFamilies(() => judgeWith({ attentionCheck: true }).judge, view)()).toEqual({ agency: false, houseRules: [], lore: false, attention: true });
  });

  it("is left out when the warden is routed to a provider it was never calibrated on", () => {
    expect(wardenFamilies(() => judgeWith({ attentionCheck: true }, 0.2, { warden: "llama-logprob" }).judge, view)()).toEqual({ agency: false, houseRules: [], lore: false });
  });

  it("adds one question to the same request, sharing the player state with agency", () => {
    const input: WardenInput = { reply, facts: [], agency: said, attention: said, houseRules: [] };
    const [request] = buildWardenRequests(input);
    expect(Object.keys(request.questions)).toEqual(["agency", "attention"]);
    expect(request.state).toEqual({ reply, player: "Max", player_message: "Where is the ferry?" });
    expect((request.questions.attention as { instructions: string }).instructions).toBe(ATTENTION_QUESTION);
  });

  it("payload invariance: with the use off the warden request is byte-identical to before", () => {
    const off: WardenInput = { reply, facts: ["The bridge fell."], agency: said, houseRules: [] };
    const [request] = buildWardenRequests(off);
    expect(Object.keys(request.questions).filter((key) => !key.startsWith("fact"))).toEqual(["agency"]);
    expect(JSON.stringify(request)).not.toContain("attention");
  });

  it("flags a reply that passed over the player below the threshold, and not one that answered", () => {
    const input: WardenInput = { reply, facts: [], agency: null, attention: said, houseRules: [] };
    const low = readWarden({ attention: { type: "score", score: 0.2, confidence: 0.9, probabilities: {} } }, input);
    expect(low).toEqual([{ family: "attention", text: "Attention: the last reply passed over what Max said or did. Let the next reply answer it before the scene moves on.", facts: [], score: 0.2 }]);
    expect(readWarden({ attention: { type: "score", score: 1.6, confidence: 0.9, probabilities: {} } }, input)).toEqual([]);
    expect(wardenRecordP({ attention: { type: "score", score: 0.2, confidence: 0.9, probabilities: {} } }, input)).toMatchObject({ attention: 0.2 });
  });

  it("its spike fixture is 20 labelled rows in the predeclared mix, and each row builds one warden request with the question", () => {
    const fixture = JSON.parse(readFileSync(join(__dirname, "../../../test/fixtures/judge/spike-attention.json"), "utf8")) as {
      player: string; rows: Array<{ playerMessage: string; reply: { speaker: string; text: string }; group: boolean; addressed: boolean; label: string }>;
    };
    const count = (label: string) => fixture.rows.filter((row) => row.label === label).length;
    expect([fixture.rows.length, count("ignores"), count("partial"), count("responds")]).toEqual([20, 7, 5, 8]);
    expect(fixture.rows.filter((row) => row.group && !row.addressed).every((row) => row.label === "responds")).toBe(true);
    expect(fixture.rows.filter((row) => row.group && !row.addressed).length).toBeGreaterThanOrEqual(4);
    for (const row of fixture.rows) {
      const requests = buildWardenRequests({ reply: row.reply, facts: [], agency: null, attention: { player: fixture.player, message: row.playerMessage }, houseRules: [] });
      expect(requests.map((request) => Object.keys(request.questions))).toEqual([["attention"]]);
    }
  });

  it("one call, one fate: the warden asks once and reads both families from that answer", async () => {
    const { judge, requests } = judgeWith({ agencyCheck: true, attentionCheck: true });
    const warden = createWarden(() => judge, view, { facts: () => [], nudgeActive: () => false });
    const findings = await warden.check({ reply, facts: [], agency: said, attention: said, houseRules: [] });
    expect(requests).toHaveLength(1);
    expect(findings?.map((finding) => finding.family)).toEqual(["attention"]);
  });
});
