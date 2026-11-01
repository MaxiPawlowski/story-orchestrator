import { parseStoryOrThrow, type EngineState, type NormalizedStory } from "@engine/index";
import type { LoreState } from "@judge/loreState";
import type { ScanBufferView } from "./loreKeyMatch";
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
  loreState?: LoreState;
  aliases?: boolean;
  story?: NormalizedStory;
  buffer?: ScanBufferView;
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
    getStory: () => options.story ?? story,
    getState: () => ({ activeCheckpointId: state.checkpoint }) as unknown as EngineState,
    getWindow: () => state.window,
    getChatId: () => "chat-1",
    getLastMessageId: () => state.lastMessageId,
    getEntries: async () => options.entries,
    force: async (entries) => { forced.push(entries); return { ok: true as const, entries: entries.length }; },
    lexical: () => options.lexical ?? ALL,
    getPlayerTurn: () => state.playerTurn,
    getUnknownNames: async () => options.unknown ?? [],
    getLoreState: async () => options.loreState ?? null,
    aliases: () => options.aliases ?? false,
    getScanBuffer: () => options.buffer ?? null,
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

describe("scene state and aliases in lore-select (v3.0 43 L2)", () => {
  it("sends the scene state to the judge and its names to the word match; without it the request is as before", async () => {
    const loreState: LoreState = { place: "the harbour", cast: [{ name: "Mara", aliases: ["Cap"] }], quests: ["Find the pilot"], known: [] };
    const env = setup({ entries: HARBOUR, loreState, lexical: NONE });
    await env.selector.select("GENERATION_STARTED");
    expect((env.requests[0].state as { scene: Record<string, unknown> }).scene).toEqual({ name: "The Dock", goal: "Board.", place: "the harbour", cast: ["Mara (also Cap)"], quests: ["Find the pilot"] });
    const off = setup({ entries: HARBOUR, lexical: NONE });
    await off.selector.select("GENERATION_STARTED");
    expect((off.requests[0].state as { scene: Record<string, unknown> }).scene).toEqual({ name: "The Dock", goal: "Board." });
  });

  it("counts an entry a nickname will fire as left to the keyword scan, so the judge is not asked about it", async () => {
    const aliased = parseStoryOrThrow({
      id: "lex", title: "Lex", description: "", qualities: [], transitions: [], lore_select: { lorebooks: ["Lore"] },
      checkpoints: [{ id: "dock", name: "The Dock", objective: "Board.", type: "anchor", start: true }],
      roster: [{ id: "odo", name: "Odo", aliases: ["the ropeseller"] }],
    });
    const entries = [entry(2, "NPC - Odo", "Odo sells rope and gossip at the market.", ["Odo"]), entry(3, "Lore - Tides", "The tide turns twice a day.")];
    const buffer: ScanBufferView = { messages: ["Ask the ropeseller."], depth: 4, caseSensitive: false, matchWholeWords: true };
    const env = setup({ entries, story: aliased, aliases: true, buffer, lexical: NONE });
    expect((await env.selector.select("GENERATION_STARTED"))?.left.map((row) => [row.uid, row.reason])).toEqual([[2, "keyword"]]);
    const off = setup({ entries, story: aliased, aliases: false, buffer, lexical: NONE });
    expect((await off.selector.select("GENERATION_STARTED"))?.left).toEqual([]);
  });
});
