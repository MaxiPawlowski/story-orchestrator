export type ModelDefectKind = 'loop' | 'corrupt' | 'start' | 'empty' | 'leak';
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
  for (const match of text.matchAll(/(?<![\p{L}'’])(\p{L}{2,})\s+\1(?![\p{L}'’])/giu)) {
    if (!DOUBLED_ALLOWED.has(match[1].toLowerCase())) return { sample: around(text, match.index ?? 0, match[0].length), rule: 'doubled word' };
  }
  return null;
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function damagedStartIn(text: string, speaker: string | null | undefined): { sample: string; rule: string } | null {
  const name = String(speaker ?? '').trim();
  if (!name) return null;
  const head = text.trimStart();
  const sample = head.replace(/\s+/g, ' ').slice(0, 80);
  if (new RegExp(`^${escapeRegex(name)}\\s*:`, 'i').test(head)) return { sample, rule: 'repeated speaker prefix' };
  const fragment = /^[*_"“]*(\p{Ll}\p{L}*)(?:['’]s\b|\s*:)/u.exec(head)?.[1];
  if (!fragment || fragment.length < 2) return null;
  const parts = name.split(/\s+/).filter((part) => part.length > fragment.length);
  return parts.some((part) => part.toLowerCase().endsWith(fragment.toLowerCase())) ? { sample, rule: 'truncated speaker name' } : null;
}

export const EMPTY_RULE = 'empty reply: no text left once the reasoning was parsed out';

export const LEAK_RULES = {
  marker: 'a reasoning channel tag in the visible reply',
  orphan: 'the reply opens on an orphan quoted fragment and a comma, the tail of a format line from the thought',
  bullets: 'an indented planning bullet in the visible reply',
} as const;

const LEAK_PATTERNS: Array<[string, RegExp]> = [
  [LEAK_RULES.marker, /<\|channel>|<channel\|>|<\|think\|>|<\/?think(?:ing)?>/i],
  [LEAK_RULES.orphan, /^\s*["\u201c][^"\u201c\u201d\n]{1,24}["\u201d],\s*[*"\u201c]/],
  [LEAK_RULES.bullets, /^[ \t]{2,}[*-][ \t]{2,}\S/m],
];

function leakIn(text: string): { sample: string; rule: string } | null {
  for (const [rule, pattern] of LEAK_PATTERNS) {
    const match = pattern.exec(text);
    if (match) return { sample: around(text, match.index, match[0].length), rule };
  }
  return null;
}

export function modelDefects(replies: Array<{ messageId?: number | null; speaker?: string | null; text: string; reasoningLength?: number | null }>): ModelDefect[] {
  return replies.flatMap((reply) => {
    const found: ModelDefect[] = [];
    if (!String(reply.text ?? '').trim()) {
      const sample = Number(reply.reasoningLength) > 0 ? `(no text; ${Number(reply.reasoningLength)} chars of reasoning)` : '(no text)';
      return [{ kind: 'empty' as const, messageId: reply.messageId ?? null, speaker: reply.speaker ?? null, sample, rule: EMPTY_RULE }];
    }
    const start = damagedStartIn(reply.text, reply.speaker);
    if (start) found.push({ kind: 'start', messageId: reply.messageId ?? null, speaker: reply.speaker ?? null, ...start });
    const loop = loopIn(reply.text);
    if (loop) found.push({ kind: 'loop', messageId: reply.messageId ?? null, speaker: reply.speaker ?? null, ...loop });
    const corrupt = corruptionIn(reply.text);
    if (corrupt) found.push({ kind: 'corrupt', messageId: reply.messageId ?? null, speaker: reply.speaker ?? null, ...corrupt });
    const leak = leakIn(reply.text);
    if (leak) found.push({ kind: 'leak', messageId: reply.messageId ?? null, speaker: reply.speaker ?? null, ...leak });
    return found;
  });
}

export function defectCounts(records: Array<{ modelDefects?: ModelDefect[]; autoRepair?: { swiped?: boolean; unrepaired?: unknown[] } | null }>) {
  const counts = { turns: 0, loop: 0, corrupt: 0, start: 0, empty: 0, leak: 0, repaired: 0, unrepaired: 0 };
  for (const record of records) {
    const defects = Array.isArray(record?.modelDefects) ? record.modelDefects : [];
    if (!defects.length) continue;
    counts.turns += 1;
    counts.loop += defects.filter((defect) => defect.kind === 'loop').length;
    counts.corrupt += defects.filter((defect) => defect.kind === 'corrupt').length;
    counts.start += defects.filter((defect) => defect.kind === 'start').length;
    counts.empty += defects.filter((defect) => defect.kind === 'empty').length;
    counts.leak += defects.filter((defect) => defect.kind === 'leak').length;
    if (record.autoRepair?.swiped) counts.repaired += 1;
    counts.unrepaired += Array.isArray(record.autoRepair?.unrepaired) ? record.autoRepair.unrepaired.length : 0;
  }
  return counts;
}
