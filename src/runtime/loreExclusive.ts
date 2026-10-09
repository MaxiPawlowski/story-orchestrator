import { gatedWorldInfo, type NormalizedStoryV2 } from "@engine/index";
import type { HostScannableEntry } from "@services/STAPI";
import { loreStoryKey, type CompleteLoreSelection } from "./loreSelect";
import { bookKey, entryComment } from "./worldInfoMatch";

export type LoreExclusiveRefusal = "use-off" | "not-scan" | "story-off" | "not-loud" | "vectors-wi" | "no-selection";

export interface LoreExclusiveSources {
  useActive: () => boolean;
  scanActive: () => boolean;
  story: () => NormalizedStoryV2 | null;
  chatId: () => string | null;
  messageId: () => number;
  loud: () => boolean;
  vectorsScanWorldInfo: () => boolean;
  selection: () => CompleteLoreSelection | null;
}

export type LoreExclusivePlan =
  | { refusal: LoreExclusiveRefusal }
  | { refusal: null; books: Set<string>; picks: Set<string>; gated: Set<string> };

export interface LoreExclusiveStats {
  suppressed: number;
  picked: number;
  constant: number;
  gated: number;
  timed: number;
  missingKey: number;
}

const TIMED_KEYS = ["sticky", "cooldown", "delay"] as const;

const entryKey = (world: string, uid: number) => `${bookKey(world)}|${uid}`;
const commentKey = (world: string, comment: string) => `${bookKey(world)}|${comment}`;

export function loreExclusiveFor(sources: LoreExclusiveSources): LoreExclusivePlan {
  if (!sources.useActive()) return { refusal: "use-off" };
  if (!sources.scanActive()) return { refusal: "not-scan" };
  const story = sources.story();
  if (!story?.lore_select?.exclusive || !story.lore_select.lorebooks.length) return { refusal: "story-off" };
  if (!sources.loud()) return { refusal: "not-loud" };
  if (sources.vectorsScanWorldInfo()) return { refusal: "vectors-wi" };
  const selection = sources.selection();
  const chatId = sources.chatId();
  if (!selection || chatId === null || selection.chatId !== chatId || selection.storyKey !== loreStoryKey(story) || selection.messageId !== sources.messageId()) {
    return { refusal: "no-selection" };
  }
  const gated = new Set<string>();
  for (const [lorebook, comments] of gatedWorldInfo([story])) for (const comment of comments) gated.add(commentKey(lorebook, comment));
  return {
    refusal: null,
    books: new Set(story.lore_select.lorebooks.map(bookKey)),
    picks: new Set([...selection.picks, ...selection.left].map((pick) => entryKey(pick.world, pick.uid))),
    gated,
  };
}

const emptyStats = (): LoreExclusiveStats => ({ suppressed: 0, picked: 0, constant: 0, gated: 0, timed: 0, missingKey: 0 });

const isTimed = (entry: HostScannableEntry) => TIMED_KEYS.some((key) => Number(entry[key]) > 0);

type Verdict = Exclude<keyof LoreExclusiveStats, "suppressed"> | "suppress" | "outside";

function verdictFor(entry: HostScannableEntry, plan: Extract<LoreExclusivePlan, { refusal: null }>): Verdict {
  if (typeof entry?.world !== "string" || !plan.books.has(bookKey(entry.world)) || entry.disable === true) return "outside";
  if (plan.picks.has(entryKey(entry.world, entry.uid))) return "picked";
  if (entry.constant === true) return "constant";
  if (plan.gated.has(commentKey(entry.world, entryComment(entry)))) return "gated";
  if (isTimed(entry)) return "timed";
  return Object.prototype.hasOwnProperty.call(entry, "disable") ? "suppress" : "missingKey";
}

export function applyLoreExclusive(arrays: HostScannableEntry[][], plan: LoreExclusivePlan): LoreExclusiveStats {
  const stats = emptyStats();
  if (plan.refusal !== null) return stats;
  for (const entry of arrays.flat()) {
    const verdict = verdictFor(entry, plan);
    if (verdict === "outside") continue;
    if (verdict !== "suppress") {
      stats[verdict] += 1;
      continue;
    }
    entry.disable = true;
    stats.suppressed += 1;
  }
  return stats;
}
