import { parseStoryV2OrThrow, type EngineState } from "@engine/index";
import { defaultJudgeSettings, type JudgeRequest, type JudgeSettings } from "@judge/index";
import type { HostScannableEntry } from "@services/STAPI";
import { JudgeRuntime } from "./judge";
import { LoreSelector } from "./loreSelect";

jest.mock("@services/STAPI", () => ({}));

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

const setup = (options: { uses?: Partial<JudgeSettings["uses"]>; loreSelect?: Record<string, unknown>; fail?: boolean } = {}) => {
  const settings: JudgeSettings = { ...defaultJudgeSettings(), enabled: true, uses: { ...defaultJudgeSettings().uses, loreSelect: true, ...options.uses } };
  let lastMessageId = 4;
  const requests: JudgeRequest[] = [];
  const records: Array<{ use: string; p?: Record<string, number | string> }> = [];
  const judge = new JudgeRuntime({
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
  const selector = new LoreSelector({
    judge: () => judge,
    getStory: () => story("loreSelect" in options ? options.loreSelect : { lorebooks: ["Story Lore"] }),
    getState: () => ({ activeCheckpointId: "guild" }) as unknown as EngineState,
    getWindow: () => [{ speaker: "Max", text: `Who runs this place? (${lastMessageId})` }],
    getChatId: () => "chat-1",
    getLastMessageId: () => lastMessageId,
    getEntries: async () => scannable,
    force: async (entries) => { forced.push(entries); return true; },
  });
  return { selector, requests, records, forced, setLastMessageId: (id: number) => { lastMessageId = id; } };
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
});
