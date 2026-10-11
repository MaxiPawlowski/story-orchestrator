import { checkIdeaWarden } from "./judgeIdeasWarden";
import { defaultJudgeSettings } from "@judge/settings";
import type { WardenInput } from "@judge/warden";
import type { JudgeRuntime } from "./judge";

function harness() {
  const settings = defaultJudgeSettings();
  let owned = true;
  let fallback = false;
  const ask = jest.fn(async (_use, request) => ({ answers: fallback ? null : Object.fromEntries(Object.keys(request.questions).map((key) => [key, { type: "score", score: key === "tone" ? 0 : 0.2, confidence: 1, probabilities: {} }])) }));
  const judge = { active: (use: keyof typeof settings.uses) => settings.uses[use], ask } as unknown as JudgeRuntime;
  const input = (messageId: number, key = "chat-a"): WardenInput => ({ reply: { speaker: "Guide", text: "Nothing changes." }, facts: [], agency: null, houseRules: [], ideaScope: { key, messageId, player: "Player", intent: "Hopeful adventure.", replies: [], stillOwns: () => owned } });
  return { settings, ask, judge, input, lapse: () => { owned = false; }, fail: (value: boolean) => { fallback = value; } };
}

describe("off-path idea consumers", () => {
  test("idle needs three of four; tone five of five; adversity eighteen of twenty", async () => {
    const h = harness();
    for (let index = 1; index <= 20; index += 1) {
      const findings = await checkIdeaWarden(h.judge, h.input(index * 3));
      if (index < 4) expect(findings).toEqual([]);
      if (index === 4) expect(findings.map((row) => row.family)).toContain("idle");
      if (index === 5) expect(findings.map((row) => row.family)).toContain("tone");
      if (index < 20) expect(findings.map((row) => row.family)).not.toContain("adversity");
      if (index === 20) expect(findings.map((row) => row.family)).toContain("adversity");
    }
    expect(h.ask.mock.calls.every((call) => ["adversityTrend", "idleCheck", "toneCheck"].includes(call[0]))).toBe(true);
  });
  test("disabled uses send nothing; a missing answer never becomes a zero score", async () => {
    const h = harness();
    h.settings.uses.adversityTrend = false;
    h.settings.uses.toneCheck = false;
    h.settings.uses.idleCheck = false;
    expect(await checkIdeaWarden(h.judge, h.input(1))).toEqual([]);
    expect(h.ask).not.toHaveBeenCalled();
    h.settings.uses.idleCheck = true;
    h.fail(true);
    for (let index = 2; index < 10; index += 1) expect(await checkIdeaWarden(h.judge, h.input(index))).toEqual([]);
  });
  test("chat/revision changes reset trends; late answers write no history", async () => {
    const h = harness();
    for (let index = 1; index <= 3; index += 1) await checkIdeaWarden(h.judge, h.input(index));
    expect(await checkIdeaWarden(h.judge, h.input(4, "chat-b"))).toEqual([]);
    h.lapse();
    for (let index = 5; index < 10; index += 1) expect(await checkIdeaWarden(h.judge, h.input(index))).toEqual([]);
  });
  test("duplicate reply does not add a call or count as a new turn", async () => {
    const h = harness();
    await checkIdeaWarden(h.judge, h.input(1));
    const count = h.ask.mock.calls.length;
    expect(await checkIdeaWarden(h.judge, h.input(1))).toEqual([]);
    expect(h.ask).toHaveBeenCalledTimes(count);
  });
});
