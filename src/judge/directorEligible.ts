import type { JudgeDirectorCandidate } from "./director";

export const DIRECTOR_NOBODY = "nobody";

export const normalizeDirectorName = (value: string) => value.trim().toLowerCase();

export const directorOptionCount = (candidates: readonly unknown[], allowSilence: boolean, allowHandBack = false): number =>
  candidates.length + (allowSilence ? 1 : 0) + (allowHandBack ? 1 : 0);

export function directorJudgeEligible(candidates: JudgeDirectorCandidate[], allowSilence: boolean, allowHandBack = false): boolean {
  if (directorOptionCount(candidates, allowSilence, allowHandBack) < 2) return false;
  if (!candidates.every((candidate) => Boolean(candidate.role?.trim()))) return false;
  const names = candidates.map((candidate) => normalizeDirectorName(candidate.name));
  return new Set(names).size === names.length && !names.includes(DIRECTOR_NOBODY);
}
