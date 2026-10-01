jest.mock("@services/STAPI", () => ({ observeSamplerPayloads: () => () => undefined, parseHostYaml: () => undefined }));

import { parseStoryV2OrThrow, type StoryV2 } from "@engine/index";
import type { SamplerPayloadHandlers } from "@services/STAPI";
import type { GenerationLifecycleSnapshot } from "../generationLifecycle";
import { REASONING_SHOT_RING, startReasoningEffect, type ReasoningEffectDebug } from "./reasoningEffectHost";

const story = parseStoryV2OrThrow({
  format: 2,
  id: "r4-host",
  title: "R4 host",
  description: "Climax.",
  qualities: [{ key: "arrived", type: "bool", source: "extractor", rubric: "Arrived?" }],
  checkpoints: [
    { id: "cp1", name: "The road", objective: "Walk", type: "anchor", start: true },
    { id: "cp2", name: "The climax", objective: "Fight", type: "anchor", effects: { reasoning: "high" } },
  ],
  transitions: [],
  roster: [],
} as unknown as StoryV2);

const idle = { outermost: null, nested: [], awaitingRender: null, draftedChid: null, openedCount: 0 } as GenerationLifecycleSnapshot;
const open = (type: string, nested: string[] = []): GenerationLifecycleSnapshot => ({ outermost: { type, watermark: 3 }, nested, awaitingRender: null, draftedChid: null, openedCount: 1 });

const payload = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({ type: "normal", chat_completion_source: "openrouter", reasoning_effort: undefined, include_reasoning: false, ...extra });

function wire() {
  const state = { enabled: true, storyChat: "chat-a" as string | null, openChat: "chat-a" as string | null, checkpoint: "cp2" as string | null, generation: open("normal"), notes: [] as string[], stops: 0, unpublished: 0 };
  let handlers: SamplerPayloadHandlers | null = null;
  let debug: ReasoningEffectDebug | null = null;
  const dispose = startReasoningEffect({
    enabled: () => state.enabled,
    storyChat: () => state.storyChat,
    openChat: () => state.openChat,
    checkpointId: () => state.checkpoint,
    story: () => story,
    generation: () => state.generation,
    journal: (summary) => { state.notes.push(summary); },
    now: () => 7,
    parse: (text) => JSON.parse(text),
    observe: (next) => { handlers = next; return () => { state.stops += 1; }; },
    publish: (part) => { debug = part.reasoningEffect; return () => { state.unpublished += 1; }; },
  });
  return { state, dispose, chat: (body: Record<string, unknown>) => handlers?.chat(body), textgen: (body: Record<string, unknown>, dry = false) => handlers?.textgen(body, dry), debug: () => debug as unknown as ReasoningEffectDebug };
}

describe("R4 spike host: the overlay hook, synced per request", () => {
  it("a loud chat request at the climax gets the level, journaled once, recorded each time", () => {
    const { state, chat, debug } = wire();
    const first = payload();
    const second = payload();
    chat(first);
    chat(second);
    expect([first.reasoning_effort, second.reasoning_effort]).toEqual(["high", "high"]);
    expect(state.notes).toEqual(['Reasoning effect "high" applied to this checkpoint\'s replies (spike)']);
    expect(debug().shots()).toHaveLength(2);
    expect(debug().shots()[0]).toMatchObject({ at: 7, chatId: "chat-a", checkpointId: "cp2", type: "normal", applied: ["reasoning_effort", "include_reasoning"] });
  });

  it("flag off = nothing written, nothing recorded", () => {
    const { state, chat, debug } = wire();
    state.enabled = false;
    const body = payload();
    chat(body);
    expect(body.reasoning_effort).toBeUndefined();
    expect(debug().shots()).toEqual([]);
    expect(debug().view()).toBeNull();
    expect(state.notes).toEqual([]);
  });

  it("switching the flag off mid-checkpoint disarms on the next request", () => {
    const { state, chat, debug } = wire();
    chat(payload());
    state.enabled = false;
    const body = payload();
    chat(body);
    expect(body.reasoning_effort).toBeUndefined();
    expect(debug().shots()).toHaveLength(1);
  });

  it("leaving the checkpoint disarms on the next request", () => {
    const { state, chat, debug } = wire();
    chat(payload());
    state.checkpoint = "cp1";
    const body = payload();
    chat(body);
    expect(body.reasoning_effort).toBeUndefined();
    expect(debug().view()).toBeNull();
  });

  it("an open chat that is not the story's chat is untouched", () => {
    const { state, chat } = wire();
    state.openChat = "chat-b";
    const body = payload();
    chat(body);
    expect(body.reasoning_effort).toBeUndefined();
  });

  it("a quiet or impersonate run is untouched; control: loud is written", () => {
    const { state, chat } = wire();
    for (const generation of [open("quiet"), open("normal", ["impersonate"]), idle]) {
      state.generation = generation;
      const body = payload();
      chat(body);
      expect(body.reasoning_effort).toBeUndefined();
    }
    const quietType = payload({ type: "quiet" });
    state.generation = open("normal");
    chat(quietType);
    expect(quietType.reasoning_effort).toBeUndefined();
    const control = payload();
    chat(control);
    expect(control.reasoning_effort).toBe("high");
  });

  it("a Text Completion request is recorded as refused and left alone", () => {
    const { state, textgen, debug } = wire();
    const body = { prompt: "x", temperature: 1 };
    textgen(body);
    expect(body).toEqual({ prompt: "x", temperature: 1 });
    expect(debug().shots()[0].unsupported).toBe("Text Completion sends a raw prompt");
    expect(state.notes).toEqual(['Reasoning effect "high" could not be applied to this checkpoint\'s replies (spike)']);
  });

  it("the shot ring is capped, and dispose stops the hook and unpublishes", () => {
    const { state, chat, debug, dispose } = wire();
    for (let index = 0; index < REASONING_SHOT_RING + 5; index += 1) chat(payload());
    expect(debug().shots()).toHaveLength(REASONING_SHOT_RING);
    dispose();
    expect([state.stops, state.unpublished]).toEqual([1, 1]);
  });
});
