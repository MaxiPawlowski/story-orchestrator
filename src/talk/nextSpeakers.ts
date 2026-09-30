import type { TalkControl } from "@engine/index";
import { findCandidate, type TalkCandidate } from "./index";

export const likelyNextSpeakers = (control: TalkControl, candidates: TalkCandidate[], lastSpeakerRosterId: string | null, limit: number): TalkCandidate[] => {
  const others = candidates.filter((candidate) => candidate.rosterId !== lastSpeakerRosterId);
  const pool = control.no_repeat !== false && others.length ? others : candidates;
  const lead = control.lead ? findCandidate(pool, control.lead) ?? undefined : undefined;
  const rest = pool.filter((candidate) => candidate !== lead).sort((left, right) => right.weight - left.weight);
  return [...(lead ? [lead] : []), ...rest].slice(0, Math.max(0, limit));
};
