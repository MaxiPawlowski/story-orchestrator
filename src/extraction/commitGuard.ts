import type { Quality } from "@engine/index";
import { log } from "@utils/log";
import type { EvidenceMessage } from "./evidence";
import type { ParsedDelta } from "./types";

// A quality whose value only means something when the player COMMITTED to it can declare a
// `commit_evidence` pattern. A delta for it is accepted only when a line the player wrote, inside the
// window the read was given, matches that pattern. Which line the read happened to quote does not
// decide it: a reader citing the NPC who hands over the notice must not hold a commitment the player
// made two lines earlier, and an NPC or narrator line saying the player agreed must never stand in
// for the player's own words. Values with no pattern keep today's behaviour.
export interface HeldCommitDelta {
  key: string;
  value: string;
  evidence: string;
}

export interface CommitGuardResult {
  accepted: ParsedDelta[];
  held: HeldCommitDelta[];
}

const compiled = new Map<string, RegExp | null>();

const matcherFor = (pattern: string | undefined): RegExp | null => {
  if (!pattern) return null;
  if (compiled.has(pattern)) return compiled.get(pattern) ?? null;
  let matcher: RegExp | null = null;
  try {
    matcher = new RegExp(pattern, "i");
  } catch (error) {
    log.warn(`commit_evidence pattern ${pattern} is not a valid regular expression; it is ignored`, error);
    matcher = null;
  }
  compiled.set(pattern, matcher);
  return matcher;
};

const playerCommits = (matcher: RegExp, messages: readonly EvidenceMessage[]): boolean =>
  messages.some((message) => message.isUser && matcher.test(message.text));

export const applyCommitEvidence = (
  qualityByKey: Record<string, Quality>,
  deltas: ParsedDelta[],
  windowMessages: () => readonly EvidenceMessage[],
): CommitGuardResult => {
  const accepted: ParsedDelta[] = [];
  const held: HeldCommitDelta[] = [];
  let messages: readonly EvidenceMessage[] | null = null;
  for (const delta of deltas) {
    const matcher = matcherFor(qualityByKey[delta.delta.q]?.commit_evidence);
    if (matcher && !playerCommits(matcher, messages ??= windowMessages())) {
      held.push({ key: delta.delta.q, value: String(delta.delta.v), evidence: delta.evidence ?? "" });
      continue;
    }
    accepted.push(delta);
  }
  return { accepted, held };
};
