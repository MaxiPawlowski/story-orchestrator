export type ModelDefectKind = 'loop' | 'corrupt';
export interface ModelDefect { kind: ModelDefectKind; messageId: number | null; speaker: string | null; sample: string; rule: string }

export const LOOP_SEGMENT_REPEATS = 3;
export const LOOP_PHRASE_WORDS = 4;
export const LOOP_PHRASE_REPEATS = 4;
const MIN_SEGMENT_CHARS = 12;
const DOUBLED_ALLOWED = new Set(['had', 'that', 'bye', 'no', 'yes', 'so', 'very', 'ha', 'hah', 'heh', 'knock', 'go', 'come', 'now', 'run', 'well', 'oh']);
const FUNCTION_WORDS = '(?:the|and|of|to|in|is|was|are)';
const CORRUPT_RULES: Array<[string, RegExp]> = [
  ['spelled letters', /\b(?:[A-Za-z]-){3,}[A-Za-z]\b/],
  ['bad contraction', /\b(?:this|the|these|those|a|an)'(?:ve|re|ll|d)\b/i],
  ['glued function words', new RegExp(`\\b${FUNCTION_WORDS}${FUNCTION_WORDS.replace('to|', '')}\\b`, 'i')],
];

const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').replace(/\s+/g, ' ').trim();
const around = (text: string, index: number, length: number) => text.slice(Math.max(0, index - 40), index + length + 40).replace(/\s+/g, ' ').trim().slice(0, 160);

function loopIn(text: string): { sample: string; rule: string } | null {
  const segments = text.split(/\r?\n|(?<=[.!?…])\s+/).map((segment) => segment.trim()).filter((segment) => normalize(segment).length >= MIN_SEGMENT_CHARS);
  const counts = new Map<string, { count: number; raw: string }>();
  for (const segment of segments) {
    const key = normalize(segment);
    const entry = counts.get(key) ?? { count: 0, raw: segment };
    entry.count += 1;
    counts.set(key, entry);
  }
  const repeated = [...counts.values()].find((entry) => entry.count >= LOOP_SEGMENT_REPEATS);
  if (repeated) return { sample: `${repeated.raw.slice(0, 120)} (x${repeated.count})`, rule: `a line repeated ${repeated.count} times` };
  const words = normalize(text).split(' ').filter(Boolean);
  const phrases = new Map<string, number>();
  for (let index = 0; index + LOOP_PHRASE_WORDS <= words.length; index += 1) {
    const phrase = words.slice(index, index + LOOP_PHRASE_WORDS).join(' ');
    phrases.set(phrase, (phrases.get(phrase) ?? 0) + 1);
  }
  const phrase = [...phrases.entries()].find(([, count]) => count >= LOOP_PHRASE_REPEATS);
  return phrase ? { sample: `${phrase[0]} (x${phrase[1]})`, rule: `a ${LOOP_PHRASE_WORDS}-word phrase repeated ${phrase[1]} times` } : null;
}

function corruptionIn(text: string): { sample: string; rule: string } | null {
  for (const [rule, pattern] of CORRUPT_RULES) {
    const match = pattern.exec(text);
    if (match) return { sample: around(text, match.index, match[0].length), rule };
  }
  for (const match of text.matchAll(/\b(\p{L}{2,})\s+\1\b/giu)) {
    if (!DOUBLED_ALLOWED.has(match[1].toLowerCase())) return { sample: around(text, match.index ?? 0, match[0].length), rule: 'doubled word' };
  }
  return null;
}

export function modelDefects(replies: Array<{ messageId?: number | null; speaker?: string | null; text: string }>): ModelDefect[] {
  return replies.flatMap((reply) => {
    const found: ModelDefect[] = [];
    const loop = loopIn(reply.text);
    if (loop) found.push({ kind: 'loop', messageId: reply.messageId ?? null, speaker: reply.speaker ?? null, ...loop });
    const corrupt = corruptionIn(reply.text);
    if (corrupt) found.push({ kind: 'corrupt', messageId: reply.messageId ?? null, speaker: reply.speaker ?? null, ...corrupt });
    return found;
  });
}

export function defectCounts(records: Array<{ modelDefects?: ModelDefect[]; autoRepair?: { swiped?: boolean; unrepaired?: unknown[] } | null }>) {
  const counts = { turns: 0, loop: 0, corrupt: 0, repaired: 0, unrepaired: 0 };
  for (const record of records) {
    const defects = Array.isArray(record?.modelDefects) ? record.modelDefects : [];
    if (!defects.length) continue;
    counts.turns += 1;
    counts.loop += defects.filter((defect) => defect.kind === 'loop').length;
    counts.corrupt += defects.filter((defect) => defect.kind === 'corrupt').length;
    if (record.autoRepair?.swiped) counts.repaired += 1;
    counts.unrepaired += Array.isArray(record.autoRepair?.unrepaired) ? record.autoRepair.unrepaired.length : 0;
  }
  return counts;
}
