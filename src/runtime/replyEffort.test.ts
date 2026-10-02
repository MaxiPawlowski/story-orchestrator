import { parseStoryV2OrThrow, type StoryV2 } from "@engine/index";
import type { ReplyEffort } from "@utils/reasoningEffort";
import { REPLY_EFFORTS } from "@utils/replyEffort";
import {
  armFor, chatPlan, ReplyEffortOverlay, REPLY_EFFORT_BUDGETS, servesLlamaCpp, TEXTGEN_BUDGET_KEYS, textgenPlan, thoughtOpener,
  type EffortHost, type EffortRequest,
} from "./replyEffort";

const story = (reasoning: unknown = "high") => parseStoryV2OrThrow({
  format: 2,
  id: "effort-fixture",
  title: "Effort fixture",
  description: "A climax thinks harder.",
  qualities: [{ key: "arrived", type: "bool", source: "extractor", rubric: "Arrived?" }],
  checkpoints: [
    { id: "cp1", name: "The road", objective: "Walk", type: "anchor", start: true },
    { id: "cp2", name: "The climax", objective: "Fight", type: "anchor", effects: { reasoning } },
  ],
  transitions: [],
  roster: [],
} as unknown as StoryV2);

const GEMMA = { prefix: "<|channel>thought\n", suffix: "<channel|>" };
const LLAMA_MODELS = [{ id: "artemis.gguf", owned_by: "llamacpp" }];

const host = (patch: Partial<EffortHost> = {}): EffortHost => ({ template: GEMMA, models: LLAMA_MODELS, parse: (text) => JSON.parse(text), ...patch });

const loud = (patch: Partial<EffortRequest> = {}): EffortRequest => ({ api: "textgen", chatId: "chat-a", checkpointId: "cp1", type: null, dryRun: false, open: true, innermost: "normal", ...patch });

const tcPayload = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  prompt: "<|turn>user\nGo on.<turn|>\n<|turn>model\nDalan:<|channel>thought\n",
  api_type: "llamacpp",
  api_server: "http://127.0.0.1:18080",
  temperature: 1,
  max_new_tokens: 1400,
  ...extra,
});

const ccPayload = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: "normal",
  messages: [{ role: "user", content: "hi" }],
  model: "artemis.gguf",
  chat_completion_source: "custom",
  include_reasoning: true,
  custom_include_body: "",
  max_tokens: 1400,
  ...extra,
});

const overlayAt = (level: ReplyEffort, source: "install" | "checkpoint" = "install") => {
  const overlay = new ReplyEffortOverlay();
  overlay.sync({ chatId: "chat-a", checkpointId: "cp1", level, source });
  return overlay;
};

const budgetKeys = (payload: Record<string, unknown>) => TEXTGEN_BUDGET_KEYS.filter((key) => key in payload);

describe("reply effort: the measured levels (15-model-config 2026-10-02)", () => {
  it("off is budget 1 (0 is broken), low 128, medium 400, high sends no budget", () => {
    expect(REPLY_EFFORT_BUDGETS).toEqual({ off: 1, low: 128, medium: 400 });
    expect(REPLY_EFFORTS).toEqual(["off", "low", "medium", "high"]);
  });
});

describe("reply effort: llama.cpp Text Completion, per level", () => {
  it.each([["off", 1], ["low", 128], ["medium", 400]] as const)("%s sets all five budget keys with budget %d", (level, budget) => {
    const payload = tcPayload();
    const shot = overlayAt(level).apply(payload, loud(), host());
    expect(shot).toMatchObject({ level, api: "textgen", backend: "llamacpp", budget, idle: null, unsupported: null, set: [...TEXTGEN_BUDGET_KEYS] });
    expect(payload).toMatchObject({
      reasoning_budget_tokens: budget,
      reasoning_budget_start_tag: "<|channel>thought",
      reasoning_budget_end_tags: ["<channel|>"],
      reasoning_budget_message: "",
      generation_prompt: "<|channel>thought\n",
    });
  });

  it("high adds no budget key, and says so", () => {
    const payload = tcPayload();
    const before = { ...payload };
    const shot = overlayAt("high").apply(payload, loud(), host());
    expect(shot).toMatchObject({ level: "high", backend: "llamacpp", budget: null, set: [], idle: null, unsupported: null });
    expect(payload).toEqual(before);
  });

  it("only the five named keys are ever added; nothing the request carries is changed", () => {
    const payload = tcPayload();
    const before = { ...payload };
    overlayAt("medium").apply(payload, loud(), host());
    const added = Object.keys(payload).filter((key) => !(key in before));
    expect(added.sort()).toEqual([...TEXTGEN_BUDGET_KEYS].sort());
    for (const key of Object.keys(before)) expect(payload[key]).toEqual(before[key]);
  });

  it("a prompt whose opener lost its trailing newline still caps, with that opener as the generation prompt", () => {
    const plan = textgenPlan(tcPayload({ prompt: "Dalan:<|channel>thought" }), "medium", GEMMA);
    expect(plan.values).toMatchObject({ reasoning_budget_start_tag: "<|channel>thought", generation_prompt: "<|channel>thought" });
  });
});

describe("reply effort: never on a setup that does not think", () => {
  it.each([
    ["the empty thought channel (thinking off)", "<|turn>model\n<|channel>thought\n<channel|>"],
    ["a plain prompt", "<|turn>model\nDalan:"],
  ])("%s: no keys, recorded as idle", (_label, prompt) => {
    const payload = tcPayload({ prompt });
    const shot = overlayAt("medium").apply(payload, loud(), host());
    expect(budgetKeys(payload)).toEqual([]);
    expect(shot).toMatchObject({ set: [], idle: "the prompt does not open a thought", unsupported: null });
  });

  it("no reasoning template, or an empty one: no keys", () => {
    for (const template of [null, { prefix: "", suffix: "" }, { prefix: "<|channel>thought\n", suffix: "" }]) {
      const payload = tcPayload();
      overlayAt("off").apply(payload, loud(), host({ template }));
      expect(budgetKeys(payload)).toEqual([]);
    }
  });

  it("thoughtOpener reads only the prompt's tail", () => {
    expect(thoughtOpener("x<|channel>thought\n", GEMMA)).toBe("<|channel>thought\n");
    expect(thoughtOpener("<|channel>thought\nlater text", GEMMA)).toBeNull();
    expect(thoughtOpener(undefined, GEMMA)).toBeNull();
  });

  it("CC: a request that asks for no reasoning, or a profile that switches thinking off, is left alone", () => {
    const quietReasoning = ccPayload({ include_reasoning: false });
    const before = { ...quietReasoning };
    expect(overlayAt("medium").apply(quietReasoning, loud({ api: "chat", type: "normal" }), host())).toMatchObject({ idle: "the request does not ask for reasoning", set: [] });
    expect(quietReasoning).toEqual(before);
    const off = ccPayload({ custom_include_body: JSON.stringify({ chat_template_kwargs: { enable_thinking: false } }) });
    const offBefore = { ...off };
    expect(overlayAt("high").apply(off, loud({ api: "chat", type: "normal" }), host())).toMatchObject({ idle: "the profile switches thinking off" });
    expect(off).toEqual(offBefore);
  });
});

describe("reply effort: other backends are refused with a reason", () => {
  it.each(["koboldcpp", "ooba", "tabby", null])("Text Completion %s with a thinking prompt: nothing sent, refused", (apiType) => {
    const payload = tcPayload({ api_type: apiType });
    const before = { ...payload };
    const shot = overlayAt("medium").apply(payload, loud(), host());
    expect(payload).toEqual(before);
    expect(shot?.unsupported).toMatch(/only llama\.cpp does/);
    expect(shot?.set).toEqual([]);
  });

  it.each(["openrouter", "openai", "makersuite", "claude"])("Chat Completion %s: nothing sent, refused", (source) => {
    const payload = ccPayload({ chat_completion_source: source });
    const before = { ...payload };
    const shot = overlayAt("low").apply(payload, loud({ api: "chat", type: "normal" }), host());
    expect(payload).toEqual(before);
    expect(shot?.unsupported).toBe(`${source} is not llama-server; no reasoning budget is sent`);
  });

  it("a custom endpoint whose model list is not llama.cpp, or is empty, is refused", () => {
    for (const models of [[{ id: "artemis.gguf", owned_by: "vllm" }], []]) {
      const payload = ccPayload();
      const before = { ...payload };
      expect(overlayAt("medium").apply(payload, loud({ api: "chat", type: "normal" }), host({ models }))?.unsupported).toBe("the custom endpoint does not list llama.cpp models");
      expect(payload).toEqual(before);
    }
  });

  it("servesLlamaCpp reads the named model, else the whole list", () => {
    expect(servesLlamaCpp([{ id: "a", owned_by: "llamacpp" }, { id: "b", owned_by: "openai" }], "a")).toBe(true);
    expect(servesLlamaCpp([{ id: "a", owned_by: "llamacpp" }, { id: "b", owned_by: "openai" }], "c")).toBe(false);
    expect(servesLlamaCpp([{ id: "a", owned_by: "llamacpp" }], "")).toBe(true);
  });
});

describe("reply effort: llama-server Chat Completion (custom source), per level", () => {
  const body = (payload: Record<string, unknown>) => JSON.parse(String(payload.custom_include_body));

  it.each([["low", 128], ["medium", 400]] as const)("%s: thinking on with thinking_budget_tokens %d, merged into the profile's own body", (level, budget) => {
    const payload = ccPayload({ custom_include_body: JSON.stringify({ min_p: 0.05, chat_template_kwargs: { keep: 1 } }) });
    const shot = overlayAt(level).apply(payload, loud({ api: "chat", type: "normal" }), host());
    expect(shot).toMatchObject({ backend: "custom", budget, set: ["custom_include_body", "include_reasoning"], unsupported: null });
    expect(body(payload)).toEqual({ min_p: 0.05, chat_template_kwargs: { keep: 1, enable_thinking: true }, thinking_budget_tokens: budget });
    expect(payload.include_reasoning).toBe(true);
  });

  it("high: thinking on, no budget", () => {
    const payload = ccPayload();
    overlayAt("high").apply(payload, loud({ api: "chat", type: "normal" }), host());
    expect(body(payload)).toEqual({ chat_template_kwargs: { enable_thinking: true } });
  });

  it("off: thinking off and reasoning not requested, no budget", () => {
    const payload = ccPayload();
    overlayAt("off").apply(payload, loud({ api: "chat", type: "normal" }), host());
    expect(body(payload)).toEqual({ chat_template_kwargs: { enable_thinking: false } });
    expect(payload.include_reasoning).toBe(false);
  });

  it("an unreadable body is left alone and refused", () => {
    const payload = ccPayload({ custom_include_body: "{not json" });
    const plan = chatPlan(payload, "medium", host({ parse: () => undefined }));
    expect(plan.unsupported).toMatch(/could not be read/);
  });
});

describe("reply effort: loud requests only", () => {
  it.each([
    ["a dry run", loud({ dryRun: true })],
    ["no open generation", loud({ open: false })],
    ["a quiet request (the memory model's CM call is typed quiet)", loud({ api: "chat", type: "quiet" })],
    ["a quiet run nested in a loud one", loud({ innermost: "quiet" })],
    ["an impersonation", loud({ innermost: "impersonate" })],
    ["another chat", loud({ chatId: "chat-b" })],
    ["another checkpoint", loud({ checkpointId: "cp2" })],
  ])("%s: untouched", (_label, request) => {
    const payload = request.api === "chat" ? ccPayload() : tcPayload();
    const before = { ...payload };
    expect(overlayAt("medium").apply(payload, request, host())).toBeNull();
    expect(payload).toEqual(before);
  });
});

describe("reply effort: the install default and the checkpoint override", () => {
  const target = { storyChat: "chat-a", checkpointId: "cp2", story: story("high"), fallback: "medium" as ReplyEffort, checkpointOverride: true };

  it("a checkpoint that declares a level overrides the install default", () => {
    expect(armFor(target)).toEqual({ chatId: "chat-a", checkpointId: "cp2", level: "high", source: "checkpoint" });
  });

  it("a checkpoint that declares nothing takes the install default", () => {
    expect(armFor({ ...target, checkpointId: "cp1" })).toEqual({ chatId: "chat-a", checkpointId: "cp1", level: "medium", source: "install" });
  });

  it("with the override off the authored level is ignored", () => {
    expect(armFor({ ...target, checkpointOverride: false })).toMatchObject({ level: "medium", source: "install" });
  });

  it("no story chat or no story: nothing is armed", () => {
    expect(armFor({ ...target, storyChat: null })).toBeNull();
    expect(armFor({ ...target, story: null })).toBeNull();
  });

  it("the overridden level reaches the request", () => {
    const overlay = new ReplyEffortOverlay();
    overlay.sync(armFor({ ...target, story: story("low") }));
    const payload = tcPayload();
    expect(overlay.apply(payload, loud({ checkpointId: "cp2" }), host())).toMatchObject({ level: "low", source: "checkpoint", budget: 128 });
    expect(payload.reasoning_budget_tokens).toBe(128);
  });

  it("a new arm resets the counters; the same arm keeps them", () => {
    const overlay = overlayAt("medium");
    overlay.apply(tcPayload(), loud(), host());
    overlay.sync({ chatId: "chat-a", checkpointId: "cp1", level: "medium", source: "install" });
    expect(overlay.view()?.applied).toBe(1);
    overlay.sync({ chatId: "chat-a", checkpointId: "cp1", level: "low", source: "install" });
    expect(overlay.view()).toMatchObject({ level: "low", applied: 0, last: null });
  });
});
