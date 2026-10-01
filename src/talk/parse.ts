import { stripChannelNoise } from "@extraction/parse";
import type { TalkCandidate } from "./types";

export interface DirectorVerdict {
  rosterId: string | null;
  /** The director answered PLAYER: the scene returns to the player, no character speaks next. */
  handBack?: boolean;
}

const normalize = (value: string) => value.trim().toLowerCase();

const cleanValue = (value: string) => value.trim().replace(/^["'*_`]+|["'*_.!`]+$/g, "").trim();

// The prompt lists candidates by name, and `buildCandidates` sets `name` to the id when a member has
// none, so a name match already covers a nameless member. Matching the id as well resolved ordinary
// words (`maid`, `father`) to whichever member held that id — a wrong pick that never read as a miss.
const matchCandidate = (value: string, candidates: TalkCandidate[]): TalkCandidate | null => {
  const search = normalize(value);
  if (!search) return null;
  const exact = candidates.find((candidate) => normalize(candidate.name) === search);
  if (exact) return exact;
  const head = normalize(value.split(/\s+\(|:\s|\s[—–-]\s/)[0] ?? "");
  return head && head !== search ? candidates.find((candidate) => normalize(candidate.name) === head) ?? null : null;
};

const HAND_BACK = /^(player|the player|you)$/i;

export function parseDirectorResponse(raw: string, candidates: TalkCandidate[], allowSilence: boolean, handBack = false): DirectorVerdict | null {
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
    if (handBack && HAND_BACK.test(value)) return { rosterId: null, handBack: true };
    const candidate = matchCandidate(value, candidates);
    if (candidate) return { rosterId: candidate.rosterId };
  }
  return null;
}
