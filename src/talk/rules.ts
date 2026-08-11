import type { RosterMember, TalkControl } from "@engine/index";
import type { TalkCandidate } from "./types";

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
  const toCandidate = (member: RosterMember, weight: number): TalkCandidate => ({ rosterId: member.id, name: member.name ?? member.id, weight });
  if (!control.speakers?.length) {
    return roster.filter((member) => enabled.has(member.id)).map((member) => toCandidate(member, 1));
  }
  const byKey = new Map<string, RosterMember>();
  for (const member of roster) {
    byKey.set(normalize(member.id), member);
    if (member.name) byKey.set(normalize(member.name), member);
  }
  const candidates: TalkCandidate[] = [];
  for (const speaker of control.speakers) {
    const member = byKey.get(normalize(speaker.member));
    if (!member || !enabled.has(member.id)) continue;
    if (candidates.some((candidate) => candidate.rosterId === member.id)) continue;
    candidates.push(toCandidate(member, speaker.weight ?? 1));
  }
  return candidates;
};

export const narrowByMention = (candidates: TalkCandidate[], text: string): TalkCandidate[] => {
  const words = new Set(extractWords(text));
  if (!words.size) return [];
  return candidates.filter((candidate) => extractWords(candidate.name).some((word) => words.has(word)));
};

export const directorEnabled = (control: TalkControl): boolean => control.director === true || (typeof control.director === "object" && control.director !== null);

export const directorInstruction = (control: TalkControl): string | undefined => {
  return typeof control.director === "object" && control.director !== null && control.director.instruction?.trim() ? control.director.instruction : undefined;
};

export interface ChooseOptions {
  lastSpeakerRosterId: string | null;
  random?: () => number;
}

export const chooseByRules = (control: TalkControl, candidates: TalkCandidate[], options: ChooseOptions): TalkCandidate | null => {
  if (!candidates.length) return null;
  const noRepeat = control.no_repeat !== false;
  const filtered = noRepeat ? candidates.filter((candidate) => candidate.rosterId !== options.lastSpeakerRosterId) : candidates;
  const pool = filtered.length ? filtered : candidates;
  if (control.lead) {
    const lead = pool.find((candidate) => matchesRef(candidate, control.lead ?? ""));
    if (lead) return lead;
  }
  const random = options.random ?? Math.random;
  const total = pool.reduce((sum, candidate) => sum + candidate.weight, 0);
  let roll = random() * total;
  for (const candidate of pool) {
    roll -= candidate.weight;
    if (roll <= 0) return candidate;
  }
  return pool[pool.length - 1];
};
