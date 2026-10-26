export interface PromptBlockHint {
  value: string;
  position: number | null;
}

export type BoundarySource = "cut-marker" | "block" | "newest-message";

export interface PerTurnBoundary {
  at: number | null;
  source: BoundarySource | null;
}

export type PairVerdict = "identical" | "ok" | "above-boundary" | "no-boundary";

export interface PairCheck {
  divergence: number | null;
  boundary: number | null;
  source: BoundarySource | null;
  nextBoundary: number | null;
  verdict: PairVerdict;
  lost: number;
}

export const CUT_MARKERS: readonly string[] = ["<|turn>system\n", "<|im_start|>system\n", "<start_of_turn>system\n", "<|start_header_id|>system<|end_header_id|>"];

const IN_CHAT = 1;
const MIN_PROBE = 12;
const TURN_OPENER = /<\|turn>|<start_of_turn>|<\|im_start\|>|<\|start_header_id\|>|(?<=^|\n)### /g;
const CHAT_HEADER = /(?<=^|\n)### (\w+)(?: \([^\n]*\))?\n/g;

export function firstDivergence(previous: string, next: string): number | null {
  if (previous === next) return null;
  const limit = Math.min(previous.length, next.length);
  let at = 0;
  while (at < limit && previous.charCodeAt(at) === next.charCodeAt(at)) at += 1;
  return at;
}

const secondIndex = (prompt: string, marker: string): number | null => {
  const first = prompt.indexOf(marker);
  if (first < 0) return null;
  const second = prompt.indexOf(marker, first + marker.length);
  return second > 0 ? second : null;
};

const chatSystemAfterHistory = (prompt: string): number | null => {
  let history = false;
  for (const match of prompt.matchAll(CHAT_HEADER)) {
    if (match[1] !== "system") history = true;
    else if (history) return match.index ?? null;
  }
  return null;
};

export function cutMarkerIndex(prompt: string, markers: readonly string[] = CUT_MARKERS): number | null {
  const found = [...markers.map((marker) => secondIndex(prompt, marker)), chatSystemAfterHistory(prompt)].filter((at): at is number => at !== null);
  return found.length ? Math.min(...found) : null;
}

export function blockIndex(prompt: string, blocks: readonly PromptBlockHint[]): number | null {
  let best: number | null = null;
  for (const block of blocks) {
    if (block.position !== IN_CHAT || typeof block.value !== "string") continue;
    let offset = 0;
    for (const line of block.value.split("\n")) {
      const probe = line.trim();
      const lineOffset = offset + line.indexOf(probe);
      offset += line.length + 1;
      if (probe.length < MIN_PROBE) continue;
      const at = prompt.indexOf(probe);
      if (at < 0) continue;
      const start = Math.max(0, at - lineOffset);
      best = best === null ? start : Math.min(best, start);
      break;
    }
  }
  return best;
}

export function newestMessageIndex(prompt: string): number | null {
  const openers = [...prompt.matchAll(TURN_OPENER)].map((match) => match.index ?? 0);
  const filled = openers.filter((at, index) => {
    const segment = prompt.slice(at, openers[index + 1] ?? prompt.length);
    const newline = segment.indexOf("\n");
    return newline >= 0 && segment.slice(newline + 1).replace(/<turn\|>|<end_of_turn>|<\|im_end\|>|<\|eot_id\|>/g, "").trim().length > 0;
  });
  return filled.length > 1 ? filled[filled.length - 1] : null;
}

export function perTurnBoundary(prompt: string, blocks: readonly PromptBlockHint[] = [], markers: readonly string[] = CUT_MARKERS): PerTurnBoundary {
  const cut = cutMarkerIndex(prompt, markers);
  const block = blockIndex(prompt, blocks);
  if (cut !== null && (block === null || cut <= block)) return { at: cut, source: "cut-marker" };
  if (block !== null) return { at: block, source: "block" };
  const newest = newestMessageIndex(prompt);
  return newest === null ? { at: null, source: null } : { at: newest, source: "newest-message" };
}

export function checkPair(previous: string, next: string, previousBlocks: readonly PromptBlockHint[] = [], nextBlocks: readonly PromptBlockHint[] = []): PairCheck {
  const divergence = firstDivergence(previous, next);
  const { at: boundary, source } = perTurnBoundary(previous, previousBlocks);
  const nextBoundary = perTurnBoundary(next, nextBlocks).at;
  if (divergence === null) return { divergence, boundary, source, nextBoundary, verdict: "identical", lost: 0 };
  if (boundary === null) return { divergence, boundary, source, nextBoundary, verdict: "no-boundary", lost: 0 };
  const lost = Math.max(0, boundary - divergence);
  return { divergence, boundary, source, nextBoundary, verdict: lost > 0 ? "above-boundary" : "ok", lost };
}

export interface SequenceEntry {
  key: string;
  label: string;
  prompt: string;
  blocks?: readonly PromptBlockHint[];
}

export interface SequencePair extends PairCheck {
  key: string;
  from: string;
  to: string;
}

export function checkSequence(entries: readonly SequenceEntry[]): SequencePair[] {
  const last = new Map<string, SequenceEntry>();
  const pairs: SequencePair[] = [];
  for (const entry of entries) {
    const previous = last.get(entry.key);
    if (previous) pairs.push({ key: entry.key, from: previous.label, to: entry.label, ...checkPair(previous.prompt, entry.prompt, previous.blocks ?? [], entry.blocks ?? []) });
    last.set(entry.key, entry);
  }
  return pairs;
}

export const failingVerdict = (verdict: PairVerdict): boolean => verdict === "above-boundary" || verdict === "no-boundary";
