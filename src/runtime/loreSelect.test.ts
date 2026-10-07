import { parseStoryV2OrThrow, type EngineState } from "@engine/index";
import { defaultJudgeSettings, type JudgeRequest, type JudgeSettings } from "@judge/index";
import type { HostScannableEntry } from "@services/STAPI";
import { JudgeRuntime } from "./judge";
import { LoreSelector } from "./loreSelect";
import { settledWindowAccess } from "./settledWindow";
import { windowOf } from "@extraction/chatRows";
import { mintToken, tokenMatches, type RunContext, type RunOwnership } from "./runToken";
import { testOwnership } from "../../test/findings/testOwnership";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,}));

const story = (loreSelect: Record<string, unknown> | undefined) => parseStoryV2OrThrow({
  format: 2,
  id: "lore-fixture",
  title: "Lore",
  description: "Lore-select fixture.",
  qualities: [{ key: "done", type: "bool", source: "extractor", rubric: "Done?" }],
  checkpoints: [{ id: "guild", name: "The Guild", objective: "Sign up.", type: "anchor", start: true }],
  transitions: [],
  roster: [],
  ...(loreSelect ? { lore_select: loreSelect } : {}),
});

const entry = (world: string, uid: number, patch: Partial<HostScannableEntry> = {}): HostScannableEntry => ({ world, uid, comment: `${world} ${uid}`, content: `About ${uid}`, ...patch });
const scannable = [entry("Story Lore", 1), entry("Story Lore", 2), entry("Story Lore", 3, { disable: true }), entry("Story Lore", 4, { constant: true }), entry("Other Lore", 5), entry("story lore", 6)];
const P: Record<string, number> = { "Story Lore 1": 0.9, "Story Lore 2": 0.4, "Story Lore 3": 0.99, "story lore 6": 0.8 };

const setup = (options: { uses?: Partial<JudgeSettings["uses"]>; loreSelect?: Record<string, unknown>; fail?: boolean; forceFails?: boolean; window?: () => Array<{ speaker: string; text: string }> } = {}) => {
  const settings: JudgeSettings = { ...defaultJudgeSettings(), enabled: true, uses: { ...defaultJudgeSettings().uses, loreSelect: true, ...options.uses } };
  let lastMessageId = 4;
  const requests: JudgeRequest[] = [];
  const records: Array<{ use: string; p?: Record<string, number | string> }> = [];
  const judge = new JudgeRuntime({ ownership: testOwnership(),
    getSettings: () => settings,
    transport: async (request) => {
      requests.push(request);
      if (options.fail) throw new Error("down");
      return { model: "jev-1.13.0", answers: Object.fromEntries(Object.entries(request.questions).map(([id, question]) => [id, { type: "noul" as const, noul: Object.entries(P).find(([title]) => question.instructions.includes(`"${title}"`))?.[1] ?? 0.1 }])) };
    },
    status: async () => ({ configured: true }),
    record: (record) => records.push({ use: record.use, ...(record.p ? { p: record.p } : {}) }),
    context: () => ({ boundary: 1, messageId: 4 }),
  });
  const forced: HostScannableEntry[][] = [];
  // One mutable identity, used by BOTH the story the deps hand out and the ownership context, the
  // way the runtime keeps them in step (RunOwner reads the loaded record).
  let storyId = "lore-fixture";
  const context: RunContext = { chatId: "chat-1", storyId, playedVersion: 1, sessionEpoch: 1, windowRevision: 0 };
  const ownership: RunOwnership = { mint: (window) => mintToken(context, window), check: (token) => tokenMatches(context, token) };
  const selector = new LoreSelector({
    judge: () => judge,
    getStory: () => ({ ...story("loreSelect" in options ? options.loreSelect : { lorebooks: ["Story Lore"] }), id: storyId }),
    getState: () => ({ activeCheckpointId: "guild" }) as unknown as EngineState,
    getWindow: options.window ?? (() => [{ speaker: "Max", text: `Who runs this place? (${lastMessageId})` }]),
    getChatId: () => "chat-1",
    getLastMessageId: () => lastMessageId,
    getEntries: async () => scannable,
    force: async (entries) => { forced.push(entries); return options.forceFails ? { ok: false as const, reason: "the scan was refused" } : { ok: true as const, entries: entries.length }; },
    ownership,
  });
  return {
    selector, requests, records, forced, context,
    setLastMessageId: (id: number) => { lastMessageId = id; },
    setStoryId: (id: string) => { storyId = id; context.storyId = id; context.sessionEpoch += 1; },
  };
};

describe("LoreSelector (v2.2 plan 04)", () => {
  it("does nothing with the usage off or no authored scope", async () => {
    const off = setup({ uses: { loreSelect: false } });
    expect(await off.selector.select("MESSAGE_SENT")).toBeNull();
    const unscoped = setup({ loreSelect: undefined });
    expect(await unscoped.selector.select("MESSAGE_SENT")).toBeNull();
    expect([...off.requests, ...unscoped.requests]).toEqual([]);
  });

  it("asks only about scoped, enabled, non-constant entries, and forces the scan's own objects over the floor", async () => {
    const env = setup();
    const selection = await env.selector.select("MESSAGE_SENT");
    const asked = Object.values(env.requests[0].questions).map((question) => question.instructions.match(/Entry "([^"]+)"/)?.[1]);
    expect(asked).toEqual(["Story Lore 1", "Story Lore 2", "story lore 6"]);
    expect(selection).toEqual({ trigger: "MESSAGE_SENT", cached: false, picks: [{ world: "Story Lore", uid: 1, comment: "Story Lore 1", p: 0.9 }, { world: "story lore", uid: 6, comment: "story lore 6", p: 0.8 }] });
    expect(env.forced).toEqual([[scannable[0], scannable[5]]]);
    expect(env.records).toEqual([{ use: "lore", p: { trigger: "MESSAGE_SENT", "Story Lore 1": 0.9, "story lore 6": 0.8 } }]);
  });

  it("re-forces the same picks without asking again at the same message, and asks again at the next", async () => {
    const env = setup();
    await env.selector.select("GENERATION_STARTED");
    const again = await env.selector.select("GENERATION_STARTED");
    expect(again?.cached).toBe(true);
    expect(env.requests).toHaveLength(1);
    expect(env.forced).toHaveLength(2);
    env.setLastMessageId(5);
    await env.selector.select("GENERATION_STARTED");
    expect(env.requests).toHaveLength(2);
  });

  it("forces nothing when the judge fails, and honours an authored top_k", async () => {
    const failed = setup({ fail: true });
    expect((await failed.selector.select("MESSAGE_SENT"))?.picks).toEqual([]);
    expect(failed.forced).toEqual([]);
    expect(failed.records[0]).toMatchObject({ use: "lore" });
    const one = setup({ loreSelect: { lorebooks: ["Story Lore"], top_k: 1 } });
    expect((await one.selector.select("MESSAGE_SENT"))?.picks.map((pick) => pick.uid)).toEqual([1]);
  });

  // v2.3 plan 11 §Fault matrix. A force the host refused used to be reported exactly like one that
  // landed: the selection came back with its picks and the caller had no way to tell that the next
  // generation would scan on ST's ordinary keywords instead.
  it("reports no selection when the host refuses the force, and does not claim it applied", async () => {
    const env = setup({ forceFails: true });
    expect(await env.selector.select("MESSAGE_SENT")).toBeNull();
    expect(env.forced).toEqual([[scannable[0], scannable[5]]]);
    const again = await env.selector.select("MESSAGE_SENT");
    expect(again).toBeNull();
    expect(env.requests).toHaveLength(1);
  });

  // The hole the first reading of this file could not see, and the reason the fix is in the key
  // rather than in a token: the token is minted at the START of a call, so by construction it
  // cannot tell that a cache entry was built under a story the chat has since left. The key names
  // the chat, the message and the scope — so a swap to a story with the SAME lore scope matched the
  // departed story's cache and forced ITS picks into the new story's next generation. A token
  // check would have returned true here.
  it("does not reuse a cached selection after the chat swaps stories under the same lore scope", async () => {
    const env = setup();
    await env.selector.select("MESSAGE_SENT");
    expect(env.forced).toHaveLength(1);
    env.setStoryId("a-story-that-replaced-it");
    const after = await env.selector.select("MESSAGE_SENT");
    expect(after?.cached).toBe(false);
    expect(env.forced).toHaveLength(2);
    // The transport count does NOT move: the question is byte-identical, so the judge's own session
    // cache answers it. `cached: false` and the second force are what say the LORE cache was not
    // reused — the two caches are separate and only one of them was scoped to a story.
    expect(env.requests).toHaveLength(1);
  });
});

describe("L5: the complete selection exclusive mode may act on", () => {
  it("records this generation's picks only when every chunk answered and the force landed", async () => {
    const env = setup();
    await env.selector.select("MESSAGE_SENT");
    expect(env.selector.completeSelection()).toEqual({ chatId: "chat-1", storyKey: "lore-fixture@1", messageId: 4, picks: [{ world: "Story Lore", uid: 1 }, { world: "story lore", uid: 6 }] });
  });

  it("X3: a judge that did not answer leaves no selection, so the keyword scan stands", async () => {
    const env = setup({ fail: true });
    await env.selector.select("MESSAGE_SENT");
    expect(env.selector.completeSelection()).toBeNull();
  });

  it("X3: a refused force leaves no selection", async () => {
    const env = setup({ forceFails: true });
    await env.selector.select("MESSAGE_SENT");
    expect(env.selector.completeSelection()).toBeNull();
  });

  it("the cached re-force at the same message keeps the picks; another story's ask at a new message records its own", async () => {
    const env = setup();
    await env.selector.select("MESSAGE_SENT");
    await env.selector.select("GENERATION_STARTED");
    expect(env.selector.completeSelection()?.picks).toHaveLength(2);
    env.setLastMessageId(6);
    env.setStoryId("elsewhere");
    await env.selector.select("GENERATION_STARTED");
    expect(env.selector.completeSelection()).toMatchObject({ storyKey: "elsewhere@1", messageId: 6 });
  });
});

describe("Sol finding 10: a discarded swipe cannot steer lore selection", () => {
  const discarded = "The innkeeper hands over the cellar key and points at the trapdoor.";
  const before = [{ name: "Mara", is_user: false, mes: "Welcome to the inn." }, { name: "Max", is_user: true, mes: "Where is the cellar?" }];
  const swiping = [...before, { name: "Mara", is_user: false, mes: discarded, swipes: [discarded], swipe_id: 1 }];
  const windowOver = (chat: unknown[]) => settledWindowAccess(() => chat, (from, to) => windowOf(chat, from, to), 8).recentWindow;

  it("asks the judge exactly what it asks for the same chat with that reply removed", async () => {
    const during = setup({ window: windowOver(swiping) });
    const equivalent = setup({ window: windowOver(before) });
    await during.selector.select("GENERATION_STARTED");
    await equivalent.selector.select("GENERATION_STARTED");
    expect(during.requests).toEqual(equivalent.requests);
    expect(JSON.stringify(during.requests)).not.toContain("cellar key");
  });

  it("control: the raw chat would have carried it", async () => {
    const raw = setup({ window: () => swiping.map((row) => ({ speaker: row.name, text: row.mes })) });
    await raw.selector.select("GENERATION_STARTED");
    expect(JSON.stringify(raw.requests)).toContain("cellar key");
  });
});
