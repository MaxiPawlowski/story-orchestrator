import type { Quality } from "@engine/index";
import { log } from "@utils/log";
import type { ParsedDelta } from "./types";

// A quality whose value only means something when the party COMMITTED to it can declare a
// `commit_evidence` pattern. A delta for it is accepted only when the quote the read cited matches
// that pattern, so a scene aside ("he's a ranger, and his party-finding has been quiet") can never
// latch a one-way gate and advance the story. Values with no pattern keep today's behaviour.
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

export const applyCommitEvidence = (
  qualityByKey: Record<string, Quality>,
  deltas: ParsedDelta[],
): CommitGuardResult => {
  const accepted: ParsedDelta[] = [];
  const held: HeldCommitDelta[] = [];
  for (const delta of deltas) {
    const matcher = matcherFor(qualityByKey[delta.delta.q]?.commit_evidence);
    if (matcher && !matcher.test(delta.evidence ?? "")) {
      held.push({ key: delta.delta.q, value: String(delta.delta.v), evidence: delta.evidence ?? "" });
      continue;
    }
    accepted.push(delta);
  }
  return { accepted, held };
};
