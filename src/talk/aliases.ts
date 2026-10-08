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

const NOT_A_GIVEN_NAME = new Set([
  "the", "and", "von", "van", "del", "der", "des", "sir", "lord", "lady", "dame", "captain", "king", "queen", "prince", "princess",
  "master", "mistress", "father", "mother", "brother", "sister", "doctor", "miss", "mrs", "old", "young", "saint", "elder",
]);

const isGivenName = (word: string) => /^\p{Lu}[\p{L}'-]{2,}$/u.test(word) && !NOT_A_GIVEN_NAME.has(word.toLowerCase());

const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const phrasePattern = (key: string, flags: string) =>
  new RegExp(`(?<![\\p{L}\\p{N}])${escapePattern(key).replace(/ /g, "\\s+")}(?![\\p{L}\\p{N}])`, flags);

export const nameMatcher = (candidates: readonly TalkCandidate[]): ((text: string) => string[]) => {
  const distinct = distinctAliases(candidates);
  const keys = new Map<string, Set<string>>();
  const claim = (key: string, owner: string) => { if (key) keys.set(key, (keys.get(key) ?? new Set<string>()).add(owner)); };
  for (const candidate of candidates) {
    claim(aliasKey(candidate.name), candidate.rosterId);
    for (const alias of candidate.aliases ?? []) claim(aliasKey(alias), candidate.rosterId);
    for (const word of candidate.name.split(/\s+/)) if (isGivenName(word)) claim(aliasKey(word), candidate.rosterId);
  }
  const patterns = candidates.map((candidate) => {
    const loose = [aliasKey(candidate.name), ...(distinct.get(candidate.rosterId) ?? []).map(aliasKey)].filter(Boolean);
    const given = candidate.name.split(/\s+/).filter((word) => isGivenName(word) && keys.get(aliasKey(word))?.size === 1 && !loose.includes(aliasKey(word)));
    return {
      id: candidate.rosterId,
      tests: [...new Set(loose)].map((key) => phrasePattern(key, "iu")).concat([...new Set(given)].map((word) => phrasePattern(word, "u"))),
    };
  });
  return (text) => {
    const plain = text.replace(/[\u2018\u2019]/g, "'");
    return patterns.filter((pattern) => pattern.tests.some((test) => test.test(plain))).map((pattern) => pattern.id);
  };
};

export const aliasOwner = (value: string, candidates: readonly TalkCandidate[]): TalkCandidate | null => {
  const key = aliasKey(value);
  if (!key) return null;
  const distinct = distinctAliases(candidates);
  return candidates.find((candidate) => (distinct.get(candidate.rosterId) ?? []).some((alias) => aliasKey(alias) === key)) ?? null;
};
