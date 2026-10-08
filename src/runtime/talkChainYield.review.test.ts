import type { TalkControl } from "@engine/index";
import { couldNot } from "@utils/writeResult";
import { TalkController, type TalkControlHost } from "./talkControl";
import type { TalkDecisionAudit } from "./types";
import { testOwnership } from "../../test/findings/testOwnership";

type Answer = { kind: "member"; rosterId: string; name: string; confidence: number; via: "choice" };

const MARA: Answer = { kind: "member", rosterId: "guard", name: "Mara", confidence: 0.9, via: "choice" };
const FINN: Answer = { kind: "member", rosterId: "sage", name: "Finn", confidence: 0.9, via: "choice" };
const ODO: Answer = { kind: "member", rosterId: "smith", name: "Odo", confidence: 0.9, via: "choice" };

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const makeHost = (judge: () => Promise<Answer>, overrides: Partial<TalkControlHost> = {}) => {
  const triggered: string[] = [];
  const decisions: TalkDecisionAudit[] = [];
  let lastMessageId = 5;
  const host: TalkControlHost = {
    ownership: testOwnership(),
    isGroupChat: () => true,
    getChatId: () => "chat-1",
    getActiveTalkControl: (): TalkControl | null => ({ director: true }),
    getRoster: () => [{ id: "guard", name: "Mara" }, { id: "sage", name: "Finn" }, { id: "smith", name: "Odo" }],
    getEnabledRosterIds: () => ["guard", "sage", "smith"],
    getLastSpeakerRosterId: () => null,
    getDraftedRosterId: () => "guard",
    getLastMessageId: () => lastMessageId,
    getWindow: () => [{ speaker: "User", text: "hello there" }],
    getCheckpointInfo: () => ({ id: "cp1", name: "Gate", objective: "Open it", storyTitle: "Ruins" }),
    getChainConfig: () => ({ enabled: true, max: 3, stopOnTransition: true, holdExtraction: false }),
    callDirector: async () => "SPEAKER: Mara",
    judgeDirector: judge,
    triggerMember: async (name) => { triggered.push(name); },
    recordDecision: (audit) => { decisions.push(audit); },
    ...overrides,
  };
  return { host, triggered, decisions, nextMessage: () => { lastMessageId += 1; } };
};

const held = () => {
  const gates: Array<() => void> = [];
  return { wait: () => new Promise<void>((resolve) => { gates.push(resolve); }), release: () => gates.shift()?.() };
};

const openTurn = async (controller: TalkController) => {
  controller.onWrapperStarted({ type: "normal" });
  controller.onGenerationStarted({}, "normal");
  await controller.intercept(() => undefined, "normal");
};

describe("P1 (B1 2026-10-08): a player line sent between chained voices", () => {
  it("ends the chain while it decides the next voice: the decided voice is not started or journaled, and the player's own turn opens a fresh chain", async () => {
    const director = held();
    let asked = 0;
    let drafted = "guard";
    const made = makeHost(async () => {
      asked += 1;
      if (asked === 2) { await director.wait(); return FINN; }
      return [MARA, FINN, ODO, MARA][asked - 1];
    }, { getDraftedRosterId: () => drafted });
    const controller = new TalkController(made.host);
    await openTurn(controller);
    drafted = "smith";
    const closing = controller.onWrapperFinished();
    await flush();
    expect(controller.chainPending()).toBe(true);

    controller.onGenerationStarted({}, "normal");
    made.nextMessage();
    controller.onWrapperStarted({ type: "normal" });
    controller.onGenerationStarted({}, "normal");
    await controller.intercept(() => undefined, "normal");
    director.release();
    await closing;

    expect(made.triggered).toEqual([]);
    expect(made.decisions.map((decision) => decision.chosenName)).toEqual(["Mara", "Odo"]);
    await controller.onWrapperFinished();
    expect(made.triggered).toEqual(["Mara"]);
    expect(made.decisions.at(-1)).toMatchObject({ chosenName: "Mara", chainStep: 1 });
  });

  it("a line posted without a generation (/send) in the gap also ends the chain", async () => {
    const director = held();
    let asked = 0;
    const made = makeHost(async () => {
      asked += 1;
      if (asked === 2) { await director.wait(); return FINN; }
      return MARA;
    });
    const controller = new TalkController(made.host);
    await openTurn(controller);
    const closing = controller.onWrapperFinished();
    await flush();
    controller.onPlayerMessage();
    director.release();
    await closing;
    expect(made.triggered).toEqual([]);
    expect(controller.chainPending()).toBe(false);
  });

  it("control: with no player line in the gap the decided voice is started", async () => {
    const director = held();
    let asked = 0;
    const made = makeHost(async () => {
      asked += 1;
      if (asked === 2) { await director.wait(); return FINN; }
      return MARA;
    });
    const controller = new TalkController(made.host);
    await openTurn(controller);
    const closing = controller.onWrapperFinished();
    await flush();
    director.release();
    await closing;
    expect(made.triggered).toEqual(["Finn"]);
  });

  it("a voice that cannot start (ST busy, the player typing) ends the chain instead of leaving it pending", async () => {
    const made = makeHost(async () => MARA, { triggerMember: async () => couldNot("the player is typing") });
    let asked = 0;
    made.host.judgeDirector = async () => (++asked === 1 ? MARA : FINN);
    const controller = new TalkController(made.host);
    await openTurn(controller);
    await controller.onWrapperFinished();
    await flush();
    expect(controller.chainPending()).toBe(false);
    controller.onWrapperStarted({ type: "normal" });
    controller.onGenerationStarted({ force_chid: 1 }, "normal");
    await controller.onWrapperFinished();
    expect(asked).toBe(2);
  });

  it("a line that rode a chained voice's own generation lets that voice finish and nobody follows it", async () => {
    let asked = 0;
    const made = makeHost(async () => (++asked === 1 ? MARA : asked === 2 ? FINN : ODO));
    const controller = new TalkController(made.host);
    await openTurn(controller);
    await controller.onWrapperFinished();
    expect(made.triggered).toEqual(["Finn"]);

    controller.onGenerationStarted({ force_chid: 1 }, "normal");
    controller.onWrapperStarted({ type: "normal" });
    controller.onGenerationStarted({ force_chid: 1 }, "normal");
    controller.onPlayerMessage();
    await controller.onWrapperFinished();
    expect(made.triggered).toEqual(["Finn"]);
    expect(asked).toBe(2);
  });

  it("control: a chained voice with no player line is followed by the next one", async () => {
    let asked = 0;
    const made = makeHost(async () => (++asked === 1 ? MARA : asked === 2 ? FINN : ODO));
    const controller = new TalkController(made.host);
    await openTurn(controller);
    await controller.onWrapperFinished();
    controller.onGenerationStarted({ force_chid: 1 }, "normal");
    controller.onWrapperStarted({ type: "normal" });
    controller.onGenerationStarted({ force_chid: 1 }, "normal");
    await controller.onWrapperFinished();
    expect(made.triggered).toEqual(["Finn", "Odo"]);
  });

  it("the chain's own forced start and a reply drafted inside a wrapper never count as the player's line", async () => {
    let asked = 0;
    const made = makeHost(async () => (++asked === 1 ? MARA : FINN));
    const controller = new TalkController(made.host);
    await openTurn(controller);
    controller.onGenerationStarted({}, "normal");
    const closing = controller.onWrapperFinished();
    controller.onGenerationStarted({ force_chid: 1 }, "normal");
    await closing;
    expect(made.triggered).toEqual(["Finn"]);
  });
});
