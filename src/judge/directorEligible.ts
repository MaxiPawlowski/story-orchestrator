import type { JudgeDirectorCandidate } from "./director";

export const DIRECTOR_NOBODY = "nobody";

export const normalizeDirectorName = (value: string) => value.trim().toLowerCase();

export function directorJudgeEligible(candidates: JudgeDirectorCandidate[], allowSilence: boolean): boolean {
  if (candidates.length + (allowSilence ? 1 : 0) < 2) return false;
  if (!candidates.every((candidate) => Boolean(candidate.role?.trim()))) return false;
  const names = candidates.map((candidate) => normalizeDirectorName(candidate.name));
  return new Set(names).size === names.length && !names.includes(DIRECTOR_NOBODY);
}
