import { parseStoryOrThrow, type EngineState } from "@engine/index";
import type { PromptHost } from "./hostPorts";
import type { TensionRuntimeState } from "./types";
import { ASK_PLAYER_DIRECTION, oneShotDirectionText } from "@pacing/guidance";
import { PacingCoordinator } from "./coordinators/pacingCoordinator";
import { QUESTIONS_KEPT, QUESTIONS_TRIMMED, keepLastQuestionPass, type AskingReply, type KeepLastQuestionDeps } from "./keepLastQuestionPass";
import { defaultGlobalSettings, sanitizeGlobalSettings } from "./settingsModel";

const story = parseStoryOrThrow({
  id: "gate", title: "Gate", description: "",
  qualities: [{ key: "done", type: "bool", source: "extractor", rubric: "Done?" }],
  checkpoints: [{ id: "a", name: "A", objective: "", type: "anchor", start: true }],
  transitions: [],
  roster: [{ id: "mara", name: "Mara" }, { id: "narrator", name: "Narrator" }],
});

const pacingHarness = () => {
  const prompt = { setStoryExtensionPrompt: () => undefined, clearStoryExtensionPrompt: () => undefined } as unknown as PromptHost;
  let tension: TensionRuntimeState = { levels: [], smoothed: null, history: [] };
  return new PacingCoordinator({
    getStory: () => story,
    getState: () => ({ activeCheckpointId: "a" } as EngineState),
    getStateLog: () => [],
    getTensionTarget: () => undefined,
    getTension: () => tension,
    setTension: (next) => { tension = next; },
    getPacing: () => ({ alpha: 0.5, shapeOverride: null, hintEnabled: false }),
    hosts: { prompt },
  });
};

const TWO_QUESTIONS = "\"Are you hurt?\" *Mara kneels beside the cart and checks the wheel.* \"Can you walk to the village?\"";
const TRIMMED = "*Mara kneels beside the cart and checks the wheel.* \"Can you walk to the village?\"";

const passHarness = (reply: AskingReply | null, overrides: Partial<KeepLastQuestionDeps> = {}) => {
  const writes: Array<{ messageId: number; mes: string; reasoning: string }> = [];
  const journal: Array<[string, string]> = [];
  const pass = keepLastQuestionPass({
    enabled: () => true,
    asking: () => true,
    read: () => reply,
    write: (messageId, text) => { writes.push({ messageId, ...text }); return { ok: true }; },
    journal: (summary, note) => { journal.push([summary, note]); },
    ...overrides,
  });
  return { pass, writes, journal };
};

describe("keep-last question post-pass", () => {
  it("trims the visible reply of an asking line and never touches its thinking", () => {
    const { pass, writes, journal } = passHarness({ mes: TWO_QUESTIONS, reasoning: "Plan: ask two things?", isUser: false, name: "Mara" });
    pass(4);
    expect(writes).toEqual([{ messageId: 4, mes: TRIMMED, reasoning: "Plan: ask two things?" }]);
    expect(journal).toEqual([[QUESTIONS_TRIMMED, "message 4: 2 questions down to one, 3 words removed"]]);
  });

  it("leaves a reply that is not an asking line alone", () => {
    const { pass, writes } = passHarness({ mes: TWO_QUESTIONS, reasoning: "", isUser: false, name: "Mara" }, { asking: () => false });
    pass(4);
    expect(writes).toEqual([]);
  });

  it("does nothing when the switch is off", () => {
    const { pass, writes, journal } = passHarness({ mes: TWO_QUESTIONS, reasoning: "", isUser: false, name: "Mara" }, { enabled: () => false });
    pass(4);
    expect([writes, journal]).toEqual([[], []]);
  });

  it("ignores the player's own lines and unnamed rows", () => {
    const asking = jest.fn(() => true);
    passHarness({ mes: TWO_QUESTIONS, reasoning: "", isUser: true, name: "Max" }, { asking }).pass(1);
    passHarness({ mes: TWO_QUESTIONS, reasoning: "", isUser: false }, { asking }).pass(2);
    passHarness(null, { asking }).pass(3);
    expect(asking).not.toHaveBeenCalled();
  });

  it("writes nothing for a reply that already asks one question", () => {
    const { pass, writes, journal } = passHarness({ mes: TRIMMED, reasoning: "", isUser: false, name: "Mara" });
    pass(4);
    expect([writes, journal]).toEqual([[], []]);
  });

  it("keeps a reply the trim would break and says why", () => {
    const { pass, writes, journal } = passHarness({ mes: "\"Why?\" \"Now?\"", reasoning: "", isUser: false, name: "Mara" });
    pass(4);
    expect(writes).toEqual([]);
    expect(journal).toEqual([[QUESTIONS_KEPT, "message 4: 2 questions; trimming would leave too few words"]]);
  });

  it("a thought-only reply does not take the mark, so the repair swipe is trimmed", () => {
    const pacing = pacingHarness();
    pacing.armDirection("Mara", ASK_PLAYER_DIRECTION, "draft");
    pacing.draftGuidance("mara");
    let reply: AskingReply = { mes: "<think></think>", reasoning: "Ask the player.", isUser: false, name: "Mara" };
    const writes: string[] = [];
    const pass = keepLastQuestionPass({
      enabled: () => true,
      asking: (speaker) => pacing.takeAskingPlayer(speaker),
      read: () => reply,
      write: (_messageId, text) => { writes.push(text.mes); return { ok: true }; },
      journal: () => undefined,
    });
    pass(1);
    expect(writes).toEqual([]);
    pacing.releaseDraftGuidance();
    pacing.draftGuidance("mara");
    reply = { mes: TWO_QUESTIONS, reasoning: "Ask the player.", isUser: false, name: "Mara" };
    pass(1);
    expect(writes).toEqual([TRIMMED]);
    expect(pacing.takeAskingPlayer("Mara")).toBe(false);
  });

  it("journals nothing when the host refuses the write", () => {
    const { pass, journal } = passHarness({ mes: TWO_QUESTIONS, reasoning: "", isUser: false, name: "Mara" }, { write: () => ({ ok: false, reason: "gone" }) });
    pass(4);
    expect(journal).toEqual([]);
  });
});

describe("the pacing coordinator marks the reply that was told to ask the player", () => {
  it("marks the drafted member's reply under an ask-player direction, once", () => {
    const pacing = pacingHarness();
    const release = pacing.armDirection("Mara", oneShotDirectionText({ ask_player: true }));
    pacing.draftGuidance("mara");
    expect(pacing.takeAskingPlayer("Narrator")).toBe(false);
    expect(pacing.takeAskingPlayer("Mara")).toBe(true);
    pacing.updateSteering();
    expect(pacing.takeAskingPlayer("Mara")).toBe(false);
    release?.();
  });

  it("matches by roster id and by an instruction with the ask tail", () => {
    const pacing = pacingHarness();
    pacing.armDirection("mara", oneShotDirectionText({ ask_player: true, instruction: "Mara wants to know about the riders." }));
    pacing.draftGuidance("mara");
    expect(pacing.takeAskingPlayer("mara")).toBe(true);
  });

  it("does not mark a direction that does not ask the player, or one never drafted", () => {
    const pacing = pacingHarness();
    pacing.armDirection("Mara", "Mention the riders.");
    pacing.draftGuidance("mara");
    expect(pacing.takeAskingPlayer("Mara")).toBe(false);
    pacing.armDirection("Mara", ASK_PLAYER_DIRECTION);
    pacing.draftGuidance("narrator");
    expect(pacing.takeAskingPlayer("Mara")).toBe(false);
  });

  it("a later draft drops a mark nobody took, and a withheld run sets none", () => {
    const pacing = pacingHarness();
    pacing.armDirection("Mara", ASK_PLAYER_DIRECTION);
    pacing.draftGuidance("mara");
    pacing.draftGuidance("narrator");
    expect(pacing.takeAskingPlayer("Mara")).toBe(false);
    pacing.withholdGuidance();
    pacing.draftGuidance("mara");
    expect(pacing.takeAskingPlayer("Mara")).toBe(false);
  });

  it("a re-draft of the same member before the reply lands keeps the mark (a swipe's reapply)", () => {
    const pacing = pacingHarness();
    pacing.draftGuidance("mara");
    pacing.armDirection("Mara", ASK_PLAYER_DIRECTION, "draft");
    pacing.releaseDraftGuidance();
    pacing.draftGuidance("mara");
    pacing.releaseDraftGuidance();
    expect(pacing.takeAskingPlayer("Mara")).toBe(true);
    expect(pacing.takeAskingPlayer("Mara")).toBe(false);
  });

  it("a re-armed direction (a swiped cue) marks the new reply again", () => {
    const pacing = pacingHarness();
    pacing.armDirection("Mara", ASK_PLAYER_DIRECTION);
    pacing.draftGuidance("mara");
    expect(pacing.takeAskingPlayer("Mara")).toBe(true);
    pacing.releaseDraftGuidance();
    pacing.draftGuidance("mara");
    pacing.armDirection("Mara", ASK_PLAYER_DIRECTION, "draft");
    expect(pacing.takeAskingPlayer("Mara")).toBe(true);
  });
});

describe("talk.keepLastQuestion setting", () => {
  it("is on by default and only an explicit false switches it off", () => {
    expect(defaultGlobalSettings().talk.keepLastQuestion).toBe(true);
    expect(sanitizeGlobalSettings({ talk: {} }).talk.keepLastQuestion).toBe(true);
    expect(sanitizeGlobalSettings({ talk: { keepLastQuestion: "no" } }).talk.keepLastQuestion).toBe(true);
    expect(sanitizeGlobalSettings({ talk: { keepLastQuestion: false } }).talk.keepLastQuestion).toBe(false);
  });
});
