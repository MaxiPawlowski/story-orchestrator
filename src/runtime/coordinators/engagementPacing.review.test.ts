import { parseStoryOrThrow, pullStage, openStretch, type EngineState, type NormalizedStory } from "@engine/index";
import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import { AFTERMATH_LINE, stuckInfoLine } from "@pacing/engagement";
import { OPEN_STRETCH_LINE, stuckLeadLine } from "@pacing/index";
import type { PromptHost } from "../hostPorts";
import type { TensionRuntimeState } from "../types";
import type { EngagementSignals } from "../engagementSignals";
import { PacingCoordinator } from "./pacingCoordinator";

const KEY = INJECTION_REGISTRY.checkpointGuidance.key;
const ARRIVE = { q: "reached_walls", op: "==", v: true };
const LEADS = ["a carter mentions a shortcut", "a gate bell rings ahead"];

const raw = (road: Record<string, unknown>) => ({
  id: "road", title: "Road", description: "",
  qualities: [
    { key: "reached_walls", type: "bool", source: "extractor", rubric: "The party reached the walls." },
    { key: "left_camp", type: "bool", source: "extractor", rubric: "The party left camp." },
  ],
  checkpoints: [
    { id: "camp", name: "Camp", objective: "Break camp.", type: "anchor", start: true },
    { id: "road", name: "On the road", objective: "Reach the walls.", type: "intermediate", ...road },
    { id: "walls", name: "The walls", objective: "Arrive.", type: "anchor" },
  ],
  transitions: [
    { from: "camp", to: "road", priority: 1, gate: { q: "left_camp", op: "==", v: true } },
    { from: "road", to: "walls", priority: 1, gate: ARRIVE },
  ],
  roster: [],
});

const open = parseStoryOrThrow(raw({ stretch: { mode: "open", pace: "brief", max_turns: 8, arrive_when: ARRIVE } }));
const gated = parseStoryOrThrow(raw({ leads: LEADS }));

const strongTurns = (() => {
  const stretch = openStretch(open.checkpointById.road)!;
  for (let turns = 1; turns < 60; turns += 1) if (pullStage(stretch, turns) === "strong") return turns;
  throw new Error("no strong stage");
})();

type Row = { is_user: boolean; mes: string };

const chatOf = (turns: number, last = "I walk on."): Row[] => [
  { is_user: true, mes: "Let's go." }, { is_user: false, mes: "A reply." },
  ...Array.from({ length: turns }, (_, index) => [{ is_user: true, mes: index === turns - 1 ? last : "I walk on." }, { is_user: false, mes: "A reply." }]).flat(),
];

const state = (lastMessageId: number): EngineState => ({
  blackboard: { values: {}, versions: {}, latched: {} } as unknown as EngineState["blackboard"],
  activeCheckpointId: "road", visitedAnchors: ["camp"], visitedPath: ["camp", "road"], boundary: 12, checkpointStartedBoundary: 0,
  checkpointStartedAt: 0, checkpointStartedMessageId: 1, lastMessageId, chatLength: lastMessageId + 1,
});

const guidance = (story: NormalizedStory, chat: Row[], on: boolean, signals: Partial<EngagementSignals> = {}) => {
  const blocks = new Map<string, string>();
  const prompt = {
    setStoryExtensionPrompt: (key: string, value: string) => { blocks.set(key, value); },
    clearStoryExtensionPrompt: (key: string) => { blocks.delete(key); },
  } as unknown as PromptHost;
  let tension: TensionRuntimeState = { levels: [], smoothed: null, history: [] };
  const lastId = chat.length - 1;
  const pacing = new PacingCoordinator({
    getStory: () => story,
    getState: () => state(lastId),
    getStateLog: () => chat.flatMap((row, id) => (row.is_user ? [] : [{ context: { lastMessageId: id }, before: { blackboard: { values: {} } }, after: { blackboard: { values: {} } } } as never])),
    getTensionTarget: () => undefined,
    getTension: () => tension,
    setTension: (next) => { tension = next; },
    getPacing: () => ({ alpha: 0.5, shapeOverride: null, hintEnabled: false }),
    hosts: { prompt, chat: { chatRows: () => chat } },
    stuckLadder: () => true,
    engagement: () => on,
    engagementSignals: () => ({ memoryIds: [lastId - 1], relationEvents: [], ...signals }),
  });
  pacing.updateSteering();
  return { text: blocks.get(KEY) ?? "", reading: pacing.engagement() };
};

describe("v3.0 52: the pull answers why an open stretch is quiet", () => {
  const chat = chatOf(strongTurns);

  it("control: switched off, the strong stage still invents urgency", () => {
    expect(guidance(open, chat, false).text).toMatch(/as a deadline or someone urging/);
  });

  it("D floor: on, the strong stage comes only from the authored turn limit and says so, never someone urging", () => {
    const { text } = guidance(open, chat, true);
    expect(text).toMatch(/the time to move on is running out/);
    expect(text).not.toMatch(/someone urging/);
    expect(guidance(open, chatOf(strongTurns - 1), true).text).not.toMatch(/press toward|running out|someone urging/);
  });

  it("a crossed pressure gives the strong pull its label and shows its consequence", () => {
    const { text, reading } = guidance(open, chat, true, { pressures: [{ label: "The flood", messageId: chat.length - 2, cue: "the ford is closing" }] });
    expect(reading?.kind).toBe("pressure-advancing");
    expect(text).toMatch(/Let The flood press toward the next place/);
    expect(text).toMatch(/The flood has moved on\..*the ford is closing/);
  });

  it("a relationship scene holds the pull: the open stretch line alone, no hook", () => {
    const { text, reading } = guidance(open, chat, true, { relationEvents: [chat.length - 2] });
    expect(reading?.kind).toBe("exploring-relationship");
    expect(text).toContain(OPEN_STRETCH_LINE);
    expect(text).not.toMatch(/hook|press toward/);
  });

  it("an aftermath holds the pull and asks for reaction and recovery", () => {
    const { text } = guidance(open, chat, true, { resolutions: [chat.length - 1] });
    expect(text).toContain(AFTERMATH_LINE);
    expect(text).not.toMatch(/hook|press toward/);
  });
});

describe("v3.0 52: the stuck ladder answers why a gated scene is quiet", () => {
  const turns = 7;

  it("control: switched off, the first rung is today's lead as world pressure", () => {
    expect(guidance(gated, chatOf(turns), false).text).toContain(stuckLeadLine(LEADS[0]));
  });

  it("a repeating scene (nothing new remembered) gets today's rung", () => {
    const { text, reading } = guidance(gated, chatOf(turns), true, { memoryIds: [] });
    expect(reading?.kind).toBe("repeating");
    expect(text).toContain(stuckLeadLine(LEADS[0]));
  });

  it("a scene still producing memory and with no other signal keeps today's rung", () => {
    const { text, reading } = guidance(gated, chatOf(turns), true);
    expect(reading?.kind).toBeNull();
    expect(text).toContain(stuckLeadLine(LEADS[0]));
  });

  it("a relationship scene suppresses the rung", () => {
    const chat = chatOf(turns);
    const { text } = guidance(gated, chat, true, { relationEvents: [chat.length - 2] });
    expect(text).not.toMatch(/seems stuck|seems unsure/);
  });

  it("a question gets the lead as information, not pressure", () => {
    const { text, reading } = guidance(gated, chatOf(turns, "\"Is there another way in?\""), true);
    expect(reading?.kind).toBe("uncertain");
    expect(text).toContain(stuckInfoLine(LEADS[0]));
    expect(text).not.toContain(stuckLeadLine(LEADS[0]));
  });

  it("an aftermath replaces the rung with reaction and recovery", () => {
    const chat = chatOf(turns);
    expect(guidance(gated, chat, true, { resolutions: [chat.length - 1] }).text).toContain(AFTERMATH_LINE);
  });

  it("nothing changes before the ladder's first rung", () => {
    const chat = chatOf(2, "Where now?");
    const on = guidance(gated, chat, true).text;
    expect(on).toBe(guidance(gated, chat, false).text);
    expect(on).not.toMatch(/seems stuck|seems unsure/);
  });
});
