import type { TalkControl } from "@engine/index";
import { TalkController, resolveChainConfig, type TalkControlHost } from "./talkControl";
import type { TalkDecisionAudit } from "./types";
import { testOwnership } from "../../test/findings/testOwnership";

const SYSTEM = { enabled: true, max: 3, stopOnTransition: true, holdExtraction: false };

const makeHost = (control: TalkControl, reply: () => { speaker: string; text: string }) => {
  const calls = { triggered: [] as string[], decisions: [] as TalkDecisionAudit[], judged: 0 };
  let window: Array<{ speaker: string; text: string; isUser?: boolean }> = [{ speaker: "Rook", text: "We should find shelter.", isUser: true }];
  const host: TalkControlHost = {
    ownership: testOwnership(),
    isGroupChat: () => true,
    getChatId: () => "chat-1",
    getActiveTalkControl: () => control,
    getRoster: () => [{ id: "guard", name: "Mara" }, { id: "sage", name: "Finn" }, { id: "dm", name: "Narrator" }],
    getEnabledRosterIds: () => ["guard", "sage", "dm"],
    getLastSpeakerRosterId: () => null,
    getDraftedRosterId: () => "guard",
    getLastMessageId: () => window.length - 1,
    getWindow: () => window,
    getCheckpointInfo: () => ({ id: "cp1", name: "Gate", objective: "Open it", storyTitle: "Ruins" }),
    getPlayerName: () => "Rook",
    callDirector: async () => "SPEAKER: Finn",
    judgeDirector: async () => {
      calls.judged += 1;
      return calls.judged === 1 ? { kind: "member", rosterId: "guard", name: "Mara", confidence: 0.9, via: "choice" } : { kind: "member", rosterId: "sage", name: "Finn", confidence: 0.9, via: "choice" };
    },
    triggerMember: async (name) => { calls.triggered.push(name); },
    recordDecision: (audit) => { calls.decisions.push(audit); },
    getChainConfig: () => SYSTEM,
  };
  const voice = () => { window = [...window, reply()]; };
  return { host, calls, voice };
};

const firstVoice = async (control: TalkControl, reply: () => { speaker: string; text: string }) => {
  const made = makeHost(control, reply);
  const controller = new TalkController(made.host);
  controller.onWrapperStarted({ type: "normal" });
  await controller.intercept(() => undefined, "normal");
  made.voice();
  await controller.onWrapperFinished();
  return made;
};

const ASKS = () => ({ speaker: "Mara", text: '*Mara looks over.* "Rook, do you know this road?"' });
const STATES = () => ({ speaker: "Mara", text: '"The bridge is out. We go around."' });

describe("v3.0 19 P4: a chained voice that asks the player ends the chain", () => {
  it("defaults on: no further voice and no judge call after a question to the player, and the hand-back is recorded", async () => {
    const { calls } = await firstVoice({ director: true }, ASKS);
    expect(calls.triggered).toEqual([]);
    expect(calls.judged).toBe(1);
    expect(calls.decisions.at(-1)).toMatchObject({ kind: "player", source: "rules", chainStep: 1, chosenRosterId: null });
  });

  it("yield_on_question false keeps today's chain", async () => {
    const { calls } = await firstVoice({ director: true, chain: { yield_on_question: false } }, ASKS);
    expect(calls.triggered).toEqual(["Finn"]);
    expect(calls.judged).toBe(2);
  });

  it("control: a voice that does not ask the player keeps the chain going", async () => {
    const { calls } = await firstVoice({ director: true }, STATES);
    expect(calls.triggered).toEqual(["Finn"]);
  });

  it("a scripted chain yields too", async () => {
    const { calls } = await firstVoice({ chain: { mode: "scripted", sequence: ["Mara", "Finn"] } }, ASKS);
    expect(calls.triggered).toEqual([]);
  });

  it("P11: a voice that hands the moment to another member by name drafts that member next, without asking the judge", async () => {
    const { calls } = await firstVoice({ director: true, no_repeat: true }, () => ({ speaker: "Mara", text: '"Finn, you know these hills. Which way?"' }));
    expect(calls.triggered).toEqual(["Finn"]);
    expect(calls.judged).toBe(1);
    expect(calls.decisions.at(-1)).toMatchObject({ source: "mention", chosenName: "Finn", chainStep: 1 });
  });

  it("resolves the switch over the defaults", () => {
    expect(resolveChainConfig({}, SYSTEM)?.yieldOnQuestion).toBe(true);
    expect(resolveChainConfig({ chain: { yield_on_question: false } }, SYSTEM)?.yieldOnQuestion).toBe(false);
  });
});
