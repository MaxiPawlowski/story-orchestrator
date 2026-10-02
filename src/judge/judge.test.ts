import { readFileSync } from "node:fs";
import { join } from "node:path";
import { askJudge, JUDGE_CACHE_LIMIT, JudgeTimeoutError } from "./client";
import { buildDirectorRequest, decideDirector, directorJudgeEligible, directorRecordP, DIRECTOR_NOBODY, type JudgeDirectorInput } from "./director";
import { choice, estimateJudgeTokens, estimateJudgeTotalTokens, judgeShapeIssues, noul, score, validateJudgeRequest } from "./questions";
import { JudgePluginError } from "./gate";
import { JUDGE_CHARS_PER_TOKEN, JUDGE_MAX_ESTIMATED_TOKENS, JUDGE_MAX_ESTIMATED_TOTAL_TOKENS, JUDGE_MAX_REQUEST_CHARS } from "./types";
import { JUDGE_CALL_RING_LIMIT } from "./policy";
import { runJudgeDirectorSelfTest, runMemoryPairsCalibration, runMemoryVerifyCalibration } from "./selfTest";
import { buildPairRequest, buildVerifyRequest, pairDecision, PAIR_SAME_THING_CRITERIA, verifyVerdict, VERIFY_CRITERIA, type JudgePairRelation } from "./memory";
import { JUDGE_SELF_TEST_CASES } from "./selfTestCases";
import { appendJudgeCall, createJudgeRuntime, defaultJudgeSettings, dropJudgeCallsAfter, JUDGE_USE_KEYS, JUDGE_USES_OFF_BY_DEFAULT, judgeUseActive, sanitizeJudgeRuntime, sanitizeJudgeSettings } from "./settings";
import type { JudgeAnswer, JudgeRequest, JudgeResponse, JudgeTransport } from "./types";

const request = (overrides: Partial<JudgeRequest> = {}): JudgeRequest => ({
  state: { transcript: [{ speaker: "Max", text: "hello" }] },
  questions: { q: noul("Is `transcript` a greeting?") },
  ...overrides,
});

const respond = (answers: Record<string, JudgeAnswer>): JudgeResponse => ({ model: "jev-1.13.0", answers });

describe("validateJudgeRequest", () => {
  it("accepts well-formed questions of every type", () => {
    expect(validateJudgeRequest(request({ questions: {
      a: noul("x?", { true: "yes", false: "no" }),
      b: choice("pick", { one: null, two: "second" }),
      c: score("rate", ["low", "mid", "high"]),
    } }))).toEqual([]);
  });

  it("rejects the shapes the API refuses", () => {
    const issues = validateJudgeRequest(request({ questions: {
      a: choice("pick", { only: null }),
      b: score("rate", ["one"]),
      c: { type: "noul", instructions: "x", criteria: { true: "y", false: "n", maybe: "m" } as never },
      d: noul("  "),
    } }));
    expect(issues).toEqual([
      "a: choice needs 2-255 options (has 1)",
      "b: score needs 2-10 levels (has 1)",
      "c: noul criteria only takes true/false (got maybe)",
      "d: missing instructions",
    ]);
    expect(validateJudgeRequest(request({ questions: {} }))).toEqual(["questions is empty"]);
  });

  it("T25: refuses a request whose estimated state + longest question tokens pass the documented limit minus 10%, under the character cap", () => {
    expect(JUDGE_MAX_ESTIMATED_TOKENS).toBe(28800);
    expect(JUDGE_CHARS_PER_TOKEN).toBe(3.488);
    const over = request({ state: { text: "a ".repeat(55_000) } });
    expect(JSON.stringify(over).length).toBeLessThan(JUDGE_MAX_REQUEST_CHARS);
    expect(estimateJudgeTokens(over)).toBeGreaterThan(JUDGE_MAX_ESTIMATED_TOKENS);
    expect(validateJudgeRequest(over)).toEqual([`request is over ${JUDGE_MAX_ESTIMATED_TOKENS} estimated tokens (${estimateJudgeTokens(over)})`]);
    expect(validateJudgeRequest(request({ state: { text: "x".repeat(100_000) } }))).toEqual([]);
  });

  it("T25: counts the longest question once, not every question, as the documented limit does", () => {
    const questions = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`fact:${index}`, noul(`Does \`reply\` contradict fact ${index}? ${"detail ".repeat(120)}`)]));
    const many = request({ state: { text: "x".repeat(95_000) }, questions });
    expect(validateJudgeRequest(many)).toEqual([]);
    const longest = Math.max(...Object.values(questions).map((question) => JSON.stringify(question).length));
    expect(estimateJudgeTokens(many)).toBe(Math.ceil((JSON.stringify(many.state).length + longest) / JUDGE_CHARS_PER_TOKEN));
  });

  it("2026-10-02: the whole request (state + every question) is held to the documented 64,000 tokens minus 10%", () => {
    expect(JUDGE_MAX_ESTIMATED_TOTAL_TOKENS).toBe(57600);
    const questions = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`fact:${index}`, noul(`fact ${index} ${"x".repeat(4_000)}`)]));
    const wide = request({ state: { text: "y".repeat(60_000) }, questions });
    expect(estimateJudgeTokens(wide)).toBeLessThanOrEqual(JUDGE_MAX_ESTIMATED_TOKENS);
    expect(judgeShapeIssues(wide)).toEqual([]);
    expect(validateJudgeRequest(wide)).toEqual([`request is over ${JUDGE_MAX_ESTIMATED_TOTAL_TOKENS} estimated tokens in total (${estimateJudgeTotalTokens(wide)})`]);
    expect(validateJudgeRequest(request({ state: { text: "y".repeat(60_000) }, questions: Object.fromEntries(Object.entries(questions).slice(0, 20)) }))).toEqual([]);
  });
});

describe("askJudge", () => {
  const answers = { q: { type: "noul", noul: 0.9 } as JudgeAnswer };

  it("T25: never sends a request past the token guard, and never truncates it to fit: the fallback says too-large, not invalid", async () => {
    const transport = jest.fn<ReturnType<JudgeTransport>, Parameters<JudgeTransport>>();
    const over = request({ state: { text: "a ".repeat(55_000) } });
    const result = await askJudge(transport, over, { timeoutMs: 1000 });
    expect(transport).not.toHaveBeenCalled();
    expect(result).toMatchObject({ answers: null, fallback: "too-large", cached: false, latencyMs: 0, stateChars: JSON.stringify(over.state).length, questionCount: 1 });
    const questions = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`fact:${index}`, noul(`fact ${index} ${"x".repeat(4_000)}`)]));
    expect(await askJudge(transport, request({ state: { text: "y".repeat(60_000) }, questions }), { timeoutMs: 1000 })).toMatchObject({ answers: null, fallback: "too-large" });
    expect(transport).not.toHaveBeenCalled();
    expect(await askJudge(transport, request({ questions: {} }), { timeoutMs: 1000 })).toMatchObject({ fallback: "invalid" });
  });

  it("2026-10-02: a 413 from the plugin (its own size guard) is read as too-large", async () => {
    const transport = jest.fn<ReturnType<JudgeTransport>, Parameters<JudgeTransport>>().mockRejectedValue(new JudgePluginError(413));
    expect(await askJudge(transport, request(), { timeoutMs: 1000 })).toMatchObject({ answers: null, fallback: "too-large", cached: false });
  });

  it("T6-4: hands the use to the transport, so the plugin can count served calls per use", async () => {
    const transport = jest.fn<ReturnType<JudgeTransport>, Parameters<JudgeTransport>>().mockResolvedValue(respond(answers));
    await askJudge(transport, request(), { timeoutMs: 1000, use: "warden" });
    expect(transport.mock.calls[0][1]).toEqual({ timeoutMs: 1000, use: "warden" });
  });

  it("returns answers and the answering model, and serves a repeat from the cache", async () => {
    const transport = jest.fn<ReturnType<JudgeTransport>, Parameters<JudgeTransport>>().mockResolvedValue(respond(answers));
    const cache = new Map<string, JudgeResponse>();
    let clock = 1000;
    const first = await askJudge(transport, request(), { timeoutMs: 500, cache, now: () => (clock += 40) });
    expect(first).toMatchObject({ answers, model: "jev-1.13.0", latencyMs: 40, questionCount: 1, cached: false });
    expect(first.fallback).toBeUndefined();
    const second = await askJudge(transport, request(), { timeoutMs: 500, cache });
    expect(second).toMatchObject({ answers, cached: true, latencyMs: 0 });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("never calls the transport for an invalid request", async () => {
    const transport = jest.fn<ReturnType<JudgeTransport>, Parameters<JudgeTransport>>();
    const result = await askJudge(transport, request({ questions: { q: choice("pick", { only: null }) } }), { timeoutMs: 500 });
    expect(result).toMatchObject({ answers: null, fallback: "invalid" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("falls back on timeout, transport errors and malformed responses", async () => {
    const hang: JudgeTransport = () => new Promise(() => undefined);
    expect(await askJudge(hang, request(), { timeoutMs: 10 })).toMatchObject({ answers: null, fallback: "timeout" });
    const aborted: JudgeTransport = () => Promise.reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    expect(await askJudge(aborted, request(), { timeoutMs: 500 })).toMatchObject({ fallback: "timeout" });
    const timedOut: JudgeTransport = () => Promise.reject(new JudgeTimeoutError());
    expect(await askJudge(timedOut, request(), { timeoutMs: 500 })).toMatchObject({ fallback: "timeout" });
    const broken: JudgeTransport = () => Promise.reject(new Error("409 not configured"));
    expect(await askJudge(broken, request(), { timeoutMs: 500 })).toMatchObject({ fallback: "error" });
    const malformed: JudgeTransport = () => Promise.resolve({ model: "x" } as unknown as JudgeResponse);
    expect(await askJudge(malformed, request(), { timeoutMs: 500 })).toMatchObject({ fallback: "error" });
  });

  it("bounds the session cache", async () => {
    const transport: JudgeTransport = () => Promise.resolve(respond(answers));
    const cache = new Map<string, JudgeResponse>();
    for (let index = 0; index < JUDGE_CACHE_LIMIT + 5; index += 1) {
      await askJudge(transport, request({ state: { index } }), { timeoutMs: 500, cache });
    }
    expect(cache.size).toBe(JUDGE_CACHE_LIMIT);
  });
});

const input = (overrides: Partial<JudgeDirectorInput> = {}): JudgeDirectorInput => ({
  checkpointName: "The Guild Hall",
  objective: "Accept the job",
  player: "Max",
  candidates: [
    { rosterId: "ponticius", name: "Ponticius", role: "guild quartermaster" },
    { rosterId: "arin", name: "Arin", role: "Max's partner" },
  ],
  allowSilence: false,
  window: [{ speaker: "Max", text: "Ponticius, what does it pay?" }],
  ...overrides,
});

describe("directorJudgeEligible", () => {
  it("needs two options, every candidate with a role, and unambiguous names", () => {
    const [first] = input().candidates;
    expect(directorJudgeEligible(input().candidates, false)).toBe(true);
    expect(directorJudgeEligible([first], false)).toBe(false);
    expect(directorJudgeEligible([first], true)).toBe(true);
    expect(directorJudgeEligible([...input().candidates, { rosterId: "x", name: "X" }], false)).toBe(false);
    expect(directorJudgeEligible([...input().candidates, { rosterId: "x", name: "X", role: "  " }], false)).toBe(false);
    expect(directorJudgeEligible([...input().candidates, { rosterId: "p2", name: "ponticius", role: "twin" }], false)).toBe(false);
    expect(directorJudgeEligible([...input().candidates, { rosterId: "n", name: "Nobody", role: "ghost" }], false)).toBe(false);
  });
});

describe("buildDirectorRequest", () => {
  it("keeps the spike's measured state shape and question set", () => {
    const built = buildDirectorRequest(input({ lead: "Arin", instruction: "Keep it tense", allowSilence: true }));
    expect(built.state).toEqual({
      scene: { name: "The Guild Hall", goal: "Accept the job", author_guidance: "Keep it tense" },
      player: "Max",
      transcript: [{ speaker: "Max", text: "Ponticius, what does it pay?" }],
    });
    expect(Object.keys(built.questions).sort()).toEqual(["addr:arin", "addr:ponticius", "nobody", "reason:arin", "reason:ponticius", "who"]);
    const who = built.questions.who;
    expect(who.type).toBe("choice");
    expect(who.type === "choice" && who.criteria).toEqual({ Ponticius: "guild quartermaster", Arin: "Max's partner", [DIRECTOR_NOBODY]: "No character should respond right now" });
    expect(who.instructions).toContain("prefer Arin, the scene lead.");
    expect(who.instructions).toContain("Author guidance: Keep it tense");
    expect(built.questions["addr:arin"].instructions).toBe("Is the latest message in `transcript` directed at Arin (Max's partner), by name, title, role or context?");
    expect(validateJudgeRequest(built)).toEqual([]);
  });

  it("offers silence only when the checkpoint allows it", () => {
    const who = buildDirectorRequest(input()).questions.who;
    expect(who.type === "choice" && Object.keys(who.criteria)).toEqual(["Ponticius", "Arin"]);
  });
});

describe("decideDirector", () => {
  const noulOf = (value: number): JudgeAnswer => ({ type: "noul", noul: value });
  const composite = (addrP: number, addrA: number, reasonP = 0.5, reasonA = 0.5, nobody = 0.1): Record<string, JudgeAnswer> => ({
    "addr:ponticius": noulOf(addrP), "addr:arin": noulOf(addrA), "reason:ponticius": noulOf(reasonP), "reason:arin": noulOf(reasonA), nobody: noulOf(nobody),
  });

  it("takes a confident role choice", () => {
    const answers = { who: { type: "choice", choice: "Ponticius", confidence: 0.8, probabilities: {} } as JudgeAnswer, ...composite(0.1, 0.9) };
    expect(decideDirector(answers, input())).toEqual({ kind: "member", rosterId: "ponticius", name: "Ponticius", confidence: 0.8, via: "choice" });
  });

  it("falls to the composite below the confidence floor, with the lead bonus in code", () => {
    const answers = { who: { type: "choice", choice: "Ponticius", confidence: 0.4, probabilities: {} } as JudgeAnswer, ...composite(0.5, 0.5, 0.5, 0.5) };
    expect(decideDirector(answers, input({ lead: "Arin" }))).toMatchObject({ kind: "member", rosterId: "arin", via: "composite" });
  });

  it("T1: gives the lead no bonus when a character just spoke and there is no scene work", () => {
    const answers = { who: { type: "choice", choice: "Ponticius", confidence: 0.4, probabilities: {} } as JudgeAnswer, ...composite(0.5, 0.5, 0.6, 0.5) };
    expect(decideDirector(answers, input({ lead: "Arin" }))).toMatchObject({ kind: "member", rosterId: "arin", via: "composite" });
    expect(decideDirector(answers, input({ lead: "Arin", sceneWork: false }))).toMatchObject({ kind: "member", rosterId: "ponticius", via: "composite" });
    const who = buildDirectorRequest(input({ lead: "Arin", sceneWork: false })).questions.who;
    expect(who.instructions).not.toContain("prefer Arin");
    expect(who.instructions).toContain("do not pick Arin to fill the pause");
    expect(buildDirectorRequest(input({ lead: "Arin" }))).toEqual(buildDirectorRequest(input({ lead: "Arin", sceneWork: true })));
  });

  it("chooses silence only when allowed, from either path", () => {
    const nobodyChoice = { who: { type: "choice", choice: DIRECTOR_NOBODY, confidence: 0.9, probabilities: {} } as JudgeAnswer };
    expect(decideDirector({ ...nobodyChoice, ...composite(0.1, 0.1) }, input({ allowSilence: true }))).toMatchObject({ kind: "silence", via: "choice" });
    expect(decideDirector({ ...nobodyChoice, ...composite(0.1, 0.9) }, input())).toMatchObject({ kind: "member", rosterId: "arin", via: "composite" });
    expect(decideDirector(composite(0.2, 0.3, 0.1, 0.1, 0.8), input({ allowSilence: true }))).toMatchObject({ kind: "silence", via: "composite" });
    expect(decideDirector(composite(0.2, 0.3, 0.1, 0.1, 0.8), input())).toMatchObject({ kind: "member" });
  });

  it("T0-2: a chained turn does not hand back to the player past a character the latest message addresses", () => {
    const handback = { handback: noulOf(0.8) };
    expect(decideDirector({ ...composite(0.1, 0.9), ...handback }, input({ allowHandBack: true }))).toMatchObject({ kind: "member", rosterId: "arin", via: "composite" });
    expect(decideDirector({ ...composite(0.1, 0.2), ...handback }, input({ allowHandBack: true }))).toMatchObject({ kind: "player", via: "composite" });
  });

  it("returns null when composite answers are missing", () => {
    expect(decideDirector({ "addr:ponticius": noulOf(0.9) }, input())).toBeNull();
  });

  it("records the probabilities the policy used", () => {
    const answers = { who: { type: "choice", choice: "Arin", confidence: 0.7, probabilities: {} } as JudgeAnswer };
    const decision = decideDirector({ ...answers, ...composite(0.1, 0.9) }, input());
    expect(directorRecordP(answers, decision)).toEqual({ who: "Arin", whoConfidence: 0.7, via: "choice", picked: "Arin" });
  });

  it("reproduces the spike's hybrid on its 25 recorded cases (real jev answers; D15 left with W25)", () => {
    const golden = JSON.parse(readFileSync(join(process.cwd(), "test/goldens/judge/director.json"), "utf8")) as {
      rows: Array<{ id: string; acceptable: string[]; input: JudgeDirectorInput; answers: Record<string, JudgeAnswer> }>;
    };
    const verdicts = golden.rows.map((row) => {
      const decision = decideDirector(row.answers, row.input);
      const name = decision?.kind === "member" ? decision.name : decision?.kind === "silence" ? "NONE" : null;
      return { id: row.id, right: name !== null && row.acceptable.includes(name) };
    });
    expect(golden.rows).toHaveLength(25);
    expect(golden.rows.every((row) => directorJudgeEligible(row.input.candidates, row.input.allowSilence))).toBe(true);
    expect(verdicts.filter((verdict) => verdict.right)).toHaveLength(23);
  });
});

describe("judge settings", () => {
  it("enables shipped uses by default except those below their floor, and keeps the judge configurable", () => {
    const defaults = defaultJudgeSettings();
    expect(defaults.enabled).toBe(true);
    expect(JUDGE_USES_OFF_BY_DEFAULT).toEqual(["houseRules"]);
    expect(JUDGE_USE_KEYS.filter((key) => defaults.uses[key] !== true)).toEqual(["houseRules"]);
    expect(sanitizeJudgeSettings({ ...defaults, uses: { ...defaults.uses, houseRules: true } }).uses.houseRules).toBe(true);
    expect(defaults.expansion).toEqual({ variants: 1, temperature: 0.7, pick: "code" });
    expect(defaults.model).toBe("jev-1.13.0");
  });

  it("sanitizes stored values and ignores unknown keys", () => {
    const sanitized = sanitizeJudgeSettings({ enabled: "yes", model: "  ", timeoutMs: 99_999, uses: { director: true, bogus: true, memoryVerify: "true" }, expansion: { variants: 5, temperature: 3, pick: "llm" } });
    expect(sanitized.enabled).toBe(true);
    expect(sanitized.model).toBe("jev-1.13.0");
    expect(sanitized.timeoutMs).toBe(1500);
    expect(sanitized.uses.director).toBe(true);
    expect(sanitized.uses.memoryVerify).toBe(true);
    expect(Object.keys(sanitized.uses)).toEqual([...JUDGE_USE_KEYS]);
    expect(sanitized.expansion).toEqual({ variants: 1, temperature: 0.7, pick: "llm" });
    expect(sanitizeJudgeSettings(null)).toEqual(defaultJudgeSettings());
  });

  it("needs the master switch, the usage and its dependency", () => {
    const on = sanitizeJudgeSettings({ enabled: true, uses: { director: true, expansionLookahead: true, lookahead: false } });
    expect(judgeUseActive(on, "director")).toBe(true);
    expect(judgeUseActive(on, "expansionLookahead")).toBe(false);
    expect(judgeUseActive({ ...on, uses: { ...on.uses, lookahead: true } }, "expansionLookahead")).toBe(true);
    expect(judgeUseActive({ ...on, enabled: false }, "director")).toBe(false);
  });

  it("L5: loreExclusive is on by default, its own switch, and needs loreSelect", () => {
    expect(defaultJudgeSettings().uses.loreExclusive).toBe(true);
    const exclusive = sanitizeJudgeSettings({ enabled: true, uses: { loreExclusive: true, loreSelect: false } });
    expect(judgeUseActive(exclusive, "loreExclusive")).toBe(false);
    expect(judgeUseActive({ ...exclusive, uses: { ...exclusive.uses, loreSelect: true } }, "loreExclusive")).toBe(true);
    expect(judgeUseActive(sanitizeJudgeSettings({ enabled: true, uses: { loreSelect: true, loreExclusive: false } }), "loreExclusive")).toBe(false);
  });

  it("keeps a bounded call ring and drops records past a rollback point", () => {
    let state = createJudgeRuntime();
    for (let index = 0; index < JUDGE_CALL_RING_LIMIT + 3; index += 1) {
      state = appendJudgeCall(state, { at: "2026-09-19T00:00:00.000Z", boundary: index, messageId: index, use: "director", model: "jev", latencyMs: 1, stateChars: 1, questionCount: 1 });
    }
    expect(state.calls).toHaveLength(JUDGE_CALL_RING_LIMIT);
    expect(dropJudgeCallsAfter(state, 100).calls.every((entry) => entry.messageId < 100)).toBe(true);
    expect(sanitizeJudgeRuntime({ calls: [{ nope: 1 }, state.calls[0]] }).calls).toEqual([state.calls[0]]);
    expect(sanitizeJudgeRuntime(undefined)).toEqual({ calls: [], scene: null, meter: { calls: 0, cachedCalls: 0, inputTokens: 0, outputTokens: 0, cost: 0 } });
  });

  it("keeps the scene read across appends, and drops it on a rollback at or before its message (v2.2 plan 03)", () => {
    const scene = { at: "2026-09-19T00:00:00.000Z", boundary: 2, messageId: 7, model: "jev", facts: { location: "hall", time: null, present: [], headingTo: [] } };
    const state = appendJudgeCall({ ...createJudgeRuntime(), scene }, { at: "2026-09-19T00:00:00.000Z", boundary: 2, messageId: 7, use: "scene", model: "jev", latencyMs: 1, stateChars: 1, questionCount: 1 });
    expect(state.scene).toEqual(scene);
    expect(dropJudgeCallsAfter(state, 8).scene).toEqual(scene);
    expect(dropJudgeCallsAfter(state, 7).scene).toBeNull();
    expect(sanitizeJudgeRuntime({ calls: [], scene }).scene).toEqual(scene);
    expect(sanitizeJudgeRuntime({ calls: [], scene: { messageId: "x" } }).scene).toBeNull();
  });
});

describe("runJudgeDirectorSelfTest", () => {
  it("scores the bundled cases against their labels, silence included, and reports p50 over real calls only", async () => {
    const report = await runJudgeDirectorSelfTest(async (request) => {
      const who = request.questions.who;
      const names = who.type === "choice" ? Object.keys(who.criteria) : [];
      const choiceName = names.includes(DIRECTOR_NOBODY) ? DIRECTOR_NOBODY : names[0];
      return { answers: { who: { type: "choice", choice: choiceName, confidence: 0.9, probabilities: {} } }, model: "jev-1.13.0", latencyMs: 250, stateChars: 10, questionCount: 1, cached: false };
    });
    expect(report.total).toBe(JUDGE_SELF_TEST_CASES.length);
    expect(report.model).toBe("jev-1.13.0");
    expect(report.p50LatencyMs).toBe(250);
    expect(report.rows.find((row) => row.id === "D08")).toMatchObject({ picked: DIRECTOR_NOBODY, right: true });
  });

  it("counts a fallback as wrong and leaves it out of the latency", async () => {
    const report = await runJudgeDirectorSelfTest(async () => ({ answers: null, model: null, latencyMs: 0, stateChars: 0, questionCount: 0, fallback: "unavailable", cached: false }));
    expect(report.right).toBe(0);
    expect(report.p50LatencyMs).toBeNull();
    expect(report.rows.every((row) => row.fallback === "unavailable")).toBe(true);
  });

  it("bundles eligible cases only", () => {
    expect(JUDGE_SELF_TEST_CASES.every((entry) => directorJudgeEligible(entry.input.candidates, entry.input.allowSilence))).toBe(true);
  });
});

describe("memory questions and policy (v2.2 plan 02)", () => {
  const readJson = (name: string) => JSON.parse(readFileSync(join(process.cwd(), "test/goldens/judge", name), "utf8"));

  it("builds the spike's verify and pair questions", () => {
    const verify = buildVerifyRequest({ storyTitle: "Sun Ruins", cast: ["Arin"], transcript: [{ id: "msg_1", speaker: "Arin", text: "hi" }], lines: ["Arin says hi."] });
    expect(verify.state).toEqual({ story: { title: "Sun Ruins", cast: ["Arin"] }, transcript: [{ id: "msg_1", speaker: "Arin", text: "hi" }] });
    expect(verify.questions["line:0"]).toEqual({ type: "noul", instructions: 'Is this note supported by `transcript`: "Arin says hi."? Use `story` only as background for names and places.', criteria: { ...VERIFY_CRITERIA } });
    const pair = buildPairRequest("old", "new");
    expect(pair.state).toEqual({ older_note: "old", newer_note: "new" });
    expect(pair.questions.relation.type === "choice" && Object.keys(pair.questions.relation.criteria)).toEqual(["duplicate", "update", "distinct", "unrelated"]);
    expect(pair.questions.same_thing).toEqual({ type: "noul", instructions: expect.stringContaining("one and the same person, object or place"), criteria: { ...PAIR_SAME_THING_CRITERIA } });
    expect(validateJudgeRequest(verify)).toEqual([]);
    expect(validateJudgeRequest(pair)).toEqual([]);
  });

  it("drops below 0.2, down-weights below 0.5, keeps the rest, and keeps on no answer", () => {
    expect(verifyVerdict(0.1)).toEqual({ action: "drop" });
    expect(verifyVerdict(0.3)).toEqual({ action: "downweight", confidence: 0.3 });
    expect(verifyVerdict(0.8)).toEqual({ action: "keep" });
    expect(verifyVerdict(null)).toEqual({ action: "keep" });
  });

  const replay = (name: string) => {
    const golden = readJson(name) as { model: string; calls: Array<{ state: unknown; questions: unknown; answers: Record<string, JudgeAnswer> }> };
    const byRequest = new Map(golden.calls.map((call) => [JSON.stringify([call.state, call.questions]), call.answers]));
    return async (request: JudgeRequest) => ({ answers: byRequest.get(JSON.stringify([request.state, request.questions])) ?? null, model: golden.model, latencyMs: 0, stateChars: 0, questionCount: Object.keys(request.questions).length, cached: false });
  };
  const fixture = (name: string) => JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/judge", name), "utf8")).rows;

  it("on 36 labelled lines (real answers, production shape): no supported line lost but one, every unsupported one dropped", async () => {
    const report = await runMemoryVerifyCalibration(replay("memory-verify.json"), fixture("memory-verify.json"));
    const rows = fixture("memory-verify.json") as Array<{ id: string; supported: boolean }>;
    const supported = new Set(rows.filter((row) => row.supported).map((row) => row.id));
    expect(report.total).toBe(36);
    expect(report.rows.filter((row) => row.picked === null)).toEqual([]);
    expect(report.rows.filter((row) => !row.right && supported.has(row.id)).map((row) => row.id)).toEqual(["H32.0"]);
    expect(report.rows.filter((row) => !row.right && !supported.has(row.id))).toEqual([]);
  });

  it("on 29 tuning pairs (real answers): 27 right, and never supersedes or drops a note about something else", async () => {
    const report = await runMemoryPairsCalibration(replay("memory-pairs.json"), fixture("memory-pairs.json"));
    const labels = new Map((fixture("memory-pairs.json") as Array<{ id: string; label: JudgePairRelation }>).map((row) => [row.id, row.label]));
    expect([report.right, report.total]).toEqual([27, 29]);
    expect(report.rows.filter((row) => !row.right).map((row) => row.id)).toEqual(["M13", "M17"]);
    expect(report.rows.filter((row) => ["duplicate", "update"].includes(row.picked ?? "") && ["distinct", "unrelated"].includes(labels.get(row.id) ?? ""))).toEqual([]);
  });

  it("on 11 held-out pairs, never used to tune the question (real answers): all right", async () => {
    const report = await runMemoryPairsCalibration(replay("memory-pairs-holdout.json"), fixture("memory-pairs-holdout.json"));
    expect([report.right, report.total]).toEqual([11, 11]);
  });

  it("keeps a pair Jev thinks is about two different things, whatever the relation; the confidence floor still applies otherwise", () => {
    expect(pairDecision({ relation: "update", confidence: 0.97, sameThing: 0.37 })).toBe("distinct");
    expect(pairDecision({ relation: "duplicate", confidence: 0.99, sameThing: 0.1 })).toBe("distinct");
    expect(pairDecision({ relation: "unrelated", confidence: 0.3, sameThing: 0.01 })).toBe("unrelated");
    expect(pairDecision({ relation: "duplicate", confidence: 0.53, sameThing: 0.74 })).toBeNull();
    expect(pairDecision({ relation: "update", confidence: 0.97, sameThing: 0.76 })).toBe("update");
    expect(pairDecision({ relation: "update", confidence: 0.97, sameThing: null })).toBe("update");
  });
});
