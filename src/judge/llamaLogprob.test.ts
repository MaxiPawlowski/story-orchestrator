import { askJudge } from "./client";
import {
  answerFromDistribution, buildLlamaPrompt, createLlamaLogprobProvider, labelDistribution, LLAMA_TOP_N, questionLabels, readTopCandidates,
  type LlamaCompletionBody,
} from "./llamaLogprob";
import { choice, choiceAnswer, noul, noulAnswer, score, scoreAnswer } from "./questions";
import type { JudgeRequest } from "./types";

const logprobs = (pairs: Array<[string, number]>) => ({
  model: "artemis-31b-q4",
  tokens_evaluated: 120,
  tokens_predicted: 1,
  completion_probabilities: [{ id: 1, token: pairs[0][0], bytes: [], logprob: Math.log(pairs[0][1]), top_logprobs: pairs.map(([token, p], id) => ({ id, token, bytes: [], logprob: Math.log(p) })) }],
});

const legacy = (pairs: Array<[string, number]>) => ({
  generation_settings: { model: "legacy.gguf" },
  completion_probabilities: [{ content: pairs[0][0], probs: pairs.map(([token, p]) => ({ tok_str: token, prob: p })) }],
});

describe("llama-logprob provider: p = softmax over the answer tokens", () => {
  it("reads both llama-server response shapes (top_logprobs with logprob, legacy probs with prob)", () => {
    expect(readTopCandidates(logprobs([[" Yes", 0.6], [" No", 0.3]]))?.map((entry) => [entry.token, Number(entry.p.toFixed(6))])).toEqual([[" Yes", 0.6], [" No", 0.3]]);
    expect(readTopCandidates(legacy([["B", 0.5]]))).toEqual([{ token: "B", p: 0.5 }]);
    expect(readTopCandidates({ content: "Yes" })).toBeNull();
  });

  it("merges case and leading-space variants of a label and renormalises over the labels only", () => {
    const distribution = labelDistribution([{ token: " Yes", p: 0.5 }, { token: "yes", p: 0.1 }, { token: " No", p: 0.2 }, { token: " Maybe", p: 0.2 }], ["Yes", "No"]);
    expect(distribution?.Yes).toBeCloseTo(0.75, 10);
    expect(distribution?.No).toBeCloseTo(0.25, 10);
    expect(labelDistribution([{ token: " Maybe", p: 1 }], ["Yes", "No"])).toBeNull();
  });

  it("maps a distribution onto each System One answer type", () => {
    expect(answerFromDistribution(noul("q"), { Yes: 0.8, No: 0.2 })).toEqual({ type: "noul", noul: 0.8 });
    expect(answerFromDistribution(choice("q", { mara: null, finn: "old scholar" }), { A: 0.3, B: 0.7 })).toEqual({ type: "choice", choice: "finn", confidence: 0.7, probabilities: { mara: 0.3, finn: 0.7 } });
    const scored = answerFromDistribution(score("q", ["none", "some", "much"]), { 0: 0.2, 1: 0.3, 2: 0.5 });
    expect(scored).toMatchObject({ type: "score", confidence: 0.5, probabilities: { 0: 0.2, 1: 0.3, 2: 0.5 } });
    expect(scored.type === "score" && scored.score).toBeCloseTo(1.3, 10);
  });

  it("refuses a question it cannot label with single tokens instead of guessing", () => {
    expect(questionLabels(choice("q", Object.fromEntries(Array.from({ length: 21 }, (_, index) => [`o${index}`, null]))))).toBeNull();
    expect(questionLabels(choice("q", { a: null, b: null }))).toEqual(["A", "B"]);
    expect(questionLabels(score("q", ["a", "b", "c"]))).toEqual(["0", "1", "2"]);
  });

  it("builds a deterministic prompt that puts the shared state before the question, so llama-server reuses the cached prefix", () => {
    const state = { transcript: [{ speaker: "Max", text: "Abre la puerta." }] };
    const prompt = buildLlamaPrompt(state, choice("Who answers?", { Mara: { what: "the gate captain", not_for: "questions of lore" }, Finn: null }));
    expect(prompt).toBe(
      "You judge a story in progress. Answer only from the state below.\n\nState:\n{\"transcript\":[{\"speaker\":\"Max\",\"text\":\"Abre la puerta.\"}]}\n\n" +
      "Question: Who answers?\nOptions:\nA. Mara: the gate captain. Not for: questions of lore.\nB. Finn\nReply with the letter of one option only.\nAnswer:",
    );
    expect(buildLlamaPrompt(state, noul("Is it shut?")).startsWith(prompt.slice(0, prompt.indexOf("Question:")))).toBe(true);
  });

  it("answers a whole request through askJudge: one constrained single-token completion per question, readers unchanged", async () => {
    const bodies: LlamaCompletionBody[] = [];
    const replies = [logprobs([[" Yes", 0.72], [" No", 0.18], ["\n", 0.1]]), legacy([["B", 0.6], ["A", 0.2], ["C", 0.2]]), logprobs([["2", 0.5], ["1", 0.5]])];
    const provider = createLlamaLogprobProvider(async (body) => {
      bodies.push(body);
      return replies[bodies.length - 1];
    });
    const request: JudgeRequest = {
      state: { scene: "gate" },
      questions: { shut: noul("Is the gate shut?"), who: choice("Who?", { a: null, b: null, c: null }), how: score("How tense?", ["calm", "uneasy", "tense"]) },
    };
    const result = await askJudge(provider.ask, request, { timeoutMs: 1000 });
    expect(bodies.map((body) => [body.n_predict, body.n_probs, body.temperature, body.cache_prompt])).toEqual(Array(3).fill([1, LLAMA_TOP_N, 0, true]));
    expect(noulAnswer(result.answers ?? {}, "shut")).toBeCloseTo(0.8, 10);
    expect(choiceAnswer(result.answers ?? {}, "who")?.choice).toBe("b");
    expect(scoreAnswer(result.answers ?? {}, "how")?.score).toBeCloseTo(1.5, 10);
    expect(result.model).toBe("llama-server:artemis-31b-q4");
    expect(result.usage).toEqual({ input_tokens: 240, output_tokens: 2 });
  });

  it("leaves a question unanswered when no answer token is in the top candidates, so the use takes its fallback for it", async () => {
    const provider = createLlamaLogprobProvider(async () => logprobs([[" I", 0.9], [" The", 0.1]]));
    const result = await askJudge(provider.ask, { state: {}, questions: { shut: noul("Is it shut?") } }, { timeoutMs: 1000 });
    expect(result.answers).toEqual({});
    expect(noulAnswer(result.answers ?? {}, "shut")).toBeNull();
  });

  it("an unreachable server is an error fallback, never an answer", async () => {
    const provider = createLlamaLogprobProvider(async () => { throw new Error("llama 502"); });
    const result = await askJudge(provider.ask, { state: {}, questions: { shut: noul("Is it shut?") } }, { timeoutMs: 1000 });
    expect(result).toMatchObject({ answers: null, fallback: "error" });
  });
});
