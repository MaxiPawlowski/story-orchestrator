import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseStoryV2OrThrow } from "@engine/index";
import { loadGameLayer } from "@engine/validate/gameLayer";
import { VOICE_QUESTION, type JudgeRequest, type JudgeResult } from "@judge/index";
import { runVoiceCalibration } from "@judge/calibration";
import { voiceCases } from "./judgeHarness";

const raw = JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/character-life.story.json"), "utf8"));

const answering = (score: number | null, fallback?: "timeout") => async (request: JudgeRequest): Promise<JudgeResult> => ({
  answers: score === null ? null : { voice: { type: "score", score, confidence: 0.9, probabilities: {} } },
  model: "jev-1.13.0", latencyMs: 40, stateChars: JSON.stringify(request.state).length, questionCount: Object.keys(request.questions).length, cached: false,
  ...(fallback ? { fallback } : {}),
});

beforeAll(async () => {
  await loadGameLayer();
});

describe("wardenVoice calibration (v2.7 37 L6-C, so-judge calibrate --use warden-voice)", () => {
  it("builds each row's voice from the story roster, by id or name, and refuses a stranger", () => {
    const story = parseStoryV2OrThrow(raw);
    const [byId, byName] = voiceCases(story, [
      { id: "v1", member: "arin", label: "in", reply: "I will pay it back." },
      { id: "v2", member: "Arin", label: "ooc", reply: "Debts? Who cares." },
    ]);
    expect(byId.reply).toEqual({ speaker: "Arin", text: "I will pay it back." });
    expect(byName.voice.speaker).toBe("Arin");
    expect(() => voiceCases(story, [{ id: "v3", member: "nobody", label: "in", reply: "x" }])).toThrow(/v3: "nobody" is not a roster member/);
  });

  it("asks the voice question alone and scores a note against the label", async () => {
    const story = parseStoryV2OrThrow(raw);
    const cases = voiceCases(story, [{ id: "v1", member: "arin", label: "ooc", reply: "Debts? Who cares." }, { id: "v2", member: "arin", label: "in", reply: "I will pay it back." }]);
    const asked: JudgeRequest[] = [];
    const low = await runVoiceCalibration(async (request) => { asked.push(request); return answering(0.1)(request); }, cases);
    expect(Object.values(asked[0].questions).map((question) => (question as { instructions?: string }).instructions)).toContain(VOICE_QUESTION);
    expect(low.rows.map((row) => [row.id, row.right])).toEqual([["v1.ooc", true], ["v2.in", false]]);
    expect(low.rows[0].detail).toMatch(/^Voice: /);
    const high = await runVoiceCalibration(answering(1.9), cases);
    expect(high.rows.map((row) => row.right)).toEqual([false, true]);
    const timedOut = await runVoiceCalibration(answering(null, "timeout"), cases);
    expect(timedOut.rows.every((row) => !row.right && row.fallback === "timeout" && row.picked === null)).toBe(true);
  });
});
