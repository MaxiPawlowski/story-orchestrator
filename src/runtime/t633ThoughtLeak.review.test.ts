jest.mock("@services/STAPI", () => ({ observeSamplerPayloads: () => () => undefined, parseHostYaml: () => undefined }));
jest.mock("@services/stHost/llamaCpp", () => ({ readThinkingTemplate: () => null, listedModels: () => [] }));

import { parseStoryV2OrThrow, type StoryV2 } from "@engine/index";
import type { SamplerPayloadHandlers } from "@services/STAPI";
import type { GenerationLifecycleSnapshot } from "./generationLifecycle";
import { REASONING_BUDGET_MESSAGE, textgenPlan } from "./replyEffort";
import { startReplyEffort, type ReplyText } from "./replyEffortHost";
import { repairThoughtLeak } from "./thoughtLeak";

const GEMMA = { prefix: "<|channel>thought\n", suffix: "<channel|>" };
const THOUGHT = "*   Speech: one line.\n    *   Exact formatting: \"";
const LEAKED = "\"line\", *action*\n    *   No lines for the player.<channel|>*The clerk bolts the door.* \"Sit.\"";

describe("T6-3-3 HIGH: a budget-cut thought ends on a closing line, not mid-sentence", () => {
  it("low and medium force a closing message before the end tag; off keeps the measured empty message", () => {
    const tc = (level: "off" | "low" | "medium") => textgenPlan({ prompt: "Dalan:<|channel>thought\n", api_type: "llamacpp" }, level, GEMMA).values;
    expect(tc("medium").reasoning_budget_message).toBe(REASONING_BUDGET_MESSAGE);
    expect(tc("low").reasoning_budget_message).toBe(REASONING_BUDGET_MESSAGE);
    expect(tc("off").reasoning_budget_message).toBe("");
    expect(REASONING_BUDGET_MESSAGE.trim()).not.toBe("");
    expect(REASONING_BUDGET_MESSAGE).not.toContain("<channel|>");
  });
});

describe("T6-3-3 HIGH: a thought that runs past its budget is moved out of the visible reply", () => {
  it("moves the text before the leaked end tag back into the reasoning", () => {
    expect(repairThoughtLeak(LEAKED, THOUGHT, "<channel|>")).toEqual({
      mes: "*The clerk bolts the door.* \"Sit.\"",
      reasoning: `${THOUGHT}"line", *action*\n    *   No lines for the player.`,
    });
  });

  it("leaves a clean reply, a reply with no parsed thought, and a reply that is nothing but thought", () => {
    expect(repairThoughtLeak("*The clerk bolts the door.*", THOUGHT, "<channel|>")).toBeNull();
    expect(repairThoughtLeak(LEAKED, "", "<channel|>")).toBeNull();
    expect(repairThoughtLeak("still planning<channel|>  ", THOUGHT, "<channel|>")).toBeNull();
    expect(repairThoughtLeak(LEAKED, THOUGHT, "  ")).toBeNull();
  });
});

const story = parseStoryV2OrThrow({
  format: 2, id: "leak", title: "Leak", description: "",
  qualities: [{ key: "arrived", type: "bool", source: "extractor", rubric: "Arrived?" }],
  checkpoints: [{ id: "cp1", name: "The road", objective: "Walk", type: "anchor", start: true }],
  transitions: [], roster: [],
} as unknown as StoryV2);

const loud: GenerationLifecycleSnapshot = { outermost: { type: "normal", watermark: 3 }, nested: [], awaitingRender: null, draftedChid: null, openedCount: 1 };

function wire(effort: "medium" | "high" = "medium") {
  const state = { openChat: "chat-a", notes: [] as Array<[string, string]>, writes: [] as Array<[number, { mes: string; reasoning: string }]>, chat: new Map<number, ReplyText>() };
  let handlers: SamplerPayloadHandlers | null = null;
  let received: ((messageId: number) => void) | null = null;
  startReplyEffort({
    effort: () => effort,
    checkpointOverride: () => false,
    storyChat: () => "chat-a",
    openChat: () => state.openChat,
    checkpointId: () => "cp1",
    story: () => story,
    generation: () => loud,
    journal: (summary, note) => { state.notes.push([summary, note]); },
    host: () => ({ template: GEMMA, models: [], parse: (text) => JSON.parse(text) }),
    observe: (next) => { handlers = next; return () => undefined; },
    publish: () => () => undefined,
    replies: {
      observe: (handler) => { received = handler; return () => undefined; },
      read: (messageId) => state.chat.get(messageId) ?? null,
      write: (messageId, text) => { state.writes.push([messageId, text]); return { ok: true }; },
    },
  });
  return {
    state,
    request: () => handlers?.textgen({ prompt: "Dalan:<|channel>thought\n", api_type: "llamacpp" }, false),
    receive: (messageId: number, text: ReplyText) => { state.chat.set(messageId, text); received?.(messageId); },
  };
}

describe("T6-3-3 HIGH: the reply-effort host repairs a leaked thought after a budgeted reply", () => {
  it("rewrites the rendered reply and journals it once per message", () => {
    const { state, request, receive } = wire();
    request();
    receive(14, { mes: LEAKED, reasoning: THOUGHT, isUser: false });
    expect(state.writes).toEqual([[14, { mes: "*The clerk bolts the door.* \"Sit.\"", reasoning: `${THOUGHT}"line", *action*\n    *   No lines for the player.` }]]);
    expect(state.notes.at(-1)?.[0]).toBe("A reply's thinking ran past its budget; the leaked planning was moved back into the thought");
  });

  it("controls: a user line, a clean reply, another chat and a reply with no budget sent are left alone", () => {
    const { state, request, receive } = wire();
    receive(3, { mes: LEAKED, reasoning: THOUGHT, isUser: false });
    request();
    receive(4, { mes: LEAKED, reasoning: THOUGHT, isUser: true });
    receive(5, { mes: "*The clerk bolts the door.*", reasoning: THOUGHT, isUser: false });
    state.openChat = "chat-b";
    receive(6, { mes: LEAKED, reasoning: THOUGHT, isUser: false });
    expect(state.writes).toEqual([]);
    const high = wire("high");
    high.request();
    high.receive(7, { mes: LEAKED, reasoning: THOUGHT, isUser: false });
    expect(high.state.writes).toEqual([]);
  });
});
