import { buildCuratorFilterRequest, curatorFilterKeep, CURATOR_FILTER_MIN_ENTRIES, CURATOR_FILTER_TIMEOUT_MS, noulAnswer } from "@judge/index";
import type { CuratorEntryView } from "@stagecraft/index";
import type { JudgeRuntime } from "./judge";

export interface CuratorFilterContext {
  checkpoint: { name: string; objective: string };
  canon: string;
  openThreads: string[];
}

export type CuratorEntryFilter = (entries: CuratorEntryView[], context: CuratorFilterContext) => Promise<CuratorEntryView[]>;

// v2.2 plan 04: the curator sees only what the story may have overtaken. Small scopes, switched-off
// entries and unanswered ones always stay; with the usage off or the judge down, nothing narrows.
export const createCuratorFilter = (judge: () => JudgeRuntime | null): CuratorEntryFilter => async (entries, context) => {
  const runtime = judge();
  if (!runtime?.active("curatorFilter") || entries.length <= CURATOR_FILTER_MIN_ENTRIES) return entries;
  const items = entries.map((entry) => ({ title: entry.comment, content: entry.content, enabled: !entry.disabled }));
  const request = buildCuratorFilterRequest({ ...context, entries: items });
  const result = await runtime.ask("curatorFilter", request, {
    timeoutMs: CURATOR_FILTER_TIMEOUT_MS,
    summarize: (answers) => {
      const keep = curatorFilterKeep(answers, items);
      return { entries: items.length, kept: keep.filter(Boolean).length, answered: answers ? items.filter((_, index) => noulAnswer(answers, `entry:${index}`) !== null).length : 0 };
    },
  });
  const keep = curatorFilterKeep(result.answers, items);
  return entries.filter((_, index) => keep[index]);
};
