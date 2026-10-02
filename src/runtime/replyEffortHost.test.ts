jest.mock("@services/STAPI", () => ({ observeSamplerPayloads: () => () => undefined, parseHostYaml: () => undefined }));
jest.mock("@services/stHost/llamaCpp", () => ({ readThinkingTemplate: () => null, listedModels: () => [] }));

import { parseStoryV2OrThrow, type StoryV2 } from "@engine/index";
import type { SamplerPayloadHandlers } from "@services/STAPI";
import type { ReplyEffort } from "@utils/reasoningEffort";
import type { GenerationLifecycleSnapshot } from "./generationLifecycle";
import { EFFORT_SHOT_RING, startReplyEffort, type EffortDebug } from "./replyEffortHost";

const story = parseStoryV2OrThrow({
  format: 2,
  id: "effort-host",
  title: "Effort host",
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

const tc = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({ prompt: "Dalan:<|channel>thought\n", api_type: "llamacpp", ...extra });

function wire(effort: ReplyEffort | undefined = undefined) {
  const state = {
    effort, override: false, storyChat: "chat-a" as string | null, openChat: "chat-a" as string | null, checkpoint: "cp1" as string | null,
    generation: open("normal"), notes: [] as Array<[string, string]>, stops: 0, unpublished: 0,
  };
  let handlers: SamplerPayloadHandlers | null = null;
  let debug: EffortDebug | null = null;
  const dispose = startReplyEffort({
    effort: () => state.effort,
    checkpointOverride: () => state.override,
    storyChat: () => state.storyChat,
    openChat: () => state.openChat,
    checkpointId: () => state.checkpoint,
    story: () => story,
    generation: () => state.generation,
    journal: (summary, note) => { state.notes.push([summary, note]); },
    now: () => 7,
    host: () => ({ template: { prefix: "<|channel>thought\n", suffix: "<channel|>" }, models: [{ id: "m", owned_by: "llamacpp" }], parse: (text) => JSON.parse(text) }),
    observe: (next) => { handlers = next; return () => { state.stops += 1; }; },
    publish: (part) => { debug = part; return () => { state.unpublished += 1; }; },
  });
  return {
    state, dispose,
    textgen: (body: Record<string, unknown>, dry = false) => handlers?.textgen(body, dry),
    chat: (body: Record<string, unknown>) => handlers?.chat(body),
    debug: () => debug as unknown as EffortDebug,
  };
}

describe("reply effort host: the overlay hook, synced per request", () => {
  it("with no setting the install default is medium: budget 400 on a loud thinking request", () => {
    const { textgen, debug } = wire();
    const body = tc();
    textgen(body);
    expect(body.reasoning_budget_tokens).toBe(400);
    expect(debug().shots()[0]).toMatchObject({ at: 7, chatId: "chat-a", checkpointId: "cp1", level: "medium", source: "install", budget: 400 });
  });

  it("journals the first application of an arm, not every request, and again when the outcome changes", () => {
    const { state, textgen } = wire("low");
    textgen(tc());
    textgen(tc());
    expect(state.notes).toEqual([['Reply thinking "low" (the install-wide setting) applied to the replies',
      "backend llamacpp; budget 128; set reasoning_budget_tokens, reasoning_budget_start_tag, reasoning_budget_end_tags, reasoning_budget_message, generation_prompt"]]);
    textgen(tc({ api_type: "koboldcpp" }));
    expect(state.notes[1][0]).toBe('Reply thinking "low" (the install-wide setting) could not be applied');
    expect(state.notes[1][1]).toMatch(/only llama\.cpp does/);
  });

  it("a non-thinking prompt is recorded but never journaled", () => {
    const { state, textgen, debug } = wire();
    const body = tc({ prompt: "Dalan:" });
    textgen(body);
    expect(body.reasoning_budget_tokens).toBeUndefined();
    expect(debug().shots()[0].idle).toBe("the prompt does not open a thought");
    expect(state.notes).toEqual([]);
  });

  it("the checkpoint level overrides the setting only while the override is on", () => {
    const { state, textgen } = wire("medium");
    state.checkpoint = "cp2";
    const before = tc();
    textgen(before);
    expect(before.reasoning_budget_tokens).toBe(400);
    state.override = true;
    const after = tc();
    textgen(after);
    expect(after.reasoning_budget_tokens).toBeUndefined();
    expect(state.notes[state.notes.length - 1][0]).toBe('Reply thinking "high" (this checkpoint\'s setting) applied to the replies');
  });

  it("quiet, impersonate, dry and idle requests are untouched; control: loud is written", () => {
    const { state, textgen, chat } = wire();
    for (const generation of [open("quiet"), open("normal", ["impersonate"]), open("normal", ["quiet"]), idle]) {
      state.generation = generation;
      const body = tc();
      textgen(body);
      expect(body.reasoning_budget_tokens).toBeUndefined();
    }
    state.generation = open("normal");
    const dry = tc();
    textgen(dry, true);
    expect(dry.reasoning_budget_tokens).toBeUndefined();
    const memoryCall = { type: "quiet", chat_completion_source: "custom", model: "m", include_reasoning: true, custom_include_body: "" };
    chat(memoryCall);
    expect(memoryCall.custom_include_body).toBe("");
    const control = tc();
    textgen(control);
    expect(control.reasoning_budget_tokens).toBe(400);
  });

  it("a chat that does not play the story is untouched", () => {
    const { state, textgen } = wire();
    state.openChat = "chat-b";
    const body = tc();
    textgen(body);
    expect(body.reasoning_budget_tokens).toBeUndefined();
    state.openChat = "chat-a";
    state.storyChat = null;
    const unloaded = tc();
    textgen(unloaded);
    expect(unloaded.reasoning_budget_tokens).toBeUndefined();
  });

  it("the shot ring is capped, and dispose stops the hook and unpublishes", () => {
    const { state, textgen, debug, dispose } = wire();
    for (let index = 0; index < EFFORT_SHOT_RING + 5; index += 1) textgen(tc());
    expect(debug().shots()).toHaveLength(EFFORT_SHOT_RING);
    dispose();
    expect([state.stops, state.unpublished]).toEqual([1, 1]);
  });
});
