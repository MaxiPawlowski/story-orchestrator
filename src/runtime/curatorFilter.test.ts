import { defaultJudgeSettings, type JudgeRequest, type JudgeSettings } from "@judge/index";
import type { CuratorEntryView } from "@stagecraft/index";
import { createCuratorFilter } from "./curatorFilter";
import { JudgeRuntime } from "./judge";

const views = (count: number, disabled: number[] = []): CuratorEntryView[] => Array.from({ length: count }, (_, index) => ({ lorebook: "Story Lore", comment: `Entry ${index}`, keys: [], content: `About ${index}.`, disabled: disabled.includes(index) }));
const context = { checkpoint: { name: "The bank", objective: "Cross" }, canon: "The flood took the bridge.", openThreads: ["Who cut the ropes?"] };

const setup = (options: { on?: boolean; p?: (index: number) => number | null; fail?: boolean } = {}) => {
  const settings: JudgeSettings = { ...defaultJudgeSettings(), enabled: true, uses: { ...defaultJudgeSettings().uses, curatorFilter: options.on ?? true } };
  const requests: JudgeRequest[] = [];
  const records: Array<{ use: string; p?: Record<string, number | string> }> = [];
  const judge = new JudgeRuntime({
    getSettings: () => settings,
    transport: async (request) => {
      requests.push(request);
      if (options.fail) throw new Error("down");
      const answers = Object.keys(request.questions).flatMap((id) => {
        const p = (options.p ?? (() => 0.9))(Number(id.split(":")[1]));
        return p === null ? [] : [[id, { type: "noul" as const, noul: p }]];
      });
      return { model: "jev-1.13.0", answers: Object.fromEntries(answers) };
    },
    status: async () => ({ configured: true }),
    record: (record) => records.push({ use: record.use, ...(record.p ? { p: record.p } : {}) }),
    context: () => ({ boundary: 1, messageId: 4 }),
  });
  return { filter: createCuratorFilter(() => judge), requests, records };
};

describe("curator pre-filter (v2.2 plan 04)", () => {
  it("narrows nothing with the usage off or a scope of 12 or fewer, and asks nothing", async () => {
    for (const [options, count] of [[{ on: false }, 20], [{}, 12]] as const) {
      const env = setup(options);
      expect(await env.filter(views(count), context)).toHaveLength(count);
      expect(env.requests).toHaveLength(0);
    }
  });

  it("keeps entries over the cut, every switched-off entry and every unanswered one", async () => {
    const env = setup({ p: (index) => (index === 3 ? null : index < 2 ? 0.6 : 0.05) });
    const kept = await env.filter(views(14, [5]), context);
    expect(kept.map((entry) => entry.comment)).toEqual(["Entry 0", "Entry 1", "Entry 3", "Entry 5"]);
    expect(env.requests[0].state).toMatchObject({ checkpoint: context.checkpoint, open_threads: context.openThreads });
    expect(env.records).toEqual([{ use: "curatorFilter", p: { entries: 14, kept: 4, answered: 13 } }]);
  });

  it("shows the curator everything when the judge is down", async () => {
    const env = setup({ fail: true });
    expect(await env.filter(views(14), context)).toHaveLength(14);
  });
});
