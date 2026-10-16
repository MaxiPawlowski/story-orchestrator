import { withholds } from "@runtime/generationLifecycle";

export type RecallCueId = "exactly" | "word for word" | "what did name say" | "your words" | "you said" | "quote";

export interface RecallCue {
  cue: RecallCueId;
  name?: string;
}

const FIXED: ReadonlyArray<[RecallCueId, RegExp]> = [
  ["exactly", /\bexactly\b/i],
  ["word for word", /\bword\s+for\s+word\b/i],
  ["your words", /\byour\s+(?:own\s+)?words\b/i],
  ["you said", /\byou\s+said\b/i],
  ["quote", /\bquote\b/i],
];

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function recallCue(line: string, names: readonly string[], generationType?: string): RecallCue | null {
  if (withholds(generationType)) return null;
  const asked = names.find((name) => new RegExp(`\\bwhat\\s+did\\s+${escape(name)}\\s+(?:just\\s+)?say\\b`, "i").test(line));
  if (asked) return { cue: "what did name say", name: asked };
  const fixed = FIXED.find(([, pattern]) => pattern.test(line));
  return fixed ? { cue: fixed[0] } : null;
}
