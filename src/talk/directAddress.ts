import type { RosterMember } from "@engine/schema";
import { aliasKey, distinctAliases, isGivenName } from "./aliases";
import { excluded } from "./rules";
import type { TalkCandidate } from "./types";

const escapeTerm = (term: string) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");

const NARRATION = /\*[^*]*\*/g;
const QUOTED = /"([^"]*)"|\u201c([^\u201d]*)\u201d/g;
const LEAD = "(?:hey|oh|now|well|listen|look|please|so)\\s*,?\\s+";

export const spokenSegments = (text: string): string[] => {
  const plain = text.replace(/[\u2018\u2019]/g, "'").replace(NARRATION, " \n ");
  const quoted = [...plain.matchAll(QUOTED)].map((match) => match[1] ?? match[2] ?? "");
  return /["\u201c\u201d]/.test(plain) ? quoted : [plain];
};

const termsByMember = (roster: readonly RosterMember[]): Map<string, string[]> => {
  const candidates: TalkCandidate[] = roster.map((member) => ({ rosterId: member.id, name: member.name ?? member.id, weight: 1, ...(member.aliases ? { aliases: member.aliases } : {}) }));
  const aliases = distinctAliases(candidates);
  const owners = new Map<string, Set<string>>();
  const claim = (word: string, id: string) => owners.set(word, (owners.get(word) ?? new Set<string>()).add(id));
  candidates.forEach((candidate) => candidate.name.split(/\s+/).filter(isGivenName).forEach((word) => claim(aliasKey(word), candidate.rosterId)));
  return new Map(candidates.map((candidate) => {
    const given = candidate.name.split(/\s+/).filter(isGivenName).map(aliasKey).filter((word) => owners.get(word)?.size === 1);
    return [candidate.rosterId, [...new Set([aliasKey(candidate.name), ...(aliases.get(candidate.rosterId) ?? []).map(aliasKey), ...given])].filter(Boolean)];
  }));
};

const vocativeIn = (segment: string, term: string): boolean => {
  const name = `(?<![\\p{L}\\p{N}])${escapeTerm(term)}(?![\\p{L}\\p{N}])`;
  const opening = new RegExp(`(?:^|[.!?;\\n]\\s*)\\s*(?:${LEAD})?(${name})\\s*[,!?:]`, "giu");
  const closing = new RegExp(`,\\s*(${name})\\s*(?:[.!?,]|$)`, "giu");
  const lower = segment.toLowerCase();
  return [...segment.matchAll(opening), ...segment.matchAll(closing)].some((match) => {
    const at = (match.index ?? 0) + match[0].toLowerCase().indexOf(match[1].toLowerCase());
    return !excluded(lower, at, match[1].length);
  });
};

export const directlyAddressed = (roster: readonly RosterMember[], text: string): string | null => {
  const segments = spokenSegments(text);
  if (!segments.some((segment) => segment.trim())) return null;
  const terms = termsByMember(roster);
  const addressed = roster.filter((member) => (terms.get(member.id) ?? []).some((term) => segments.some((segment) => vocativeIn(segment, term))));
  return addressed.length === 1 ? addressed[0].id : null;
};
