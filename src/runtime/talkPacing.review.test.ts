import type { TalkControl } from "@engine/index";
import type { JudgeDirectorInput } from "@judge/index";
import { ASK_PLAYER_DIRECTION, REACTION_DIRECTION, SPOTLIGHT_DIRECTION } from "@pacing/guidance";
import { resolveTalkPolicy, speechRows } from "@talk/index";
import { TalkController, type TalkControlHost } from "./talkControl";
import { SpeechBudget } from "./speechBudget";
import type { SpeechEvent } from "./speechLedger";
import type { TalkDecisionAudit } from "./types";
import type { ChainEnd } from "./chainEnds";
import { testOwnership } from "../../test/findings/testOwnership";

const SYSTEM = { enabled: true, max: 3, stopOnTransition: true, holdExtraction: false };
type Line = { speaker: string; text: string; isUser?: boolean };
const ROSTER = [{ id: "guard", name: "Mara" }, { id: "sage", name: "Finn" }, { id: "dm", name: "Narrator" }];
const BY_NAME: Record<string, string> = { Mara: "guard", Finn: "sage", Narrator: "dm", Ivo: "scout" };

interface Setup {
  control: TalkControl;
  history?: Line[];
  picks: string[];
  drafted?: string;
  consequence?: string | null;
  ledger?: SpeechEvent[];
  roster?: Array<{ id: string; name: string }>;
  judge?: (input: JudgeDirectorInput) => string | null;
}

const makeHost = ({ control, history = [], picks, drafted = "guard", consequence = null, ledger = [], roster = ROSTER, judge }: Setup) => {
  const calls = { triggered: [] as string[], decisions: [] as TalkDecisionAudit[], judged: [] as JudgeDirectorInput[], armed: [] as Array<[string, string]>, ends: [] as ChainEnd[] };
  let window: Line[] = [...history, { speaker: "Rook", text: "We should find shelter.", isUser: true }];
  let events: SpeechEvent[] = ledger;
  const chat = () => window.map((line) => ({ name: line.speaker, mes: line.text, is_user: line.isUser === true }));
  const policy = resolveTalkPolicy({ control, chainMax: control.chain === false ? null : control.chain?.max ?? 3, activeReplies: false });
  const budget = new SpeechBudget({ chat, chatId: () => "chat-1", events: () => events, setEvents: (next) => { events = next; }, policy: () => policy, persist: () => undefined });
  const host: TalkControlHost = {
    ownership: testOwnership(),
    isGroupChat: () => true,
    getChatId: () => "chat-1",
    getActiveTalkControl: () => control,
    getRoster: () => roster,
    getEnabledRosterIds: () => roster.map((member) => member.id),
    getLastSpeakerRosterId: () => null,
    getDraftedRosterId: () => drafted,
    getLastMessageId: () => window.length - 1,
    getWindow: () => window.slice(-8),
    getCheckpointInfo: () => ({ id: "cp1", name: "Gate", objective: "Open it", storyTitle: "Ruins" }),
    getPlayerName: () => "Rook",
    callDirector: async () => "SPEAKER: Finn",
    judgeDirector: async (input) => {
      calls.judged.push(input);
      const name = judge ? judge(input) : picks[calls.judged.length - 1];
      return name ? { kind: "member", rosterId: BY_NAME[name], name, confidence: 0.9, via: "choice" } : { kind: "player", confidence: 0.9, via: "choice" };
    },
    triggerMember: async (name) => { calls.triggered.push(name); },
    recordDecision: (audit) => { calls.decisions.push(audit); },
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
    consequence: () => consequence,
    causeHandled: (cause) => budget.causeHandled(cause),
    lastAddressAt: () => budget.lastAddressAt(),
  };
  const speak = (speaker: string, text = `"${speaker} says something about the road."`) => { window = [...window, { speaker, text }]; };
  const say = (text: string) => { window = [...window, { speaker: "Rook", text, isUser: true }]; };
  const drop = (index: number) => { window = window.filter((_, at) => at !== index); };
  return { host, calls, speak, say, drop, events: () => events, budget, lines: () => window };
};

const run = async (setup: Setup, voices: Array<[string, string?]>) => {
  const made = makeHost(setup);
  const controller = new TalkController(made.host);
  await controller.ready;
  controller.onWrapperStarted({ type: "normal" });
  await controller.intercept(() => undefined, "normal");
  for (const [speaker, text] of voices) {
    made.speak(speaker, text);
    await controller.onWrapperFinished();
    controller.onWrapperStarted({ type: "normal" });
    controller.onGenerationStarted({ force_chid: 1 }, "normal");
  }
  return made;
};

describe("v3.0 19 stage 2: one speech budget per player message", () => {
  it("the chain stops when the budget has no voice left, before asking for a voice it could not afford to start", async () => {
    const { calls, events } = await run({ control: { director: true, budget: { voices: 2 } }, picks: ["Mara", "Finn", "Narrator"] }, [["Mara"], ["Finn"]]);
    expect(calls.triggered).toEqual(["Finn"]);
    expect(events()).toEqual([
      expect.objectContaining({ origin: "chain", member: "Mara", messageId: 1, send: 0, generated: true }),
      expect.objectContaining({ origin: "chain", member: "Finn", messageId: 2, send: 0, generated: true }),
    ]);
  });

  it("control: without a budget field the default budget is the chain max, so three voices still answer", async () => {
    const { calls } = await run({ control: { director: true }, picks: ["Mara", "Finn", "Narrator"] }, [["Mara"], ["Finn"], ["Narrator"]]);
    expect(calls.triggered).toEqual(["Finn", "Narrator"]);
  });
});

describe("v3.0 19 stage 2: spotlight substitutes, never adds", () => {
  const history: Line[] = [
    { speaker: "Rook", text: "Hello.", isUser: true }, { speaker: "Narrator", text: "The rain thins." },
    { speaker: "Rook", text: "Onward.", isUser: true }, { speaker: "Finn", text: '"Mud everywhere."' },
    { speaker: "Rook", text: "Keep going.", isUser: true }, { speaker: "Finn", text: '"Still mud."' },
  ];

  it("a member quiet for quiet_after player turns takes the judge's pick, with a one-line nudge, and the voice count is unchanged", async () => {
    const { calls } = await run({ control: { director: true, spotlight: { quiet_after: 2 } }, history, picks: ["Mara", "Finn", null as unknown as string] }, [["Mara"], ["Narrator"]]);
    expect(calls.triggered).toEqual(["Narrator"]);
    expect(calls.decisions.find((decision) => decision.source === "spotlight")).toMatchObject({ chosenName: "Narrator", chainStep: 1 });
    expect(calls.armed).toEqual([["Narrator", SPOTLIGHT_DIRECTION]]);
    expect(calls.judged).toHaveLength(3);
  });

  it("control: nobody quiet long enough keeps the judge's pick", async () => {
    const { calls } = await run({ control: { director: true, spotlight: { quiet_after: 5 } }, history, picks: ["Mara", "Finn"] }, [["Mara"]]);
    expect(calls.triggered).toEqual(["Finn"]);
    expect(calls.armed).toEqual([]);
  });

  it("a member the last voice named is never swapped out", async () => {
    const { calls } = await run({ control: { director: true, spotlight: { quiet_after: 2 } }, history, picks: ["Mara"] }, [["Mara", '"Finn, which way?"']]);
    expect(calls.triggered).toEqual(["Finn"]);
  });
});

describe("v3.0 19 stage 2: address-the-player rides a planned voice", () => {
  const control: TalkControl = { director: true, lead: "Narrator", address_player: { after_player_turns: 1 } };

  it("the next non-lead voice gets the one-shot ask, costs no extra voice, and the turn goes to the player after it", async () => {
    const { calls, events } = await run({ control, picks: ["Narrator", "Finn", "Mara"], drafted: "dm" }, [["Narrator"], ["Finn", '"The bridge is out."']]);
    expect(calls.triggered).toEqual(["Finn"]);
    expect(calls.armed).toEqual([["Finn", ASK_PLAYER_DIRECTION]]);
    expect(calls.judged).toHaveLength(2);
    expect(calls.decisions.at(-1)).toMatchObject({ kind: "player", source: "rules" });
    expect(events()).toEqual([
      expect.objectContaining({ origin: "chain", member: "Narrator", instructed: false }),
      expect.objectContaining({ origin: "address", recipient: "player", member: "Finn", instructed: true, yieldAfter: true }),
    ]);
  });

  it("the cooldown holds the next beat until enough player turns pass", async () => {
    const ledger: SpeechEvent[] = [{
      send: -1, origin: "address", member: "Finn", generated: true, entry: "cp1@0", recipient: "player", instructed: true, yieldAfter: true, at: -1, messageId: 0,
    }];
    const setup = (cooldown: number): Setup => ({
      control: { ...control, address_player: { after_player_turns: 0, cooldown_player_turns: cooldown } }, picks: ["Narrator", "Finn"], drafted: "dm",
      history: [{ speaker: "Finn", text: '"The road bends."' }], ledger: [...ledger],
    });
    const held = await run(setup(2), [["Narrator"]]);
    expect(held.calls.armed).toEqual([]);
    const due = await run(setup(1), [["Narrator"]]);
    expect(due.calls.armed).toEqual([["Finn", ASK_PLAYER_DIRECTION]]);
  });

  it("rides the first voice when the judge's first pick is a non-lead member", async () => {
    const { calls } = await run({ control, picks: ["Mara", "Finn"] }, [["Mara", '"Hm."']]);
    expect(calls.armed).toEqual([["Mara", ASK_PLAYER_DIRECTION]]);
    expect(calls.triggered).toEqual([]);
  });
});

describe("v3.0 19 stage 2: one reaction beat after a consequential event", () => {
  it("reacts once with a member who has not spoken, without asking the judge, then yields", async () => {
    const { calls, events } = await run({ control: { director: true, reaction: {} }, picks: ["Mara"], consequence: "4@1" }, [["Mara"], ["Finn"]]);
    expect(calls.triggered).toEqual(["Finn"]);
    expect(calls.judged).toHaveLength(1);
    expect(calls.armed).toEqual([["Finn", REACTION_DIRECTION]]);
    expect(calls.decisions.find((decision) => decision.source === "reaction")).toMatchObject({ chosenName: "Finn" });
    expect(events().map((event) => [event.origin, event.member])).toEqual([["chain", "Mara"], ["reaction", "Finn"]]);
    expect(events()[1]).toMatchObject({ origin: "reaction", cause: "4@1" });
    expect(calls.decisions.at(-1)).toMatchObject({ kind: "player" });
  });

  it("control: no consequence, no reaction", async () => {
    const { calls } = await run({ control: { director: true, reaction: {} }, picks: ["Mara", "Finn"] }, [["Mara"]]);
    expect(calls.armed).toEqual([]);
    expect(calls.judged).toHaveLength(2);
  });
});

describe("v3.0 19 stage 2: profiles resolve lead preference", () => {
  it("conversation does not tell the judge to prefer the lead; no profile does", async () => {
    const plain = await run({ control: { director: true, lead: "Narrator" }, picks: ["Mara"], drafted: "guard" }, []);
    const conversation = await run({ control: { director: true, lead: "Narrator", profile: "conversation" }, picks: ["Mara"], drafted: "guard" }, []);
    expect(plain.calls.judged[0].lead).toBe("Narrator");
    expect(conversation.calls.judged[0].lead).toBeUndefined();
  });
});

describe("v3.0 19 fix 1: a directed first voice carries its beat whichever path starts it", () => {
  const control: TalkControl = { director: true, lead: "Narrator", address_player: { after_player_turns: 1 } };

  it("ST drafted another member: the director's member is triggered with the address beat, its reservation and its speech row", async () => {
    const made = makeHost({ control, picks: ["Mara"], drafted: "dm" });
    const controller = new TalkController(made.host);
    await controller.ready;
    controller.onWrapperStarted({ type: "normal" });
    const aborted: boolean[] = [];
    await controller.intercept((immediate) => { aborted.push(immediate); }, "normal");
    await controller.onWrapperFinished();
    expect(aborted).toEqual([false]);
    expect(made.calls.triggered).toEqual(["Mara"]);
    expect(made.calls.armed).toEqual([["Mara", ASK_PLAYER_DIRECTION]]);
    controller.onWrapperStarted({ type: "normal" });
    controller.onGenerationStarted({ force_chid: 1 }, "normal");
    made.speak("Mara", '"Hm."');
    await controller.onWrapperFinished();
    expect(made.events()).toEqual([expect.objectContaining({ origin: "address", member: "Mara", messageId: 1, recipient: "player", yieldAfter: true })]);
    expect(made.calls.decisions.at(-1)).toMatchObject({ kind: "player", source: "rules" });
    expect(made.calls.triggered).toEqual(["Mara"]);
  });

  it("control: ST drafted the director's member, same beat and the same speech row", async () => {
    const { calls, events } = await run({ control, picks: ["Mara"] }, [["Mara", '"Hm."']]);
    expect(calls.armed).toEqual([["Mara", ASK_PLAYER_DIRECTION]]);
    expect(events()).toEqual([expect.objectContaining({ origin: "address", member: "Mara", messageId: 1 })]);
  });

  it("a plain first voice reserves and records too, on either path", async () => {
    const drafted = await run({ control: { director: true }, picks: ["Mara", null as unknown as string] }, [["Mara"]]);
    expect(drafted.events()).toEqual([expect.objectContaining({ origin: "chain", member: "Mara", messageId: 1, instructed: false })]);
    const made = makeHost({ control: { director: true }, picks: ["Mara", null as unknown as string], drafted: "dm" });
    const controller = new TalkController(made.host);
    await controller.ready;
    controller.onWrapperStarted({ type: "normal" });
    await controller.intercept(() => undefined, "normal");
    await controller.onWrapperFinished();
    controller.onWrapperStarted({ type: "normal" });
    controller.onGenerationStarted({ force_chid: 1 }, "normal");
    made.speak("Mara");
    await controller.onWrapperFinished();
    expect(made.events()).toEqual([expect.objectContaining({ origin: "chain", member: "Mara", messageId: 1 })]);
  });
});

describe("v3.0 19 fix 5: spotlight may take the first voice", () => {
  const ROSTER4 = [...ROSTER, { id: "scout", name: "Ivo" }];
  const leadThenHandBack = (input: JudgeDirectorInput) => (input.allowHandBack ? null : "Narrator");

  const play = async (control: TalkControl, sends: string[], judge = leadThenHandBack) => {
    const made = makeHost({ control, picks: [], drafted: "dm", roster: ROSTER4, judge });
    const controller = new TalkController(made.host);
    await controller.ready;
    const spoke: string[][] = [];
    for (const [index, text] of sends.entries()) {
      if (index > 0) made.say(text);
      const before = made.lines().length;
      controller.onWrapperStarted({ type: "normal" });
      const pass = { aborted: false };
      await controller.intercept(() => { pass.aborted = true; }, "normal");
      if (!pass.aborted) made.speak("Narrator");
      const triggered = made.calls.triggered.length;
      await controller.onWrapperFinished();
      for (const name of made.calls.triggered.slice(triggered)) {
        controller.onWrapperStarted({ type: "normal" });
        controller.onGenerationStarted({ force_chid: 1 }, "normal");
        made.speak(name);
        await controller.onWrapperFinished();
        controller.onGenerationEnded();
      }
      spoke.push(made.lines().slice(before).filter((line) => !line.isUser).map((line) => line.speaker));
    }
    return { spoke, made };
  };

  const everyWindowHas = (spoke: string[][], name: string, size: number) =>
    spoke.every((_, start) => start + size > spoke.length || spoke.slice(start, start + size).some((voices) => voices.includes(name)));

  it("in a 4-member group over 10 player turns every member speaks within 4 player turns, one voice a turn", async () => {
    const { spoke } = await play({ director: true, lead: "Narrator", profile: "conversation", address_player: false }, Array.from({ length: 10 }, (_, index) => `Turn ${index + 1}.`));
    expect(spoke.map((voices) => voices.length)).toEqual(Array(10).fill(1));
    expect(["Narrator", "Mara", "Finn", "Ivo"].map((name) => [name, everyWindowHas(spoke, name, 4)])).toEqual([["Narrator", true], ["Mara", true], ["Finn", true], ["Ivo", true]]);
  });

  it("control: without spotlight the lead takes every turn", async () => {
    const { spoke } = await play(
      { director: true, lead: "Narrator", profile: "conversation", address_player: false, spotlight: false, lead_max_consecutive: 8 }, Array.from({ length: 6 }, (_, index) => `Turn ${index + 1}.`),
    );
    expect(spoke).toEqual(Array(6).fill(["Narrator"]));
  });

  it("never swaps out a member the player named, and never the lead in a lead-first profile", async () => {
    const named = await play({ director: true, lead: "Narrator", profile: "conversation", address_player: false, lead_max_consecutive: 8 }, ["Turn 1.", "Turn 2.", "Narrator, what now?", "Turn 4."]);
    expect(named.spoke[2]).toEqual(["Narrator"]);
    const leadFirst = await play({ director: true, lead: "Narrator", profile: "action", lead_max_consecutive: 8 }, ["Turn 1.", "Turn 2.", "Turn 3.", "Turn 4.", "Turn 5."]);
    expect(leadFirst.spoke.map((voices) => voices[0])).toEqual(Array(5).fill("Narrator"));
  });
});

describe("v3.0 19 stage 3: the lead's consecutive-message cap is turn-taking, read from the chat", () => {
  const ROSTER4 = [...ROSTER, { id: "scout", name: "Ivo" }];
  const leadThenHandBack = (input: JudgeDirectorInput) => (input.allowHandBack ? null : "Narrator");
  const turns = (count: number) => Array.from({ length: count }, (_, index) => `Turn ${index + 1}.`);

  const playOn = async (made: ReturnType<typeof makeHost>, controller: TalkController, sends: string[]) => {
    const spoke: string[][] = [];
    for (const text of sends) {
      made.say(text);
      const before = made.lines().length;
      controller.onWrapperStarted({ type: "normal" });
      const pass = { aborted: false };
      await controller.intercept(() => { pass.aborted = true; }, "normal");
      if (!pass.aborted) made.speak("Narrator");
      const triggered = made.calls.triggered.length;
      await controller.onWrapperFinished();
      for (const name of made.calls.triggered.slice(triggered)) {
        controller.onWrapperStarted({ type: "normal" });
        controller.onGenerationStarted({ force_chid: 1 }, "normal");
        made.speak(name);
        await controller.onWrapperFinished();
        controller.onGenerationEnded();
      }
      spoke.push(made.lines().slice(before).filter((line) => !line.isUser).map((line) => line.speaker));
    }
    return spoke;
  };

  const play = async (control: TalkControl, sends: string[], history: Line[] = [], roster = ROSTER4) => {
    const made = makeHost({ control, picks: [], drafted: "dm", roster, judge: leadThenHandBack, history });
    const controller = new TalkController(made.host);
    await controller.ready;
    return { made, controller, spoke: await playOn(made, controller, sends) };
  };

  const longestLeadRun = (spoke: string[][]) => Math.max(...spoke.flat().reduce<number[]>((runs, name) => {
    if (name === "Narrator") runs[runs.length - 1] += 1;
    else runs.push(0);
    return runs;
  }, [0]));

  it("conversation (cap 1): the lead never answers two player turns running, and every turn still gets one voice", async () => {
    const { spoke } = await play({ director: true, lead: "Narrator", profile: "conversation", address_player: false, spotlight: false }, turns(6));
    expect(spoke.map((voices) => voices.length)).toEqual(Array(6).fill(1));
    expect(longestLeadRun(spoke)).toBe(1);
    expect(spoke.filter((voices) => voices[0] === "Narrator")).toHaveLength(3);
  });

  it("an authored cap of 2 lets the lead speak twice in a row, then a party member", async () => {
    const { spoke } = await play({ director: true, lead: "Narrator", lead_max_consecutive: 2 }, turns(6));
    expect(spoke.map((voices) => voices[0])).toEqual(["Narrator", "Narrator", "Finn", "Narrator", "Narrator", "Finn"]);
  });

  it("control: no profile and no cap keeps today's behaviour, the lead every turn", async () => {
    const { spoke } = await play({ director: true, lead: "Narrator" }, turns(4));
    expect(spoke).toEqual(Array(4).fill(["Narrator"]));
  });

  it("rollback = replay: deleting the party line between lead lines caps the lead again, the same as a chat that never had it", async () => {
    const control: TalkControl = { director: true, lead: "Narrator", lead_max_consecutive: 1 };
    const live = await play(control, turns(2));
    expect(live.spoke).toEqual([["Narrator"], ["Finn"]]);
    live.made.drop(live.made.lines().length - 1);
    live.made.drop(live.made.lines().length - 1);
    live.made.host.getLastMessageRevision = () => ({ swipeId: null, hash: live.made.lines().at(-1)?.text ?? "" });
    const afterRollback = await playOn(live.made, live.controller, ["Turn 2 again."]);
    const replay = await play(control, ["Turn 2 again."], live.made.lines().slice(1, -2));
    expect(afterRollback).toEqual(replay.spoke);
    expect(afterRollback[0]).not.toContain("Narrator");
  });

  it("a scripted chain keeps its authored order, and the lead alone in a beat is never capped", async () => {
    const history: Line[] = [{ speaker: "Rook", text: "Hi.", isUser: true }, { speaker: "Narrator", text: "The gate creaks." }];
    const scripted = await play({ lead: "Narrator", lead_max_consecutive: 1, chain: { mode: "scripted", sequence: ["Narrator"], max: 1 } }, ["Turn 1."], history);
    expect(scripted.spoke).toEqual([["Narrator"]]);
    const alone = await play({ director: true, lead: "Narrator", lead_max_consecutive: 1 }, ["Turn 1."], history, [{ id: "dm", name: "Narrator" }]);
    expect(alone.spoke).toEqual([["Narrator"]]);
  });
});

describe("v3.0 19 stage 3: every chain records why it ended", () => {
  const reasons = (made: ReturnType<typeof makeHost>) => made.calls.ends.map((end) => [end.reason, end.voices]);

  it("budget, cap, judge hand-back and yield each end the chain with their own reason", async () => {
    const budget = await run({ control: { director: true, budget: { voices: 2 } }, picks: ["Mara", "Finn", "Narrator"] }, [["Mara"], ["Finn"]]);
    expect(reasons(budget)).toEqual([["budget", 2]]);
    expect(budget.calls.ends[0]).toMatchObject({ checkpointId: "cp1", messageId: 2 });
    const cap = await run({ control: { director: true, chain: { max: 2 } }, picks: ["Mara", "Finn", "Narrator"] }, [["Mara"], ["Finn"]]);
    expect(reasons(cap)).toEqual([["cap", 2]]);
    const judge = await run({ control: { director: true }, picks: ["Mara", null as unknown as string] }, [["Mara"]]);
    expect(reasons(judge)).toEqual([["judge", 1]]);
    const yielded = await run({ control: { director: true }, picks: ["Mara", "Finn"] }, [["Mara", "\"Rook, did you see the riders?\""]]);
    expect(reasons(yielded)).toEqual([["yield", 1]]);
  });

  const opened = async (setup: Setup) => {
    const made = makeHost(setup);
    const controller = new TalkController(made.host);
    await controller.ready;
    controller.onWrapperStarted({ type: "normal" });
    await controller.intercept(() => undefined, "normal");
    return { made, controller };
  };

  it("a player line, STOP or a refused start end it with theirs; a first-voice hand-back is recorded with no voice", async () => {
    const player = await opened({ control: { director: true }, picks: ["Mara", "Finn"] });
    player.controller.onPlayerMessage();
    expect(reasons(player.made)).toEqual([["player", 0]]);
    const stopped = await opened({ control: { director: true }, picks: ["Mara", "Finn"] });
    stopped.controller.onGenerationStopped();
    expect(reasons(stopped.made)).toEqual([["stopped", 0]]);
    const first = await opened({ control: { director: true }, picks: [null as unknown as string] });
    await first.controller.onWrapperFinished();
    expect(reasons(first.made)).toEqual([["judge", 0]]);
    const refused = makeHost({ control: { director: true }, picks: ["Mara", "Finn"] });
    refused.host.triggerMember = async () => ({ ok: false, reason: "a reply is already being written" });
    const controller = new TalkController(refused.host);
    await controller.ready;
    controller.onWrapperStarted({ type: "normal" });
    await controller.intercept(() => undefined, "normal");
    refused.speak("Mara");
    await controller.onWrapperFinished();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(reasons(refused)).toEqual([["refused", 1]]);
  });
});
