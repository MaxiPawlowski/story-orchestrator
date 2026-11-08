export const DEGENERATE_LINE_REPEATS = 4;
export const DEGENERATE_NGRAM_TOKENS = 8;
export const DEGENERATE_NGRAM_REPEATS = 4;
export const DEGENERATE_COVERAGE = 0.5;
export const DEGENERATE_CHAR_RUN = 20;
export const DEGENERATE_TAIL_UNIT = 12;
export const DEGENERATE_TAIL_REPEATS = 12;
const TAIL_WINDOW = 400;

export type DegenerateVerdict = { degenerate: false } | { degenerate: true; reason: string };

const repeatedLine = (text: string): string | null => {
  const counts = new Map<string, number>();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const count = (counts.get(trimmed) ?? 0) + 1;
    if (count >= DEGENERATE_LINE_REPEATS) return trimmed;
    counts.set(trimmed, count);
  }
  return null;
};

const charRun = (text: string): string | null => new RegExp(`([\\p{L}\\p{N}])\\1{${DEGENERATE_CHAR_RUN - 1},}`, "u").exec(text)?.[1] ?? null;

const tailLoop = (text: string): string | null => {
  const tail = text.slice(-TAIL_WINDOW);
  const unit = new RegExp(`([\\s\\S]{1,${DEGENERATE_TAIL_UNIT}}?)\\1{${DEGENERATE_TAIL_REPEATS - 1},}\\s*$`, "u").exec(tail)?.[1] ?? null;
  return unit !== null && /[\p{L}\p{N}]/u.test(unit) ? unit : null;
};

const loopCoverage = (text: string): number => {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length < DEGENERATE_NGRAM_TOKENS * DEGENERATE_NGRAM_REPEATS) return 0;
  const starts = new Map<string, number[]>();
  for (let index = 0; index + DEGENERATE_NGRAM_TOKENS <= tokens.length; index += 1) {
    const gram = tokens.slice(index, index + DEGENERATE_NGRAM_TOKENS).join(" ");
    const seen = starts.get(gram);
    if (seen) seen.push(index);
    else starts.set(gram, [index]);
  }
  const covered = new Set<number>();
  for (const positions of starts.values()) {
    if (positions.length < DEGENERATE_NGRAM_REPEATS) continue;
    for (const start of positions) for (let offset = 0; offset < DEGENERATE_NGRAM_TOKENS; offset += 1) covered.add(start + offset);
  }
  return covered.size / tokens.length;
};

export function detectDegenerate(text: string): DegenerateVerdict {
  const line = repeatedLine(text);
  if (line !== null) return { degenerate: true, reason: `the line "${line.slice(0, 80)}" repeats ${DEGENERATE_LINE_REPEATS} or more times` };
  const run = charRun(text);
  if (run !== null) return { degenerate: true, reason: `the character "${run}" repeats ${DEGENERATE_CHAR_RUN} or more times in a row` };
  const unit = tailLoop(text);
  if (unit !== null) return { degenerate: true, reason: `the reply ends by repeating "${unit.trim().slice(0, 24)}" ${DEGENERATE_TAIL_REPEATS} or more times` };
  const coverage = loopCoverage(text);
  if (coverage > DEGENERATE_COVERAGE) return { degenerate: true, reason: `a repeated ${DEGENERATE_NGRAM_TOKENS}-token phrase covers ${Math.round(coverage * 100)}% of the reply` };
  return { degenerate: false };
}
