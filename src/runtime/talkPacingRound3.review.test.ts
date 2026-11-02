import type { TalkControl } from "@engine/index";
import type { JudgeDirectorInput } from "@judge/index";
import { ANSWER_FIRST, ASK_PLAYER_DIRECTION, ASK_PLAYER_TAIL, FIRST_SPOTLIGHT_DIRECTION, LEAD_SETTLE_CLAUSE, SPOTLIGHT_DIRECTION, leadLengthLine } from "@pacing/guidance";
import { resolveTalkPolicy, speechRows } from "@talk/index";
import { TalkController, type TalkControlHost } from "./talkControl";
import { SpeechBudget } from "./speechBudget";
import type { SpeechEvent } from "./speechLedger";
import type { ChainEnd } from "./chainEnds";
import { testOwnership } from "../../test/findings/testOwnership";

const SYSTEM = { enabled: true, max: 3, stopOnTransition: true, holdExtraction: false };
type Line = { speaker: string; text: string; isUser?: boolean };
const ROSTER = [{ id: "guard", name: "Mara" }, { id: "sage", name: "Finn" }, { id: "dm", name: "Narrator" }, { id: "scout", name: "Ivo" }];
const BY_NAME: Record<string, string> = { Mara: "guard", Finn: "sage", Narrator: "dm", Ivo: "scout" };

interface Setup {
  control: TalkControl;
  line: string;
  history?: Line[];
  picks: Array<string | null>;
  drafted?: string;
}

const makeHost = ({ control, line, history = [], picks, drafted = "nobody" }: Setup) => {
  const calls = { triggered: [] as string[], judged: [] as JudgeDirectorInput[], armed: [] as Array<[string, string]>, ends: [] as ChainEnd[] };
  let window: Line[] = [...history, { speaker: "Rook", text: line, isUser: true }];
  let events: SpeechEvent[] = [];
  const chat = () => window.map((entry) => ({ name: entry.speaker, mes: entry.text, is_user: entry.isUser === true }));
  const policy = resolveTalkPolicy({ control, chainMax: 3, activeReplies: false });
  const budget = new SpeechBudget({ chat, chatId: () => "chat-1", events: () => events, setEvents: (next) => { events = next; }, policy: () => policy, persist: () => undefined });
  const host: TalkControlHost = {
    ownership: testOwnership(),
    isGroupChat: () => true,
    getChatId: () => "chat-1",
    getActiveTalkControl: () => control,
    getRoster: () => ROSTER,
    getEnabledRosterIds: () => ROSTER.map((member) => member.id),
    getLastSpeakerRosterId: () => null,
    getDraftedRosterId: () => drafted,
    getLastMessageId: () => window.length - 1,
    getWindow: () => window.slice(-8),
    getCheckpointInfo: () => ({ id: "cp1", name: "Gate", objective: "Open it", storyTitle: "Ruins" }),
    getPlayerName: () => "Rook",
    callDirector: async () => "SPEAKER: Finn",
    judgeDirector: async (input) => {
      calls.judged.push(input);
      const name = picks[calls.judged.length - 1];
      return name ? { kind: "member", rosterId: BY_NAME[name], name, confidence: 0.9, via: "choice" } : { kind: "player", confidence: 0.9, via: "choice" };
    },
    triggerMember: async (name) => { calls.triggered.push(name); },
    recordDecision: () => undefined,
    recordChainEnd: (end) => { calls.ends.push(end); },
    getChainConfig: () => SYSTEM,
    getTalkPolicy: () => policy,
    getSpeechRows: () => speechRows(chat()),
    getEntryStart: () => 0,
    getEntryKey: () => "cp1@0",
    reserveSpeech: (request) => budget.reserve(request),
    settleSpeech: (reservation, messageId) => budget.settle(reservation, messageId),
    speechYielded: () => budget.yieldPending(),
    armDirection: (member, text) => { calls.armed.push([member, text]); return () => undefined; },
    consequence: () => null,
    causeHandled: (cause) => budget.causeHandled(cause),
    lastAddressAt: () => budget.lastAddressAt(),
  };
  const speak = (speaker: string, text: string) => { window = [...window, { speaker, text }]; };
  return { host, calls, speak, events: () => events };
};

const run = async (setup: Setup, voices: Array<[string, string?]>) => {
  const made = makeHost(setup);
  const controller = new TalkController(made.host);
  await controller.ready;
  controller.onWrapperStarted({ type: "normal" });
  await controller.intercept(() => undefined, "normal");
  await controller.onWrapperFinished();
  for (const [speaker, text] of voices) {
    controller.onWrapperStarted({ type: "normal" });
    controller.onGenerationStarted({ force_chid: 1 }, "normal");
    made.speak(speaker, text ?? `"${speaker} looks down the road."`);
    await controller.onWrapperFinished();
  }
  return made;
};

const asked = (text: string): string => `"${text} What do you think, Rook?"`;

describe("v3.0 19 round 3 pattern 1: every member the player addresses gets a voice", () => {
  const line = "Mara, Finn, how are you two holding up?";

  it("with a profile both addressees answer even past the budget and a question to the player", async () => {
    const { calls, events } = await run({ control: { director: true, lead: "Narrator", profile: "conversation", budget: { voices: 1 } }, line, picks: ["Mara", null] },
      [["Mara", asked("Tired.")], ["Finn"]]);
    expect(calls.triggered).toEqual(["Mara", "Finn"]);
    expect(events().map((event) => event.member)).toEqual(["Mara", "Finn"]);
    expect(calls.ends.at(-1)?.reason).not.toBe("budget");
  });

  it("the first voice goes to an addressee, not the lead the judge picked", async () => {
    const { calls } = await run({ control: { director: true, lead: "Narrator", profile: "decision" }, line, picks: ["Narrator", null] }, [["Mara"], ["Finn"]]);
    expect(calls.triggered).toEqual(["Mara", "Finn"]);
  });

  it("the address beat waits until the last addressee speaks", async () => {
    const { calls } = await run({ control: { director: true, lead: "Narrator", profile: "opening" }, line, picks: ["Mara", null] }, [["Mara"], ["Finn"]]);
    expect(calls.armed).toEqual([["Finn", ASK_PLAYER_DIRECTION]]);
  });

  it("control: without a profile the budget and the question still end the chain after one voice", async () => {
    const { calls } = await run({ control: { director: true, lead: "Narrator", budget: { voices: 1 } }, line, picks: ["Mara", null] }, [["Mara", asked("Tired.")]]);
    expect(calls.triggered).toEqual(["Mara"]);
  });
});

describe("v3.0 19 round 3 pattern 2: a player action addressed to nobody gets the lead first", () => {
  const history: Line[] = [{ speaker: "Rook", text: "Hello.", isUser: true }, { speaker: "Narrator", text: "The rain thins." }];

  it("the lead takes the first voice in a profile where it is not first, even while capped", async () => {
    const { calls } = await run({ control: { director: true, lead: "Narrator", profile: "conversation" }, line: "I walk to the door and knock.", history, picks: ["Mara", null] }, [["Narrator"]]);
    expect(calls.triggered[0]).toBe("Narrator");
  });

  it("control: a line naming a member is not an unaddressed action", async () => {
    const { calls } = await run({ control: { director: true, lead: "Narrator", profile: "conversation" }, line: "Mara, I knock on the door.", history, picks: ["Mara", null] }, [["Mara"]]);
    expect(calls.triggered[0]).toBe("Mara");
  });

  it("control: without a profile the judge's pick keeps the first voice", async () => {
    const { calls } = await run({ control: { director: true, lead: "Narrator" }, line: "I walk to the door and knock.", history, picks: ["Mara", null] }, [["Mara"]]);
    expect(calls.triggered[0]).toBe("Mara");
  });
});

describe("v3.0 19 round 3 pattern 3: a named lead overrides the lead cap", () => {
  const history: Line[] = [{ speaker: "Rook", text: "Hello.", isUser: true }, { speaker: "Narrator", text: "The rain thins." }];

  it("with a profile the capped lead stays a candidate when the player names it", async () => {
    const { calls } = await run({ control: { director: true, lead: "Narrator", profile: "conversation" }, line: "Narrator, what lies past the gate?", history, picks: ["Narrator", null] }, [["Narrator"]]);
    expect(calls.judged[0].candidates.map((candidate) => candidate.name)).toContain("Narrator");
    expect(calls.triggered[0]).toBe("Narrator");
  });

  it("control: an authored cap without a profile still removes the named lead", async () => {
    const { calls } = await run({ control: { director: true, lead: "Narrator", lead_max_consecutive: 1 }, line: "Narrator, what lies past the gate?", history, picks: ["Mara", null] }, [["Mara"]]);
    expect(calls.judged[0].candidates.map((candidate) => candidate.name)).not.toContain("Narrator");
  });
});

describe("v3.0 19 round 3 pattern 4: the first voice answers the player", () => {
  const history: Line[] = [
    { speaker: "Rook", text: "Hello.", isUser: true }, { speaker: "Finn", text: '"Mud."' },
    { speaker: "Rook", text: "Onward.", isUser: true }, { speaker: "Finn", text: '"Still mud."' },
    { speaker: "Rook", text: "Keep going.", isUser: true }, { speaker: "Mara", text: '"Quiet."' },
  ];

  it("a spotlit first voice is told to answer the player first", async () => {
    const { calls } = await run({ control: { director: true, lead: "Narrator", profile: "conversation", address_player: false }, line: "We should find shelter.", history, picks: ["Finn", null] }, [["Ivo"]]);
    expect(calls.armed[0]).toEqual(["Ivo", FIRST_SPOTLIGHT_DIRECTION]);
  });

  it("control: without a profile the first-voice spotlight keeps its own direction", async () => {
    const { calls } = await run({ control: { director: true, lead: "Narrator", spotlight: { quiet_after: 2 } }, line: "We should find shelter.", history, picks: ["Finn", null] }, [["Ivo"]]);
    expect(calls.armed[0]).toEqual(["Ivo", SPOTLIGHT_DIRECTION]);
  });

  it("an address beat on the first voice answers before it asks", async () => {
    const { calls } = await run({ control: { director: true, lead: "Narrator", profile: "opening" }, line: "We should find shelter.", picks: ["Mara", null] }, [["Mara"]]);
    expect(calls.armed).toEqual([["Mara", `${ANSWER_FIRST} ${ASK_PLAYER_TAIL}`]]);
  });
});

describe("v3.0 19 round 3: owed voices and the decision lead", () => {
  it("an owed request passes a spent budget; any other request is held", () => {
    const chat = [{ name: "Rook", mes: "Mara, Finn?", is_user: true }, { name: "Mara", mes: "Yes." }];
    const policy = resolveTalkPolicy({ control: { director: true, budget: { voices: 1 } }, chainMax: 3, activeReplies: false });
    const budget = new SpeechBudget({ chat: () => chat, chatId: () => "c", events: () => [], setEvents: () => undefined, policy: () => policy, persist: () => undefined });
    const request = { origin: "chain" as const, member: "Finn", generated: true, source: { messageId: 1, revision: null }, entry: "e", recipient: "scene", instruction: null, yieldAfter: false };
    expect(budget.reserve(request)).toBeNull();
    expect(budget.reserve({ ...request, owed: true })).not.toBeNull();
  });

  it("the decision lead is told not to restate its appeal; other leads are not", () => {
    expect(leadLengthLine("Narrator", 140, true)).toContain(LEAD_SETTLE_CLAUSE);
    expect(leadLengthLine("Narrator", 140)).not.toContain(LEAD_SETTLE_CLAUSE);
  });
});
