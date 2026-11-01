import { parseStoryOrThrow, type EngineState } from "@engine/index";
import { createJudgeGate, defaultJudgeSettings, type JudgeRequest, type JudgeSettings } from "@judge/index";
import type { HostScannableEntry } from "@services/STAPI";
import { JudgeRuntime } from "./judge";
import { LoreSelector, type LoreLexicalOptions } from "./loreSelect";
import { mintToken, tokenMatches, type RunContext, type RunOwnership } from "./runToken";
import { testOwnership } from "../../test/findings/testOwnership";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
}));

const story = parseStoryOrThrow({
  id: "lex", title: "Lex", description: "",
  qualities: [{ key: "done", type: "bool", source: "extractor", rubric: "Done?" }],
  checkpoints: [{ id: "dock", name: "The Dock", objective: "Board.", type: "anchor", start: true }, { id: "sea", name: "At Sea", objective: "Sail.", type: "anchor" }],
  transitions: [],
  roster: [],
  lore_select: { lorebooks: ["Lore"] },
});

const entry = (uid: number, comment: string, content: string, key: string[] = []): HostScannableEntry => ({ world: "Lore", uid, comment, content, key });

const ALL: LoreLexicalOptions = { fallback: true, prefilter: true, tiebreak: true, hold: true, preferKnown: true };
const NONE: LoreLexicalOptions = { fallback: false, prefilter: false, tiebreak: false, hold: false, preferKnown: false };

const setup = (options: {
  entries: HostScannableEntry[];
  p?: (title: string) => number;
  fail?: boolean;
  lexical?: LoreLexicalOptions;
  unknown?: string[];
}) => {
  const settings: JudgeSettings = { ...defaultJudgeSettings(), enabled: true, uses: { ...defaultJudgeSettings().uses, loreSelect: true } };
  const requests: JudgeRequest[] = [];
  const judge = new JudgeRuntime({ ownership: testOwnership(),
    gate: createJudgeGate({ now: () => Date.now() }),
    getSettings: () => settings,
    transport: async (request) => {
      requests.push(request);
      if (options.fail) throw new Error("down");
      return { model: "jev-1.13.0", answers: Object.fromEntries(Object.entries(request.questions).map(([id, question]) => {
        const title = /Entry "([^"]+)"/.exec(question.instructions)?.[1] ?? "";
        return [id, { type: "noul" as const, noul: options.p?.(title) ?? 0.1 }];
      })) };
    },
    status: async () => ({ configured: true }),
    record: () => undefined,
    context: () => ({ boundary: 1, messageId: 4 }),
  });
  const state = { checkpoint: "dock", lastMessageId: 4, playerTurn: 3 as number | null, window: [{ speaker: "Max", text: "Is the harbour master here?" }] };
  const forced: HostScannableEntry[][] = [];
  const context: RunContext = { chatId: "chat-1", storyId: "lex", storyHash: "h1", sessionEpoch: 1, windowRevision: 0 };
  const ownership: RunOwnership = { mint: (window) => mintToken(context, window), check: (token) => tokenMatches(context, token) };
  const selector = new LoreSelector({
    judge: () => judge,
    getStory: () => story,
    getState: () => ({ activeCheckpointId: state.checkpoint }) as unknown as EngineState,
    getWindow: () => state.window,
    getChatId: () => "chat-1",
    getLastMessageId: () => state.lastMessageId,
    getEntries: async () => options.entries,
    force: async (entries) => { forced.push(entries); return { ok: true as const, entries: entries.length }; },
    lexical: () => options.lexical ?? ALL,
    getPlayerTurn: () => state.playerTurn,
    getUnknownNames: async () => options.unknown ?? [],
    ownership,
  });
  return { selector, requests, forced, state };
};

const HARBOUR = [
  entry(1, "Place - Harbour", "The harbour master keeps the ledger of every ship.", ["harbour"]),
  entry(2, "NPC - Odo", "Odo sells rope and gossip at the market."),
  entry(3, "Lore - Tides", "The tide turns twice a day."),
];

describe("lexical lore arm (plan 42a G5)", () => {
  it("falls back to the best lexical picks when the judge gives no answer, and never records a complete selection", async () => {
    const env = setup({ entries: HARBOUR, fail: true });
    const selection = await env.selector.select("GENERATION_STARTED");
    expect(selection?.lexical).toBe(true);
    expect(selection?.picks.map((pick) => pick.uid)).toEqual([1]);
    expect(env.forced.at(-1)?.map((entry) => entry.uid)).toEqual([1]);
    expect(env.selector.completeSelection()).toBeNull();
  });

  it("forces nothing extra when the fallback is off", async () => {
    const env = setup({ entries: HARBOUR, fail: true, lexical: { ...ALL, fallback: false } });
    const selection = await env.selector.select("GENERATION_STARTED");
    expect(selection?.lexical).toBeUndefined();
    expect(selection?.picks).toEqual([]);
  });

  it("asks the judge only about the top lexical pool when the candidate set is larger", async () => {
    const many = Array.from({ length: 20 }, (_, index) => entry(10 + index, `Lore - Filler ${index}`, `Unrelated filler number ${index}.`));
    const env = setup({ entries: [...HARBOUR, ...many] });
    await env.selector.select("GENERATION_STARTED");
    expect(env.requests.reduce((sum, request) => sum + Object.keys(request.questions).length, 0)).toBe(12);
    const off = setup({ entries: [...HARBOUR, ...many], lexical: NONE });
    await off.selector.select("GENERATION_STARTED");
    expect(off.requests.reduce((sum, request) => sum + Object.keys(request.questions).length, 0)).toBe(23);
  });

  it("breaks an equal judge score by lexical score instead of uid", async () => {
    const env = setup({ entries: [entry(1, "Lore - Tides", "The tide turns twice a day."), entry(2, "Place - Harbour", "The harbour master keeps the ledger.")], p: () => 0.8, lexical: { ...ALL, prefilter: false } });
    expect((await env.selector.select("GENERATION_STARTED"))?.picks.map((pick) => pick.uid)).toEqual([2, 1]);
    const off = setup({ entries: [entry(1, "Lore - Tides", "The tide turns twice a day."), entry(2, "Place - Harbour", "The harbour master keeps the ledger.")], p: () => 0.8, lexical: NONE });
    expect((await off.selector.select("GENERATION_STARTED"))?.picks.map((pick) => pick.uid)).toEqual([1, 2]);
  });
});

describe("hold lore across a round (plan 42a G6)", () => {
  it("reuses the judge's scores for the rest of the round and asks again on a player message", async () => {
    const env = setup({ entries: HARBOUR, p: (title) => (title.includes("Harbour") ? 0.9 : 0.2) });
    await env.selector.select("GENERATION_STARTED");
    const asked = env.requests.length;
    env.state.lastMessageId = 5;
    env.state.window = [...env.state.window, { speaker: "Mara", text: "He went out on the tide." }];
    await env.selector.select("GENERATION_STARTED");
    expect(env.requests.length).toBe(asked);
    env.state.playerTurn = 6;
    env.state.lastMessageId = 6;
    env.state.window = [...env.state.window, { speaker: "Max", text: "Then we wait." }];
    await env.selector.select("GENERATION_STARTED");
    expect(env.requests.length).toBeGreaterThan(asked);
  });

  it("asks again when the checkpoint or the entries named in the window change", async () => {
    const env = setup({ entries: HARBOUR });
    await env.selector.select("GENERATION_STARTED");
    const asked = env.requests.length;
    env.state.window = [...env.state.window, { speaker: "Mara", text: "Odo will know." }];
    env.state.lastMessageId = 5;
    await env.selector.select("GENERATION_STARTED");
    expect(env.requests.length).toBeGreaterThan(asked);
    const again = env.requests.length;
    env.state.checkpoint = "sea";
    await env.selector.select("GENERATION_STARTED");
    expect(env.requests.length).toBeGreaterThan(again);
  });

  it("asks per member message when holding is off", async () => {
    const env = setup({ entries: HARBOUR, lexical: NONE });
    await env.selector.select("GENERATION_STARTED");
    const asked = env.requests.length;
    env.state.lastMessageId = 5;
    env.state.window = [...env.state.window, { speaker: "Mara", text: "He went out on the tide." }];
    await env.selector.select("GENERATION_STARTED");
    expect(env.requests.length).toBeGreaterThan(asked);
  });
});

describe("prefer known entities (plan 42a G7)", () => {
  it("lowers an entry about an unmet entity by 0.1 before the cut", async () => {
    const env = setup({ entries: HARBOUR, p: (title) => (title.includes("Odo") ? 0.65 : title.includes("Harbour") ? 0.62 : 0.1), unknown: ["Odo"], lexical: { ...ALL, prefilter: false } });
    expect((await env.selector.select("GENERATION_STARTED"))?.picks.map((pick) => pick.uid)).toEqual([1]);
    const off = setup({ entries: HARBOUR, p: (title) => (title.includes("Odo") ? 0.65 : title.includes("Harbour") ? 0.62 : 0.1), unknown: ["Odo"], lexical: NONE });
    expect((await off.selector.select("GENERATION_STARTED"))?.picks.map((pick) => pick.uid)).toEqual([2, 1]);
  });

  it("never lets the lexical fallback force an entry about an unmet entity", async () => {
    const env = setup({ entries: HARBOUR, fail: true, unknown: ["Odo"] });
    env.state.window = [{ speaker: "Max", text: "Where is Odo? Odo owes me rope." }];
    expect((await env.selector.select("GENERATION_STARTED"))?.picks.map((pick) => pick.uid)).not.toContain(2);
  });
});
