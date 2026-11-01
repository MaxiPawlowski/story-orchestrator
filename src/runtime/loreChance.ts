import type { HostScannableEntry } from "@services/STAPI";
import { lorePlacementBooks } from "./lorePlacement";
import type { NormalizedStory } from "@engine/index";
import { bookKey } from "./worldInfoMatch";

export type LoreChanceRefusal = "setting-off" | "not-owned" | "no-books" | "no-seed";

export interface LoreChanceSources {
  enabled: () => boolean;
  story: () => NormalizedStory | null;
  chatId: () => string | null;
  ownedChat: () => string | null;
  roll: (book: string, uid: number) => number | null;
}

export type LoreChancePlan =
  | { refusal: LoreChanceRefusal }
  | { refusal: null; books: Set<string>; roll: (book: string, uid: number) => number | null };

export interface LoreChanceStats {
  rolled: number;
  passed: number;
  failed: number;
  sticky: number;
  weightedGroups: string[];
}

export function loreChanceFor(sources: LoreChanceSources): LoreChancePlan {
  if (!sources.enabled()) return { refusal: "setting-off" };
  const story = sources.story();
  const chatId = sources.chatId();
  if (!story || chatId === null || chatId !== sources.ownedChat()) return { refusal: "not-owned" };
  const books = lorePlacementBooks(story);
  if (!books.size) return { refusal: "no-books" };
  return { refusal: null, books, roll: sources.roll };
}

const emptyStats = (): LoreChanceStats => ({ rolled: 0, passed: 0, failed: 0, sticky: 0, weightedGroups: [] });

export const usesChance = (entry: HostScannableEntry): boolean => {
  const probability = Number(entry.probability);
  return entry.useProbability === true && Number.isFinite(probability) && probability < 100;
};

export const passesChance = (probability: number, unit: number): boolean => unit * 100 <= probability;

const groupsOf = (entry: HostScannableEntry): string[] =>
  typeof entry.group === "string" ? entry.group.split(/,\s*/).map((name) => name.trim()).filter(Boolean) : [];

export function weightedGroups(entries: readonly HostScannableEntry[]): string[] {
  const groups = new Map<string, { members: number; priority: boolean }>();
  for (const entry of entries) {
    for (const name of groupsOf(entry)) {
      const group = groups.get(name) ?? { members: 0, priority: false };
      group.members += 1;
      group.priority ||= entry.groupOverride === true;
      groups.set(name, group);
    }
  }
  return [...groups].filter(([, group]) => group.members > 1 && !group.priority).map(([name]) => name).sort();
}

export function applyLoreChance(arrays: HostScannableEntry[][], plan: LoreChancePlan): LoreChanceStats {
  const stats = emptyStats();
  if (plan.refusal !== null) return stats;
  const story: HostScannableEntry[] = [];
  for (const entry of arrays.flat()) {
    if (typeof entry?.world !== "string" || entry.disable === true) continue;
    const book = bookKey(entry.world);
    if (!plan.books.has(book)) continue;
    story.push(entry);
    if (!usesChance(entry)) continue;
    if (Number(entry.sticky) > 0) {
      stats.sticky += 1;
      continue;
    }
    const unit = plan.roll(book, entry.uid);
    if (unit === null) continue;
    stats.rolled += 1;
    if (passesChance(Number(entry.probability), unit)) {
      entry.useProbability = false;
      stats.passed += 1;
    } else {
      entry.disable = true;
      stats.failed += 1;
    }
  }
  stats.weightedGroups = weightedGroups(story);
  return stats;
}
