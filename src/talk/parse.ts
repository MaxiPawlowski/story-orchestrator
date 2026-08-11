import { stripChannelNoise } from "@extraction/parse";
import type { TalkCandidate } from "./types";

export interface DirectorVerdict {
  rosterId: string | null;
}

const normalize = (value: string) => value.trim().toLowerCase();

const cleanValue = (value: string) => value.trim().replace(/^["'*_`]+|["'*_.!`]+$/g, "").trim();

const matchCandidate = (value: string, candidates: TalkCandidate[]): TalkCandidate | null => {
  const search = normalize(value);
  if (!search) return null;
  return candidates.find((candidate) => normalize(candidate.name) === search || normalize(candidate.rosterId) === search) ?? null;
};

export function parseDirectorResponse(raw: string, candidates: TalkCandidate[], allowSilence: boolean): DirectorVerdict | null {
  const text = stripChannelNoise(raw);
  const values: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*SPEAKER\s*[:=]\s*(.+)$/i);
    if (match) values.push(cleanValue(match[1]));
  }
  if (!values.length) {
    const bare = cleanValue(text);
    if (bare && !bare.includes("\n")) values.push(bare);
  }
  for (const value of values) {
    if (/^none$/i.test(value)) return allowSilence ? { rosterId: null } : null;
    const candidate = matchCandidate(value, candidates);
    if (candidate) return { rosterId: candidate.rosterId };
  }
  return null;
}
