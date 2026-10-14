import type { InnerBeat } from "@memory/index";
import { loadInnerRender } from "@memory/index";
import { createInnerBeatHost, type InnerBeatHostDeps } from "../innerBeatHost";
import { installSpikeSeams, type CarryInput } from "../spikeSeams";
import { aimsIn, CARRY_LABEL, CARRY_MAX_CHARS, CARRY_WINDOW, pickCarry, ThoughtCarry } from "./thoughtCarry";

beforeAll(async () => { await loadInnerRender(); });

type ChatRow = { name: string; mes: string; is_user?: boolean; is_system?: boolean; extra?: { reasoning?: string } };

const KAEL = [
  "Kael's character: proud, guarded.",
  "Kael's goals: get the map back before the guild council meets.",
  "Response: Kael will answer curtly.",
  "Plan:",
  "- Kael will glare at Max.",
  "- I need to write two paragraphs and keep the tone tense.",
].join("\n");

const LYRA = "Lyra wants to leave the city before dawn. I should describe the rain.";

const chat = (): ChatRow[] => [
  { name: "Kael", mes: "Give it back.", extra: { reasoning: KAEL } },
  { name: "Max", mes: "No.", is_user: true },
  { name: "Lyra", mes: "Enough, both of you.", extra: { reasoning: LYRA } },
];

const input = (rows: ChatRow[], name = "Kael", from = 0, players: string[] = ["Max"]): CarryInput => ({ rosterId: name.toLowerCase(), name, rows, players, from });

describe("v2.8 A13 L5 thought carry: the pure picker", () => {
  it("takes the member's own standing aim from a goals line before any action step", () => {
    expect(aimsIn(KAEL, "Kael", ["Max"])[0]).toBe("get the map back before the guild council meets.");
    expect(pickCarry(input(chat()))).toEqual({ line: `${CARRY_LABEL} get the map back before the guild council meets.`, messageId: 0 });
  });

  it("takes a stated want when no goals line exists, and never another member's reasoning", () => {
    expect(pickCarry(input(chat(), "Lyra")).line).toBe("");
    const rows = [...chat(), { name: "Max", mes: "Fine.", is_user: true }];
    expect(pickCarry(input(rows, "Lyra"))).toEqual({ line: `${CARRY_LABEL} Lyra wants to leave the city before dawn.`, messageId: 2 });
    expect(pickCarry(input(rows, "Kael")).line).not.toContain("Lyra");
  });

  it("refuses every writing instruction and meta line (negative controls)", () => {
    const meta = [
      "Kael's goals: write a vivid reply.", "Kael wants to narrate the vault.", "Kael needs to describe the room.", "Goals: keep the tone dark.",
      "She wants to end the reply on a hook.", "He plans to respond in two paragraphs.", "I want to portray her as cold.", "Kael wants to stay in character.",
      "Kael intends to follow the user's lead.", "Kael's priority: advance the plot.", "Goal: depict the rain.", "She hopes to move the scene along.",
      "They want the dialogue to feel tense.", "Kael wants to show his personality traits.", "Aims: stop where Max can act.", "Kael plans to use third person prose.",
      "He wants to add sensory detail.", "Motivation: the reader should feel dread.", "Kael aims to match the persona card.", "Kael wants to obey the system prompt.",
      "I should write Kael's response.", "Kael wants to give NPCs a voice.",
    ];
    for (const line of meta) expect([line, aimsIn(line, "Kael", ["Max"])]).toEqual([line, []]);
  });

  it("refuses a line whose subject is the player, or another named character", () => {
    expect(aimsIn("Max wants to open the door.", "Kael", ["Max"])).toEqual([]);
    expect(aimsIn("Lyra wants to open the door.", "Kael", ["Max"])).toEqual([]);
    expect(aimsIn("Goals: Max hands over the map.", "Kael", ["Max"])).toEqual([]);
    expect(aimsIn("Kael wants Max to hand over the map.", "Kael", ["Max"])).toEqual(["Kael wants Max to hand over the map."]);
  });

  it("skips the member's in-progress draft row, reads only the window and the current checkpoint", () => {
    const drafting = [...chat(), { name: "Max", mes: "Well?", is_user: true }, { name: "Kael", mes: "", extra: { reasoning: "Kael's goals: something newer" } }];
    expect(pickCarry(input(drafting)).messageId).toBe(0);
    expect(pickCarry(input(chat(), "Kael", 1))).toEqual({ line: "", reason: "no-reply" });
    const long: ChatRow[] = [chat()[0], ...Array.from({ length: CARRY_WINDOW + 1 }, (_, index) => ({ name: "Max", mes: `line ${index}`, is_user: true }))];
    expect(pickCarry(input(long))).toEqual({ line: "", reason: "no-reply" });
  });

  it("names why nothing was carried", () => {
    expect(pickCarry(input([{ name: "Kael", mes: "Hm." }, { name: "Max", mes: "?", is_user: true }]))).toEqual({ line: "", reason: "no-reasoning", messageId: 0 });
    expect(pickCarry(input([{ name: "Kael", mes: "Hm.", extra: { reasoning: "I need to write a reply." } }, { name: "Max", mes: "?", is_user: true }])))
      .toEqual({ line: "", reason: "no-aim", messageId: 0 });
  });

  it("clips a long aim at a word boundary", () => {
    const aim = aimsIn(`Goals: ${"reach the tower and ".repeat(20)}rest.`, "Kael", [])[0];
    expect(aim.length).toBeLessThanOrEqual(CARRY_MAX_CHARS + 1);
    expect(aim.endsWith("…")).toBe(true);
  });

  it("rollback ≡ replay: the line is a function of the rows alone, so a cut chat and a chat that never grew agree, and a swipe changes it", () => {
    const grown = [...chat(), { name: "Max", mes: "Fine.", is_user: true }, { name: "Kael", mes: "Then go.", extra: { reasoning: "Kael wants to lock the gate behind them." } }, { name: "Max", mes: "Bye.", is_user: true }];
    for (let cut = 1; cut <= grown.length; cut += 1) {
      const replayed = JSON.parse(JSON.stringify(grown.slice(0, cut))) as ChatRow[];
      expect(pickCarry(input(grown.slice(0, cut)))).toEqual(pickCarry(input(replayed)));
    }
    const swiped = grown.map((row, index) => (index === 4 ? { ...row, extra: { reasoning: "Kael's goals: buy a horse." } } : row));
    expect(pickCarry(input(grown)).line).toContain("lock the gate");
    expect(pickCarry(input(swiped)).line).toContain("buy a horse");
  });

  it("switched off answers off and counts; it keeps no state but counters", () => {
    let on = false;
    const carry = new ThoughtCarry(() => on);
    expect(carry.carry(input(chat()))).toEqual({ line: "", reason: "off" });
    on = true;
    expect(carry.carry(input(chat())).line).toContain("get the map back");
    expect(carry.carry(input(chat(), "Nobody")).reason).toBe("no-reply");
    expect(carry.stats).toEqual({ asked: 3, carried: 1, off: 1, noReply: 1, noReasoning: 0, noAim: 0 });
    expect(Object.keys(carry)).toEqual(["enabled", "stats"]);
  });
});

describe("v2.8 A13 L5 thought carry: the beat host", () => {
  const rows: ChatRow[] = [...chat(), { name: "Max", mes: "Well?", is_user: true }];
  const host = (over: Partial<InnerBeatHostDeps> = {}, beats: InnerBeat[] = []) => {
    const journal = jest.fn();
    const model = jest.fn();
    const deps = {
      getStory: () => ({ roster: [{ id: "kael", name: "Kael" }], requirements: { personas: ["Max"] } }),
      getState: () => ({ activeCheckpointId: "cp1", checkpointStartedMessageId: -1 }),
      chatId: () => "chat-a",
      chatRows: () => rows,
      getBeats: () => beats,
      setBeats: () => {},
      journal,
      model,
      enabled: () => true,
      harvest: () => true,
      personas: () => ["Max"],
      memberName: (id: string) => (id === "kael" ? "Kael" : id),
      ...over,
    } as unknown as InnerBeatHostDeps;
    return { beatFor: createInnerBeatHost(deps).beatFor, journal, model };
  };
  let release = () => {};
  beforeEach(() => { const carry = new ThoughtCarry(() => true); release = installSpikeSeams({ carry: (value) => carry.carry(value) }); });
  afterEach(() => release());

  it("carries the member's own aim when no fresh beat exists, journals it, and asks no model", () => {
    const { beatFor, journal, model } = host();
    expect(beatFor("kael")).toBe(`${CARRY_LABEL} get the map back before the guild council meets.`);
    expect(journal).toHaveBeenCalledWith("No inner beat for Kael", undefined);
    expect(journal).toHaveBeenLastCalledWith("Inner thought carried for Kael", "from message 0");
    expect(model).not.toHaveBeenCalled();
  });

  it("a fresh beat wins over the carry", () => {
    const beat: InnerBeat = { chatId: "chat-a", memberId: "kael", basedOnMessageId: 2, checkpointId: "cp1", beat: "Stall them.", at: "t" };
    expect(host({}, [beat]).beatFor("kael")).toBe("Stall them.");
  });

  it("never carries with the reasoning harvest off, the inner beat off, or the spike seam absent", () => {
    expect(host({ harvest: () => false }).beatFor("kael")).toBe("");
    expect(host({ enabled: () => false }).beatFor("kael")).toBe("");
    release();
    expect(host().beatFor("kael")).toBe("");
  });

  it("reads only rows after the checkpoint started", () => {
    const { beatFor, journal } = host({ getState: () => ({ activeCheckpointId: "cp1", checkpointStartedMessageId: 0 }) } as never);
    expect(beatFor("kael")).toBe("");
    expect(journal).toHaveBeenLastCalledWith("No thought to carry for Kael", "no-reply");
  });
});
