import type { TalkCandidate } from "./types";

export const aliasKey = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, " ").replace(/^(?:the|a|an) /, "");

export const distinctAliases = (candidates: readonly TalkCandidate[]): Map<string, string[]> => {
  const names = new Set(candidates.map((candidate) => aliasKey(candidate.name)));
  const owners = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    for (const alias of candidate.aliases ?? []) {
      const key = aliasKey(alias);
      if (key) owners.set(key, (owners.get(key) ?? new Set()).add(candidate.rosterId));
    }
  }
  return new Map(candidates.map((candidate) => {
    const seen = new Set<string>();
    const kept = (candidate.aliases ?? []).filter((alias) => {
      const key = aliasKey(alias);
      if (!key || names.has(key) || owners.get(key)?.size !== 1 || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return [candidate.rosterId, kept];
  }));
};

export const aliasOwner = (value: string, candidates: readonly TalkCandidate[]): TalkCandidate | null => {
  const key = aliasKey(value);
  if (!key) return null;
  const distinct = distinctAliases(candidates);
  return candidates.find((candidate) => (distinct.get(candidate.rosterId) ?? []).some((alias) => aliasKey(alias) === key)) ?? null;
};
