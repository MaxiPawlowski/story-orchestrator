import type { RosterMember, TalkControl } from "@engine/index";
import type { DirectorWindowMessage, TalkCandidate } from "./types";
import { aliasKey, distinctAliases } from "./aliases";

const normalize = (value: string) => value.trim().toLowerCase();

const extractWords = (value: string) => value.toLowerCase().match(/\b\w+\b/g) ?? [];

const matchesRef = (candidate: TalkCandidate, ref: string) => {
  const search = normalize(ref);
  return normalize(candidate.rosterId) === search || normalize(candidate.name) === search;
};

export const findCandidate = (candidates: TalkCandidate[], ref: string | undefined): TalkCandidate | null => {
  if (!ref) return null;
  return candidates.find((candidate) => matchesRef(candidate, ref)) ?? null;
};

export const buildCandidates = (control: TalkControl, roster: RosterMember[], enabledRosterIds: string[]): TalkCandidate[] => {
  const enabled = new Set(enabledRosterIds);
  const toCandidate = (member: RosterMember, weight: number): TalkCandidate => ({
    rosterId: member.id, name: member.name ?? member.id, weight, ...(member.role ? { role: member.role } : {}), ...(member.aliases?.length ? { aliases: member.aliases } : {}),
  });
  if (!control.speakers?.length) {
    return roster.filter((member) => enabled.has(member.id)).map((member) => toCandidate(member, 1));
  }
  const byKey = new Map<string, RosterMember>();
  for (const member of roster) {
    byKey.set(normalize(member.id), member);
    if (member.name) byKey.set(normalize(member.name), member);
  }
  const candidates: TalkCandidate[] = [];
  const refs = [...control.speakers, ...(control.lead ? [{ member: control.lead }] : [])];
  for (const speaker of refs) {
    const member = byKey.get(normalize(speaker.member));
    if (!member || !enabled.has(member.id)) continue;
    if (candidates.some((candidate) => candidate.rosterId === member.id)) continue;
    candidates.push(toCandidate(member, speaker.weight ?? 1));
  }
  return candidates;
};

const NEGATED_MODAL = "(?:must|should|could|would|can|may|will|shall|need|is to|are to|has to|have to)\\s*(?:not|never)"
  + "|mustn't|shouldn't|couldn't|wouldn't|can't|cannot|won't|needn't|doesn't|don't|never";
const PERCEIVE = "(?:hear|know|see|learn|find out|notice|overhear|listen|be told|read|discover|suspect|realise|realize|catch wind)";
const EXCLUDED_AFTER = new RegExp(`^(?:'s)?\\s+(?:${NEGATED_MODAL})\\s+(?:ever\\s+)?${PERCEIVE}`, "i");
const EXCLUDED_BEFORE = new RegExp("\\b(?:without|except|but not|not even|keep(?:s|ing)?(?:\\s+\\w+){0,3}\\s+(?:away\\s+)?from|hid(?:e|es|ing)(?:\\s+\\w+){0,3}\\s+from"
  + "|(?:don't|do not|never|not|won't)\\s+tell|not a word to|out of earshot of|behind)\\s+(?:\\w+\\s+)?$", "i");

const escapeWord = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const excluded = (clause: string, at: number, length: number): boolean =>
  EXCLUDED_BEFORE.test(clause.slice(0, at)) || EXCLUDED_AFTER.test(clause.slice(at + length));

const addressedIn = (clause: string, word: string): boolean =>
  [...clause.matchAll(new RegExp(`\\b${escapeWord(word)}\\b`, "g"))].some((match) => !excluded(clause, match.index ?? 0, word.length));

const clausesOf = (text: string): string[] => text.toLowerCase().replace(/\u2019/g, "'").split(/[.!?;:\n]+/);

export const narrowByMention = (candidates: TalkCandidate[], text: string): TalkCandidate[] => {
  const words = new Set(extractWords(text));
  if (!words.size) return [];
  const clauses = clausesOf(text);
  return candidates.filter((candidate) => extractWords(candidate.name).some((word) => words.has(word) && clauses.some((clause) => addressedIn(clause, word))));
};

export const latestPlayerLine = (window: DirectorWindowMessage[], playerName: string): number => {
  const player = normalize(playerName);
  for (let index = window.length - 1; index >= 0; index -= 1) {
    const message = window[index];
    if (message.isUser ?? (player.length > 0 && normalize(message.speaker) === player)) return index;
  }
  return -1;
};

export const addressedMembers = (roster: RosterMember[], enabledRosterIds: string[], text: string): TalkCandidate[] => {
  const enabled = new Set(enabledRosterIds);
  const members = roster.filter((member) => enabled.has(member.id))
    .map((member): TalkCandidate => ({ rosterId: member.id, name: member.name ?? member.id, weight: 1, ...(member.role ? { role: member.role } : {}) }));
  return narrowByMention(members, text);
};

export const withAddressed = (candidates: TalkCandidate[], addressed: TalkCandidate[]): TalkCandidate[] => [
  ...candidates,
  ...addressed.filter((member) => !candidates.some((candidate) => candidate.rosterId === member.rosterId)),
];

const addressedByAlias = (candidates: TalkCandidate[], text: string): TalkCandidate[] => {
  const clauses = clausesOf(text);
  const aliases = distinctAliases(candidates);
  return candidates.filter((candidate) => (aliases.get(candidate.rosterId) ?? [])
    .some((alias) => clauses.some((clause) => addressedIn(clause, aliasKey(alias)))));
};

export const addressedAmong = (roster: RosterMember[], rosterIds: readonly string[], text: string): TalkCandidate[] => {
  const wanted = new Set(rosterIds);
  const everyone = roster.map((member): TalkCandidate => ({
    rosterId: member.id, name: member.name ?? member.id, weight: 1, ...(member.aliases?.length ? { aliases: member.aliases } : {}),
  }));
  const named = narrowByMention(everyone.filter((candidate) => wanted.has(candidate.rosterId)), text);
  return withAddressed(named, addressedByAlias(everyone, text).filter((candidate) => wanted.has(candidate.rosterId)));
};

export const directorEnabled =(control: TalkControl): boolean => control.director === true || (typeof control.director === "object" && control.director !== null);

export const directorInstruction = (control: TalkControl): string | undefined => {
  return typeof control.director === "object" && control.director !== null && control.director.instruction?.trim() ? control.director.instruction : undefined;
};

export interface ChooseOptions {
  lastSpeakerRosterId: string | null;
  leadEligible?: boolean;
  random?: () => number;
}

const weightedPick = (pool: TalkCandidate[], random: () => number): TalkCandidate => {
  const total = pool.reduce((sum, candidate) => sum + candidate.weight, 0);
  let roll = random() * total;
  for (const candidate of pool) {
    roll -= candidate.weight;
    if (roll <= 0) return candidate;
  }
  return pool[pool.length - 1];
};

export const chooseByRules = (control: TalkControl, candidates: TalkCandidate[], options: ChooseOptions): TalkCandidate | null => {
  if (!candidates.length) return null;
  const noRepeat = control.no_repeat !== false;
  const filtered = noRepeat ? candidates.filter((candidate) => candidate.rosterId !== options.lastSpeakerRosterId) : candidates;
  const pool = filtered.length ? filtered : candidates;
  const leadRef = control.lead ?? "";
  if (leadRef && options.leadEligible !== false) {
    const lead = pool.find((candidate) => matchesRef(candidate, leadRef));
    if (lead) return lead;
  }
  const others = leadRef && options.leadEligible === false ? pool.filter((candidate) => !matchesRef(candidate, leadRef)) : pool;
  return weightedPick(others.length ? others : pool, options.random ?? Math.random);
};
