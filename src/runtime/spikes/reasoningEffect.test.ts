import { parseStoryV2OrThrow, type CheckpointReasoning, type StoryV2 } from "@engine/index";
import { armFor, ReasoningEffect, routeFromPayload, type ReasoningRequest } from "./reasoningEffect";

const story = (reasoning: unknown = "high") => parseStoryV2OrThrow({
  format: 2,
  id: "r4-fixture",
  title: "R4 fixture",
  description: "A climax thinks harder.",
  qualities: [{ key: "arrived", type: "bool", source: "extractor", rubric: "Arrived?" }],
  checkpoints: [
    { id: "cp1", name: "The road", objective: "Walk", type: "anchor", start: true },
    { id: "cp2", name: "The climax", objective: "Fight", type: "anchor", effects: { reasoning } },
  ],
  transitions: [],
  roster: [],
} as unknown as StoryV2);

const loud = (patch: Partial<ReasoningRequest> = {}): ReasoningRequest => ({ api: "chat", chatId: "chat-a", checkpointId: "cp2", type: "normal", dryRun: false, open: true, innermost: "normal", ...patch });

const yaml = (text: string): unknown => {
  try { return JSON.parse(text); } catch { return undefined; }
};

const ccPayload = (source: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: "normal",
  messages: [{ role: "user", content: "hi" }],
  model: "m",
  temperature: 1,
  max_tokens: 300,
  stream: true,
  chat_completion_source: source,
  include_reasoning: false,
  reasoning_effort: undefined,
  ...extra,
});

const armed = (level: CheckpointReasoning = "high") => {
  const effect = new ReasoningEffect();
  effect.sync({ chatId: "chat-a", checkpointId: "cp2", level });
  return effect;
};

const untouched = (payload: Record<string, unknown>, before: Record<string, unknown>, keys: string[]) => {
  const strip = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
  expect(strip(payload)).toEqual(strip(before));
};

describe("R4 spike: effects.reasoning arms per chat + checkpoint", () => {
  it("arms only with the flag on, a story chat, and a checkpoint that declares a level", () => {
    const parsed = story();
    expect(armFor({ enabled: true, chatId: "chat-a", checkpointId: "cp2", story: parsed })).toEqual({ chatId: "chat-a", checkpointId: "cp2", level: "high" });
    expect(armFor({ enabled: false, chatId: "chat-a", checkpointId: "cp2", story: parsed })).toBeNull();
    expect(armFor({ enabled: true, chatId: "chat-a", checkpointId: "cp1", story: parsed })).toBeNull();
    expect(armFor({ enabled: true, chatId: null, checkpointId: "cp2", story: parsed })).toBeNull();
    expect(armFor({ enabled: true, chatId: "chat-a", checkpointId: "cp2", story: null })).toBeNull();
  });

  it("the parse normalizes the level, so a cased value arms as the canonical one", () => {
    expect(armFor({ enabled: true, chatId: "chat-a", checkpointId: "cp2", story: story(" High ") })?.level).toBe("high");
  });

  it("a fresh arm resets the counters; the same arm keeps them", () => {
    const effect = armed();
    effect.apply(ccPayload("openrouter"), loud(), yaml);
    effect.sync({ chatId: "chat-a", checkpointId: "cp2", level: "high" });
    expect(effect.view()?.applied).toBe(1);
    effect.sync({ chatId: "chat-a", checkpointId: "cp2", level: "low" });
    expect(effect.view()).toMatchObject({ level: "low", applied: 0, last: null });
  });
});

describe("R4 spike: mapping per source x level", () => {
  const LEVELS: CheckpointReasoning[] = ["off", "low", "medium", "high"];

  it.each(LEVELS)("openrouter %s", (level) => {
    const payload = ccPayload("openrouter");
    const before = { ...payload };
    const shot = armed(level).apply(payload, loud(), yaml);
    expect(shot).toMatchObject({ source: "openrouter", unsupported: null, applied: ["reasoning_effort", "include_reasoning"], skipped: [] });
    expect(payload.reasoning_effort).toBe(level === "off" ? "none" : level);
    expect(payload.include_reasoning).toBe(level !== "off");
    untouched(payload, before, ["reasoning_effort", "include_reasoning"]);
  });

  it.each(LEVELS)("makersuite %s", (level) => {
    const payload = ccPayload("makersuite", { model: "gemini-2.5-pro" });
    armed(level).apply(payload, loud(), yaml);
    expect(payload.reasoning_effort).toBe(level === "off" ? "min" : level);
  });

  it.each(LEVELS)("openai %s: levels apply, off is refused and writes nothing", (level) => {
    const payload = ccPayload("openai", { model: "gpt-5" });
    const before = { ...payload };
    const shot = armed(level).apply(payload, loud(), yaml);
    if (level === "off") {
      expect(shot).toMatchObject({ unsupported: "openai cannot switch it off", applied: [] });
      expect(payload).toEqual(before);
    } else {
      expect(payload.reasoning_effort).toBe(level);
    }
  });

  it.each(LEVELS)("custom %s merges chat_template_kwargs into the request's own body (F4)", (level) => {
    const body = JSON.stringify({ top_n_sigma: 1, chat_template_kwargs: { keep: "me", enable_thinking: level === "off" } });
    const payload = ccPayload("custom", { custom_include_body: body });
    const before = { ...payload };
    const shot = armed(level).apply(payload, loud(), yaml);
    expect(shot).toMatchObject({ source: "custom", unsupported: null, collapsed: level !== "off", applied: ["custom_include_body", "include_reasoning"] });
    expect(JSON.parse(String(payload.custom_include_body))).toEqual({ top_n_sigma: 1, chat_template_kwargs: { keep: "me", enable_thinking: level !== "off" } });
    expect(payload.reasoning_effort).toBeUndefined();
    untouched(payload, before, ["custom_include_body", "include_reasoning"]);
  });

  it("custom with an empty body still sets enable_thinking", () => {
    const payload = ccPayload("custom", { custom_include_body: "" });
    armed("high").apply(payload, loud(), yaml);
    expect(JSON.parse(String(payload.custom_include_body))).toEqual({ chat_template_kwargs: { enable_thinking: true } });
  });

  it("custom with a body the host cannot parse is left alone, never replaced", () => {
    const payload = ccPayload("custom", { custom_include_body: "{not: [valid" });
    const shot = armed("high").apply(payload, loud(), yaml);
    expect(shot?.unsupported).toMatch(/could not be read/);
    expect(payload.custom_include_body).toBe("{not: [valid");
    expect(payload.include_reasoning).toBe(false);
  });

  it("control: a parsable body is read through the injected parser", () => {
    expect(routeFromPayload(ccPayload("custom", { custom_include_body: '{"a":1}' }), yaml)).toMatchObject({ includeBody: { a: 1 } });
  });

  it("an unmapped source and a Text Completion request are refused with a reason and untouched", () => {
    const payload = ccPayload("mistralai");
    const before = { ...payload };
    expect(armed().apply(payload, loud(), yaml)?.unsupported).toBe("mistralai is not mapped");
    expect(payload).toEqual(before);
    const textgen = { prompt: "x", temperature: 1 };
    expect(armed().apply(textgen, loud({ api: "textgen" }), yaml)?.unsupported).toBe("Text Completion sends a raw prompt");
    expect(textgen).toEqual({ prompt: "x", temperature: 1 });
  });
});

describe("R4 spike: only loud requests, only keys the request carries", () => {
  it.each([
    ["quiet", loud({ type: "quiet" })],
    ["impersonate", loud({ type: "impersonate" })],
    ["a quiet run nested in a loud one", loud({ innermost: "quiet" })],
    ["a dry run", loud({ dryRun: true })],
    ["no open generation", loud({ open: false })],
  ])("%s is untouched", (_label, request) => {
    const payload = ccPayload("openrouter");
    const before = { ...payload };
    expect(armed().apply(payload, request, yaml)).toBeNull();
    expect(payload).toEqual(before);
  });

  it("control: the same payload on a loud request is written", () => {
    const payload = ccPayload("openrouter");
    expect(armed().apply(payload, loud(), yaml)?.applied.length).toBe(2);
  });

  it("a key the request does not carry is skipped, never added", () => {
    const payload = ccPayload("openrouter");
    delete payload.include_reasoning;
    const shot = armed().apply(payload, loud(), yaml);
    expect(shot).toMatchObject({ applied: ["reasoning_effort"], skipped: ["include_reasoning"] });
    expect("include_reasoning" in payload).toBe(false);
  });
});

describe("R4 spike: disarm on leaving the checkpoint or the chat", () => {
  it("a request from another chat is untouched", () => {
    const payload = ccPayload("openrouter");
    expect(armed().apply(payload, loud({ chatId: "chat-b" }), yaml)).toBeNull();
    expect(payload.reasoning_effort).toBeUndefined();
  });

  it("a request at another checkpoint is untouched even before a re-sync", () => {
    const payload = ccPayload("openrouter");
    expect(armed().apply(payload, loud({ checkpointId: "cp1" }), yaml)).toBeNull();
    expect(payload.reasoning_effort).toBeUndefined();
  });

  it("syncing to no arm (flag off, checkpoint left) disarms", () => {
    const effect = armed();
    effect.sync(armFor({ enabled: true, chatId: "chat-a", checkpointId: "cp1", story: story() }));
    const payload = ccPayload("openrouter");
    expect(effect.apply(payload, loud({ checkpointId: "cp1" }), yaml)).toBeNull();
    expect(effect.view()).toBeNull();
    effect.sync({ chatId: "chat-a", checkpointId: "cp2", level: "high" });
    effect.sync(armFor({ enabled: false, chatId: "chat-a", checkpointId: "cp2", story: story() }));
    expect(effect.apply(payload, loud(), yaml)).toBeNull();
    expect(payload.reasoning_effort).toBeUndefined();
  });
});
