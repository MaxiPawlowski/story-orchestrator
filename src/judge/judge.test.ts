import { readFileSync } from "node:fs";
import { join } from "node:path";
import { askJudge, JUDGE_CACHE_LIMIT, JudgeTimeoutError } from "./client";
import { buildDirectorRequest, decideDirector, directorJudgeEligible, directorRecordP, DIRECTOR_NOBODY, type JudgeDirectorInput } from "./director";
import { choice, noul, score, validateJudgeRequest } from "./questions";
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
});

describe("askJudge", () => {
  const answers = { q: { type: "noul", noul: 0.9 } as JudgeAnswer };

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

  it("chooses silence only when allowed, from either path", () => {
    const nobodyChoice = { who: { type: "choice", choice: DIRECTOR_NOBODY, confidence: 0.9, probabilities: {} } as JudgeAnswer };
    expect(decideDirector({ ...nobodyChoice, ...composite(0.1, 0.1) }, input({ allowSilence: true }))).toMatchObject({ kind: "silence", via: "choice" });
    expect(decideDirector({ ...nobodyChoice, ...composite(0.1, 0.9) }, input())).toMatchObject({ kind: "member", rosterId: "arin", via: "composite" });
    expect(decideDirector(composite(0.2, 0.3, 0.1, 0.1, 0.8), input({ allowSilence: true }))).toMatchObject({ kind: "silence", via: "composite" });
    expect(decideDirector(composite(0.2, 0.3, 0.1, 0.1, 0.8), input())).toMatchObject({ kind: "member" });
  });

  it("returns null when composite answers are missing", () => {
    expect(decideDirector({ "addr:ponticius": noulOf(0.9) }, input())).toBeNull();
  });

  it("records the probabilities the policy used", () => {
    const answers = { who: { type: "choice", choice: "Arin", confidence: 0.7, probabilities: {} } as JudgeAnswer };
    const decision = decideDirector({ ...answers, ...composite(0.1, 0.9) }, input());
    expect(directorRecordP(answers, decision)).toEqual({ who: "Arin", whoConfidence: 0.7, via: "choice", picked: "Arin" });
  });

  it("reproduces the spike's hybrid on its 26 recorded cases (real jev answers)", () => {
    const golden = JSON.parse(readFileSync(join(process.cwd(), "test/goldens/judge/director.json"), "utf8")) as {
      rows: Array<{ id: string; acceptable: string[]; input: JudgeDirectorInput; answers: Record<string, JudgeAnswer> }>;
    };
    const verdicts = golden.rows.map((row) => {
      const decision = decideDirector(row.answers, row.input);
      const name = decision?.kind === "member" ? decision.name : decision?.kind === "silence" ? "NONE" : null;
      return { id: row.id, right: name !== null && row.acceptable.includes(name) };
    });
    expect(golden.rows).toHaveLength(26);
    expect(golden.rows.every((row) => directorJudgeEligible(row.input.candidates, row.input.allowSilence))).toBe(true);
    expect(verdicts.filter((verdict) => verdict.right)).toHaveLength(24);
  });
});
