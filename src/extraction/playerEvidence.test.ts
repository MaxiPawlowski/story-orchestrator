import { readWith } from "../../test/support/modelCall";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { StoryEngine, parseStoryV2, parseStoryV2OrThrow, type NormalizedStoryV2, type StoryV2 } from "@engine/index";
import { buildTypedPlan, readTypedDeltas, stallDirectValue, stallVerdict } from "@judge/extraction";
import { hashContract, PLAYER_MARK, renderSharedReadPrompt, WORLD_EVIDENCE_RULE } from "./contract";
import { evidenceInWindow, evidenceSources } from "./evidence";
import { buildFixtureRun } from "./fixtureRun";
import { getChatWindow } from "./chatWindow";
import { planReconciliation } from "./reconcile";
import { deriveScope } from "./scope";
import { PLAYER_ONLY_EVIDENCE, runSharedRead } from "./sharedRead";
import type { SharedReadWindow } from "./types";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: [], extensionSettings: {} }),
}));

const storyRecord = (evidenceFrom?: "any" | "world"): StoryV2 => ({
  format: 2,
  id: "sun-idol",
  title: "Sun idol",
  description: "v2.4 plan 04 T15",
  qualities: [
    { key: "idol_taken", type: "bool", source: "extractor", rubric: "Does the player now hold the Sun Idol?", ...(evidenceFrom ? { evidence_from: evidenceFrom } : {}) },
    { key: "torch_lit", type: "bool", source: "extractor", rubric: "Is the torch lit?" },
  ],
  checkpoints: [
    { id: "hall", name: "Hall", objective: "Reach the idol", type: "anchor", start: true },
    { id: "altar", name: "Altar", objective: "Escape with the idol", type: "anchor" },
  ],
  transitions: [{ from: "hall", to: "altar", priority: 0, gate: { all: [{ q: "idol_taken", op: "==", v: true }, { q: "torch_lit", op: "==", v: true }] } }],
  roster: [],
});

const story = (evidenceFrom?: "any" | "world"): NormalizedStoryV2 => parseStoryV2OrThrow(storyRecord(evidenceFrom));

const PLAYER = "I grab the Sun Idol from the altar.";
const NARRATOR = "The Sun Idol comes free; you hold it now.";

const window = (withNarrator: boolean): SharedReadWindow => ({
  from: 4,
  to: withNarrator ? 5 : 4,
  messages: [
    { index: 4, messageId: 4, speaker: "Max", text: PLAYER, isUser: true },
    ...(withNarrator ? [{ index: 5, messageId: 5, speaker: "DM Narrator", text: NARRATOR, isUser: false }] : []),
  ],
});

const read = (evidenceFrom: "any" | "world" | undefined, reply: string, withNarrator = false) => {
  const s = story(evidenceFrom);
  const engine = new StoryEngine();
  engine.loadStory(s);
  return runSharedRead({ story: s, state: engine.serialize(), priority: 0, reason: "t15", window: window(withNarrator), ...readWith("p1", { debugResponse: reply }) });
};

describe("v2.4 plan 04 T15: evidenceSources", () => {
  const messages = [
    { messageId: 4, text: PLAYER, isUser: true },
    { messageId: 5, text: NARRATOR, isUser: false },
    { messageId: 6, text: "Everyone stares at the Sun Idol.", isUser: false },
  ];

  it("names every message that holds the whole span", () => {
    expect(evidenceSources("the Sun Idol", messages)).toEqual([4, 5, 6]);
    expect(evidenceSources("you hold it now", messages)).toEqual([5]);
    expect(evidenceSources("grab … altar", messages)).toEqual([4]);
    expect(evidenceSources("grab … hold it", messages)).toEqual([]);
    expect(evidenceSources("", messages)).toEqual([]);
  });

  it("keeps evidenceInWindow as its wrapper", () => {
    expect(evidenceInWindow("you hold it now", messages.map((message) => message.text))).toBe(true);
    expect(evidenceInWindow("grab … hold it", messages.map((message) => message.text))).toBe(false);
  });
});

describe("v2.4 plan 04 T15: the screen", () => {
  it("rejects a world quality proven only by the player's line", async () => {
    const result = await read("world", `DELTA idol_taken value=true evidence="I grab the Sun Idol"`);
    expect(result.audit.acceptedDeltas).toEqual([]);
    expect(result.audit.rejected.map((entry) => entry.reason)).toEqual([PLAYER_ONLY_EVIDENCE]);
  });

  it("accepts a world quality proven by a narrator line, recording that line", async () => {
    const result = await read("world", `DELTA idol_taken value=true evidence="you hold it now"`, true);
    expect(result.audit.acceptedDeltas).toEqual([expect.objectContaining({ delta: expect.objectContaining({ q: "idol_taken", v: true }), messageId: 5 })]);
  });

  it("records the first non-player source when the quote is in both lines", async () => {
    const result = await read("world", `DELTA idol_taken value=true evidence="the Sun Idol"`, true);
    expect(result.audit.acceptedDeltas.map((entry) => entry.messageId)).toEqual([5]);
  });

  it("control: absent and explicit any keep today's behaviour, and record the first source", async () => {
    for (const evidenceFrom of [undefined, "any"] as const) {
      const result = await read(evidenceFrom, `DELTA idol_taken value=true evidence="the Sun Idol"`, true);
      expect(result.audit.acceptedDeltas.map((entry) => entry.messageId)).toEqual([4]);
      expect(result.audit.rejected).toEqual([]);
    }
  });

  it("control: a quality the author left alone beside a world one still takes the player's line", async () => {
    const result = await read("world", `DELTA torch_lit value=true evidence="I grab the Sun Idol"`);
    expect(result.audit.acceptedDeltas.map((entry) => entry.delta.q)).toEqual(["torch_lit"]);
  });
});

describe("v2.4 plan 04 T15: the prompt says what the check enforces", () => {
  const contract = (evidenceFrom?: "any" | "world") => {
    const s = story(evidenceFrom);
    return { storyTitle: s.title, activeCheckpointId: "hall", qualities: deriveScope(s, "hall", { values: {}, versions: {}, latched: {} }), window: window(true), canon: "Anchor hall: Reach the idol" };
  };

  it("marks player lines and states the rule on the world quality's line", () => {
    const prompt = renderSharedReadPrompt(contract("world"));
    expect(prompt).toContain(`[4] Max${PLAYER_MARK}: ${PLAYER}`);
    expect(prompt).toContain(`[5] DM Narrator: ${NARRATOR}`);
    expect(prompt.split("\n").find((line) => line.startsWith("- idol_taken:"))?.endsWith(WORLD_EVIDENCE_RULE)).toBe(true);
    expect(prompt.split("\n").find((line) => line.startsWith("- torch_lit:"))).not.toContain(WORLD_EVIDENCE_RULE);
  });

  it("is byte-identical to today with no world quality, and the flag is in the contract hash", () => {
    for (const evidenceFrom of [undefined, "any"] as const) {
      const prompt = renderSharedReadPrompt(contract(evidenceFrom));
      expect(prompt).not.toContain(PLAYER_MARK);
      expect(prompt).not.toContain(WORLD_EVIDENCE_RULE);
      expect(prompt).toContain(`[4] Max: ${PLAYER}`);
    }
    expect(hashContract(contract("world"))).not.toBe(hashContract(contract()));
    expect(hashContract(contract("any"))).toBe(hashContract(contract()));
  });

  it("marks nothing once the judge has answered the world quality (residual scope)", async () => {
    const s = story("world");
    const engine = new StoryEngine();
    engine.loadStory(s);
    const result = await runSharedRead({
      story: s,
      state: engine.serialize(),
      priority: 0,
      reason: "t15",
      window: window(true),
      scope: deriveScope(s, "hall", { values: {}, versions: {}, latched: {} }).map((entry) => (entry.key === "idol_taken" ? { ...entry, quality: { ...entry.quality, read_as: "choice" as const } } : entry)),
      judgeTyped: async () => ({ deltas: [], answered: ["idol_taken"], model: "m", confidences: {} }),
      ...readWith("p1", { debugResponse: "NO_DELTA" }),
    });
    expect(result.audit.prompt).not.toContain(PLAYER_MARK);
  });

  it("leaves the 29 extraction fixture prompts byte-identical", () => {
    const dir = join(process.cwd(), "test/fixtures");
    const names = readdirSync(dir).filter((file) => /^extractor\d*\.story\.json$/.test(file)).map((file) => file.replace(".story.json", ""));
    expect(names).toHaveLength(29);
    names.forEach((name) => {
      const storyRaw = JSON.parse(readFileSync(join(dir, `${name}.story.json`), "utf8"));
      const transcript = JSON.parse(readFileSync(join(dir, `${name}.transcript.json`), "utf8")) as Array<{ index: number; speaker: string; text: string }>;
      const expected = JSON.parse(readFileSync(join(dir, `${name}.expected.json`), "utf8")) as { spec?: Record<string, unknown> };
      const run = buildFixtureRun({ story: storyRaw, transcript, ...(expected.spec ?? {}) });
      const lines = run.prompt.split("\n");
      const transcriptLines = lines.slice(lines.indexOf("Transcript:") + 1, lines.lastIndexOf("Output:") - 1);
      expect(transcriptLines).toEqual(transcript.length ? transcript.map((entry) => `[${entry.index}] ${entry.speaker}: ${entry.text}`) : ["(empty)"]);
      expect(run.prompt).not.toContain(WORLD_EVIDENCE_RULE);
    });
  });
});

describe("v2.4 plan 04 T15: the judge paths follow the same rule", () => {
  const typedWindow = [
    { id: 4, speaker: "Max", text: PLAYER, isUser: true },
    { id: 5, speaker: "DM Narrator", text: NARRATOR, isUser: false },
  ];
  const hinted = (evidenceFrom?: "world") => ({ ...story(evidenceFrom).qualityByKey.idol_taken, read_as: "choice" as const });
  const context = { title: "Sun idol", checkpointName: "Hall", objective: "Reach the idol" };
  const answer = (label: string) => ({ "q:idol_taken": { type: "choice" as const, choice: label, confidence: 0.97, probabilities: {} } });

  it("a world quality whose decoder names the player's message is not answered, so the LLM read keeps it", () => {
    const quality = hinted("world");
    const plan = buildTypedPlan([quality], typedWindow, context)!;
    const read = readTypedDeltas(answer("yes in msg_4"), plan, [quality], typedWindow);
    expect(read).toEqual({ deltas: [], answered: [] });
  });

  it("a world quality whose decoder names a narrator message is answered, with its message id", () => {
    const quality = hinted("world");
    const plan = buildTypedPlan([quality], typedWindow, context)!;
    const read = readTypedDeltas(answer("yes in msg_5"), plan, [quality], typedWindow);
    expect(read.answered).toEqual(["idol_taken"]);
    expect(read.deltas).toEqual([expect.objectContaining({ q: "idol_taken", v: true, messageId: 5 })]);
  });

  it("control: without world the player's message still answers it", () => {
    const quality = hinted();
    const plan = buildTypedPlan([quality], typedWindow, context)!;
    expect(readTypedDeltas(answer("yes in msg_4"), plan, [quality], typedWindow).answered).toEqual(["idol_taken"]);
  });

  it("the stall judge never writes a world quality directly: a confident yes becomes a re-read", () => {
    const worldLeaf = { q: "idol_taken", rubric: "r", type: "bool" as const, op: "==", v: true, world: true };
    expect(stallDirectValue(worldLeaf, 0.99)).toBeNull();
    expect(stallDirectValue({ ...worldLeaf, world: undefined }, 0.99)).toBe(true);
    expect(stallVerdict({ "leaf:0": { type: "noul", noul: 0.99 } as never }, [worldLeaf]).kind).toBe("reread");
  });

  it("the stall plan marks a world leaf", () => {
    const s = story("world");
    const engine = new StoryEngine();
    engine.loadStory(s);
    const state = { ...engine.serialize(), boundary: 6, lastMessageId: 6, checkpointStartedBoundary: 0 };
    const plan = planReconciliation(s, state as never, 1, getChatWindow);
    expect(plan?.leaves.find((leaf) => leaf.q === "idol_taken")?.world).toBe(true);
    expect(plan?.leaves.find((leaf) => leaf.q === "torch_lit")?.world).toBeUndefined();
  });
});

describe("v2.4 plan 04 live fixture stories", () => {
  const load = (file: string) => parseStoryV2(JSON.parse(readFileSync(join(process.cwd(), "test/scenarios", file), "utf8")));

  it("validate, and only the variant declares world evidence and the attempts clause", () => {
    const variant = load("live-v24-04.story.json");
    const control = load("live-v24-04-control.story.json");
    if (Array.isArray(variant) || Array.isArray(control)) throw new Error(JSON.stringify({ variant, control }));
    expect(variant.qualityByKey.idol_taken.evidence_from).toBe("world");
    expect(variant.checkpointById.altar.agency?.player_attempts_only).toBe(true);
    expect(control.qualityByKey.idol_taken.evidence_from).toBeUndefined();
    expect(control.checkpointById.altar.agency).toBeUndefined();
    expect(variant.outgoingByCheckpoint.altar.map((transition) => variant.checkpointById[transition.to].type)).toEqual(["anchor"]);
  });
});

describe("v2.4 plan 04 T15: schema", () => {
  it("accepts any and world on an extractor quality, and keeps the explicit value", () => {
    expect(story("world").qualityByKey.idol_taken.evidence_from).toBe("world");
    expect(story("any").qualityByKey.idol_taken.evidence_from).toBe("any");
    expect(story().qualityByKey.idol_taken.evidence_from).toBeUndefined();
  });

  it("rejects evidence_from on a code quality and an unknown value", () => {
    const code = storyRecord("world");
    code.qualities[0] = { ...code.qualities[0], source: "code" };
    expect((parseStoryV2(code) as Array<{ path: string }>).map((error) => error.path)).toContain("qualities.0.evidence_from");
    const unknown = storyRecord();
    (unknown.qualities[0] as unknown as Record<string, unknown>).evidence_from = "narrator";
    expect((parseStoryV2(unknown) as Array<{ message: string }>).map((error) => error.message)).toContain("evidence_from must be any or world");
  });
});
