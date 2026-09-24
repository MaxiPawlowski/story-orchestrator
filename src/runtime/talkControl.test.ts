import type { TalkControl } from "@engine/index";
import { TalkController, type TalkControlHost } from "./talkControl";
import type { TalkDecisionAudit } from "./types";

interface HostCalls {
  director: string[];
  triggered: string[];
  decisions: TalkDecisionAudit[];
}

const makeHost = (overrides: Partial<TalkControlHost> = {}) => {
  const calls: HostCalls = { director: [], triggered: [], decisions: [] };
  const host: TalkControlHost = {
    isGroupChat: () => true,
    getChatId: () => "chat-1",
    getActiveTalkControl: (): TalkControl | null => ({ director: true, allow_silence: true }),
    getRoster: () => [{ id: "guard", name: "Mara" }, { id: "sage", name: "Finn" }],
    getEnabledRosterIds: () => ["guard", "sage"],
    getLastSpeakerRosterId: () => null,
    getDraftedRosterId: () => "guard",
    getLastMessageId: () => 5,
    getWindow: () => [{ speaker: "User", text: "hello there" }],
    getCheckpointInfo: () => ({ id: "cp1", name: "Gate", objective: "Open it", storyTitle: "Ruins" }),
    callDirector: async (prompt) => { calls.director.push(prompt); return "SPEAKER: Mara"; },
    triggerMember: async (name) => { calls.triggered.push(name); },
    recordDecision: (audit) => { calls.decisions.push(audit); },
    ...overrides,
  };
  return { host, calls };
};

const makeAbort = () => {
  const state = { aborted: false };
  return { state, abort: (_immediate: boolean) => { state.aborted = true; } };
};

describe("TalkController intercept", () => {
  it("ignores non-normal types, solo chats, and checkpoints without talk_control", async () => {
    const noControl = makeHost({ getActiveTalkControl: () => null });
    const solo = makeHost({ isGroupChat: () => false });
    for (const { host, calls } of [noControl, solo]) {
      const controller = new TalkController(host);
      const { state, abort } = makeAbort();
      await controller.intercept(abort, "normal");
      await controller.intercept(abort, "quiet");
      expect(state.aborted).toBe(false);
      expect(calls.director).toHaveLength(0);
    }
    const quietOnly = makeHost();
    const controller = new TalkController(quietOnly.host);
    const { state, abort } = makeAbort();
    await controller.intercept(abort, "quiet");
    await controller.intercept(abort, "swipe");
    await controller.intercept(abort, "continue");
    await controller.intercept(abort, "impersonate");
    expect(state.aborted).toBe(false);
    expect(quietOnly.calls.director).toHaveLength(0);
  });

  it("passes the chosen drafted member and vetoes others", async () => {
    let drafted = "guard";
    const { host, calls } = makeHost({ getDraftedRosterId: () => drafted });
    const controller = new TalkController(host);
    controller.onWrapperStarted({ type: "normal" });
    const pass = makeAbort();
    await controller.intercept(pass.abort, "normal");
    expect(pass.state.aborted).toBe(false);

    drafted = "sage";
    const veto = makeAbort();
    await controller.intercept(veto.abort, "normal");
    expect(veto.state.aborted).toBe(true);
    expect(calls.decisions).toHaveLength(1);
    expect(calls.decisions[0]).toMatchObject({ chosenRosterId: "guard", chosenName: "Mara", source: "director" });
  });

  it("respects an explicit force_chid", async () => {
    const { host, calls } = makeHost({ getDraftedRosterId: () => "sage" });
    const controller = new TalkController(host);
    controller.onGenerationStarted({ force_chid: 3 });
    const { state, abort } = makeAbort();
    await controller.intercept(abort, "normal");
    expect(state.aborted).toBe(false);
    expect(calls.director).toHaveLength(0);
    controller.onGenerationEnded();
    await controller.intercept(abort, "normal");
    expect(state.aborted).toBe(true);
  });

  it("aborts every draft when the director answers NONE", async () => {
    const { host } = makeHost({ callDirector: async () => "SPEAKER: NONE" });
    const controller = new TalkController(host);
    const first = makeAbort();
    const second = makeAbort();
    await controller.intercept(first.abort, "normal");
    await controller.intercept(second.abort, "normal");
    expect(first.state.aborted).toBe(true);
    expect(second.state.aborted).toBe(true);
  });

  it("caches one decision per message so the director runs once per pass", async () => {
    const { host, calls } = makeHost({ getDraftedRosterId: () => "sage" });
    const controller = new TalkController(host);
    await controller.intercept(makeAbort().abort, "normal");
    await controller.intercept(makeAbort().abort, "normal");
    expect(calls.director).toHaveLength(1);
    expect(calls.decisions).toHaveLength(1);
  });

  it("scopes the decision to the chat, so a new chat at the same checkpoint and message index decides again", async () => {
    let chatId = "chat-a";
    const { host, calls } = makeHost({ getChatId: () => chatId, getDraftedRosterId: () => "sage" });
    const controller = new TalkController(host);
    await controller.intercept(makeAbort().abort, "normal");
    chatId = "chat-b";
    await controller.intercept(makeAbort().abort, "normal");
    expect(calls.director).toHaveLength(2);
    expect(calls.decisions).toHaveLength(2);
  });

  it("pins the decision key for the whole pass even when the chat grows mid-pass", async () => {
    let messageId = 5;
    let drafted = "guard";
    const { host, calls } = makeHost({ getLastMessageId: () => messageId, getDraftedRosterId: () => drafted });
    const controller = new TalkController(host);
    controller.onWrapperStarted({ type: "normal" });
    await controller.intercept(makeAbort().abort, "normal");
    messageId = 6;
    drafted = "sage";
    const veto = makeAbort();
    await controller.intercept(veto.abort, "normal");
    expect(veto.state.aborted).toBe(true);
    expect(calls.director).toHaveLength(1);
    expect(calls.decisions).toHaveLength(1);
    await controller.onWrapperFinished();
    expect(calls.triggered).toHaveLength(0);
  });

  it("uses the mention fast path without calling the director", async () => {
    const { host, calls } = makeHost({ getWindow: () => [{ speaker: "User", text: "Finn, what do you see?" }], getDraftedRosterId: () => "sage" });
    const controller = new TalkController(host);
    const { state, abort } = makeAbort();
    await controller.intercept(abort, "normal");
    expect(state.aborted).toBe(false);
    expect(calls.director).toHaveLength(0);
    expect(calls.decisions[0]).toMatchObject({ chosenRosterId: "sage", source: "mention" });
  });

  it("falls back to rules when the director fails", async () => {
    const { host, calls } = makeHost({
      callDirector: async () => { throw new Error("down"); },
      getActiveTalkControl: () => ({ director: true, lead: "Finn" }),
      getDraftedRosterId: () => "sage",
    });
    const controller = new TalkController(host);
    const { state, abort } = makeAbort();
    await controller.intercept(abort, "normal");
    expect(state.aborted).toBe(false);
    expect(calls.decisions[0]).toMatchObject({ chosenRosterId: "sage", source: "fallback" });
  });

  it("ignores unparseable director output via rules fallback", async () => {
    const { host, calls } = makeHost({
      callDirector: async () => "no idea, maybe everyone",
      getActiveTalkControl: () => ({ director: true, lead: "guard" }),
    });
    const controller = new TalkController(host);
    await controller.intercept(makeAbort().abort, "normal");
    expect(calls.decisions[0]).toMatchObject({ chosenRosterId: "guard", source: "fallback" });
  });

  it("offers a lead the speakers list leaves out to the director, as a candidate and as the scene lead", async () => {
    const { host, calls } = makeHost({
      getActiveTalkControl: () => ({ speakers: [{ member: "Mara" }], lead: "Finn", director: true }),
      callDirector: async (prompt) => { calls.director.push(prompt); return "SPEAKER: Finn"; },
      getDraftedRosterId: () => "sage",
    });
    const controller = new TalkController(host);
    const { state, abort } = makeAbort();
    await controller.intercept(abort, "normal");
    expect(calls.director[0]).toContain("Candidates: Mara, Finn");
    expect(calls.director[0]).toContain("Scene lead: Finn");
    expect(state.aborted).toBe(false);
    expect(calls.decisions[0]).toMatchObject({ chosenRosterId: "sage", source: "director" });
  });

  it("passes through when no candidate resolves against the roster", async () => {
    const { host, calls } = makeHost({ getActiveTalkControl: () => ({ speakers: [{ member: "ghost" }] }) });
    const controller = new TalkController(host);
    const { state, abort } = makeAbort();
    await controller.intercept(abort, "normal");
    expect(state.aborted).toBe(false);
    expect(calls.decisions).toHaveLength(0);
  });
});

describe("TalkController judge director", () => {
  const judged = (decision: Awaited<ReturnType<NonNullable<TalkControlHost["judgeDirector"]>>>) => jest.fn(async () => decision);

  it("takes the judge's pick before the mention rule and records it with its confidence", async () => {
    const judgeDirector = judged({ kind: "member", rosterId: "sage", name: "Finn", confidence: 0.9, via: "choice" });
    const { host, calls } = makeHost({
      getRoster: () => [{ id: "guard", name: "Mara", role: "gate captain" }, { id: "sage", name: "Finn", role: "old scholar" }],
      getWindow: () => [{ speaker: "User", text: "I tell Mara about the scroll, then look at the old man." }],
      judgeDirector,
      getPlayerName: () => "User",
    });
    const controller = new TalkController(host);
    const { state, abort } = makeAbort();
    await controller.intercept(abort, "normal");
    expect(state.aborted).toBe(true);
    expect(calls.director).toHaveLength(0);
    expect(calls.decisions[0]).toMatchObject({ chosenRosterId: "sage", source: "judge", judge: { confidence: 0.9, via: "choice" } });
    expect(judgeDirector).toHaveBeenCalledWith(expect.objectContaining({
      checkpointName: "Gate",
      objective: "Open it",
      player: "User",
      allowSilence: true,
      candidates: [{ rosterId: "guard", name: "Mara", role: "gate captain" }, { rosterId: "sage", name: "Finn", role: "old scholar" }],
    }));
  });

  it("honours a judged silence", async () => {
    const { host, calls } = makeHost({ judgeDirector: judged({ kind: "silence", confidence: 0.8, via: "composite" }) });
    const controller = new TalkController(host);
    const { state, abort } = makeAbort();
    await controller.intercept(abort, "normal");
    expect(state.aborted).toBe(true);
    expect(calls.decisions[0]).toMatchObject({ chosenRosterId: null, source: "judge" });
  });

  it("falls through to today's chain when the judge declines, throws, or names someone outside the pool", async () => {
    const declines = makeHost({ judgeDirector: judged(null) });
    const throws = makeHost({ judgeDirector: jest.fn(async () => { throw new Error("offline"); }) });
    const stranger = makeHost({ judgeDirector: judged({ kind: "member", rosterId: "ghost", name: "Ghost", confidence: 0.9, via: "choice" }) });
    for (const { host, calls } of [declines, throws, stranger]) {
      const controller = new TalkController(host);
      const { abort } = makeAbort();
      await controller.intercept(abort, "normal");
      expect(calls.director).toHaveLength(1);
      expect(calls.decisions[0]).toMatchObject({ chosenRosterId: "guard", source: "director" });
    }
  });
});

describe("TalkController reconcile", () => {
  it("triggers the chosen member when a loud pass ends without them speaking", async () => {
    const { host, calls } = makeHost({ getDraftedRosterId: () => "sage" });
    const controller = new TalkController(host);
    controller.onWrapperStarted({ type: "normal" });
    await controller.intercept(makeAbort().abort, "normal");
    await controller.onWrapperFinished();
    expect(calls.triggered).toEqual(["Mara"]);
  });

  it("triggers on an empty MANUAL pass without any intercepts", async () => {
    const { host, calls } = makeHost();
    const controller = new TalkController(host);
    controller.onWrapperStarted({ type: undefined });
    await controller.onWrapperFinished();
    expect(calls.triggered).toEqual(["Mara"]);
    expect(calls.decisions).toHaveLength(1);
  });

  it("reconciles at most once per decision", async () => {
    const { host, calls } = makeHost();
    const controller = new TalkController(host);
    controller.onWrapperStarted({ type: "normal" });
    await controller.onWrapperFinished();
    controller.onWrapperStarted({ type: "normal" });
    await controller.onWrapperFinished();
    expect(calls.triggered).toEqual(["Mara"]);
  });

  it("reconciles again after a mutation re-creates the same key (v2.4 plan 01 T1 live: a /cut reused the message index)", async () => {
    let world = 0;
    const ownership = { mint: () => ({ world }) as never, check: (token: { world: number }) => (token.world === world ? { ok: true } : { ok: false, reason: "windowRevision" }) as never };
    const { host, calls } = makeHost({ ownership } as never);
    const controller = new TalkController(host);
    controller.onWrapperStarted({ type: "normal" });
    await controller.onWrapperFinished();
    world += 1;
    controller.onWrapperStarted({ type: "normal" });
    await controller.onWrapperFinished();
    expect(calls.triggered).toEqual(["Mara", "Mara"]);
  });

  it("skips reconcile when the chosen member spoke, the pass was forced, or quiet", async () => {
    const spoke = makeHost();
    const spokeController = new TalkController(spoke.host);
    spokeController.onWrapperStarted({ type: "normal" });
    await spokeController.intercept(makeAbort().abort, "normal");
    await spokeController.onWrapperFinished();
    expect(spoke.calls.triggered).toHaveLength(0);

    const forced = makeHost();
    const forcedController = new TalkController(forced.host);
    forcedController.onWrapperStarted({ type: "normal" });
    forcedController.onGenerationStarted({ force_chid: 2 });
    forcedController.onGenerationEnded();
    await forcedController.onWrapperFinished();
    expect(forced.calls.triggered).toHaveLength(0);

    const quiet = makeHost();
    const quietController = new TalkController(quiet.host);
    quietController.onWrapperStarted({ type: "quiet" });
    await quietController.onWrapperFinished();
    expect(quiet.calls.triggered).toHaveLength(0);
  });

  it("does not trigger after a silence decision", async () => {
    const { host, calls } = makeHost({ callDirector: async () => "SPEAKER: NONE" });
    const controller = new TalkController(host);
    controller.onWrapperStarted({ type: "normal" });
    await controller.intercept(makeAbort().abort, "normal");
    await controller.onWrapperFinished();
    expect(calls.triggered).toHaveLength(0);
    expect(calls.decisions[0]).toMatchObject({ chosenRosterId: null, source: "director" });
  });

  it("computes a fresh decision when a new message lands", async () => {
    let messageId = 5;
    const { host, calls } = makeHost({ getLastMessageId: () => messageId });
    const controller = new TalkController(host);
    controller.onWrapperStarted({ type: "normal" });
    await controller.onWrapperFinished();
    messageId = 7;
    controller.onWrapperStarted({ type: "normal" });
    await controller.onWrapperFinished();
    expect(calls.triggered).toEqual(["Mara", "Mara"]);
    expect(calls.decisions).toHaveLength(2);
  });
});
