import { castCardName, type NormalizedStory } from "@engine/index";
import type { HostScannableEntry } from "@services/STAPI";
import { lorePlacementBooks } from "./lorePlacement";
import { bookKey } from "./worldInfoMatch";

export type LoreAliasRefusal = "setting-off" | "not-owned" | "no-books" | "no-names";

export interface LoreAliasSources {
  enabled: () => boolean;
  story: () => NormalizedStory | null;
  chatId: () => string | null;
  ownedChat: () => string | null;
}

export type LoreAliasPlan =
  | { refusal: LoreAliasRefusal }
  | { refusal: null; books: Set<string>; entities: string[][] };

export interface LoreAliasStats {
  entries: number;
  keys: number;
}

const fold = (text: string) => text.trim().toLowerCase();

const isRegexKey = (key: string) => /^\/.*\/[a-z]*$/i.test(key.trim());

// One name set per person or place the story names: a cast member (card name, roster name, aliases) or a codex
// entry (its name and aliases). A name two sets share says nothing about which one is meant, so it is dropped.
export function aliasEntities(story: Pick<NormalizedStory, "roster" | "codex">): string[][] {
  const roster = (story.roster ?? []).map((member) => [castCardName(member), ...(member.aliases ?? [])]);
  const codex = [...(story.codex?.people ?? []), ...(story.codex?.places ?? [])].map((entry) => {
    const member = entry.member ? (story.roster ?? []).find((row) => row.id === entry.member) : undefined;
    return [entry.name ?? (member ? castCardName(member) : entry.id), ...(entry.aliases ?? [])];
  });
  const sets = [...roster, ...codex].map((names) => [...new Map(names.map((name) => name.trim()).filter((name) => name.length >= 2).map((name) => [fold(name), name])).values()]);
  const owners = new Map<string, number>();
  sets.forEach((names) => names.forEach((name) => owners.set(fold(name), (owners.get(fold(name)) ?? 0) + 1)));
  const merged: string[][] = [];
  for (const names of sets) {
    const own = names.filter((name) => owners.get(fold(name)) === 1);
    const same = merged.find((set) => set.some((name) => names.some((other) => fold(other) === fold(name))));
    if (same) own.forEach((name) => { if (!same.some((held) => fold(held) === fold(name))) same.push(name); });
    else if (own.length) merged.push(own);
  }
  return merged.filter((names) => names.length >= 2);
}

export function loreAliasesFor(sources: LoreAliasSources): LoreAliasPlan {
  if (!sources.enabled()) return { refusal: "setting-off" };
  const story = sources.story();
  const chatId = sources.chatId();
  if (!story || chatId === null || chatId !== sources.ownedChat()) return { refusal: "not-owned" };
  const books = lorePlacementBooks(story);
  if (!books.size) return { refusal: "no-books" };
  const entities = aliasEntities(story);
  return entities.length ? { refusal: null, books, entities } : { refusal: "no-names" };
}

// On the scan's own copies only: an entry keyed on one name of a person or place also gets that set's other
// names as keys, so a nickname in the chat fires an entry written for the full name. The file never changes.
export function aliasKeys(keys: readonly string[], entities: readonly string[][]): string[] {
  const held = new Set(keys.filter((key) => !isRegexKey(key)).map(fold));
  if (!held.size) return [];
  const extra = entities.filter((names) => names.some((name) => held.has(fold(name)))).flat().filter((name) => !held.has(fold(name)));
  return [...new Map(extra.map((name) => [fold(name), name])).values()];
}

export function applyLoreAliases(arrays: HostScannableEntry[][], plan: LoreAliasPlan): LoreAliasStats {
  const stats: LoreAliasStats = { entries: 0, keys: 0 };
  if (plan.refusal !== null) return stats;
  for (const entry of arrays.flat()) {
    if (typeof entry?.world !== "string" || entry.disable === true || entry.constant === true || !plan.books.has(bookKey(entry.world))) continue;
    const keys = (Array.isArray(entry.key) ? entry.key : []).filter((key): key is string => typeof key === "string");
    const added = aliasKeys(keys, plan.entities);
    if (!added.length) continue;
    entry.key = [...keys, ...added];
    stats.entries += 1;
    stats.keys += added.length;
  }
  return stats;
}
