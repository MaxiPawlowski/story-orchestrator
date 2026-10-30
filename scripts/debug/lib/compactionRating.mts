import { createHash } from 'node:crypto';
import { compactionBand, planCompaction } from '../../../src/memory/historyCompaction.ts';

export const ARMS = ['trim', 'compact'] as const;
export type Arm = typeof ARMS[number];
export const CRITERIA = ['continuity', 'voice', 'scene', 'agency', 'overall'] as const;
export type Criterion = typeof CRITERIA[number];
export const CRITERIA_TEXT: Record<Criterion, string> = {
  continuity: 'consistent with what the story shows happened earlier; no forgotten or contradicted events, names or relationships',
  voice: 'the speaking character sounds like themselves',
  scene: 'moves the scene on from the last message in a way that fits it',
  agency: 'leaves the player character\'s actions, words and decisions to the player',
  overall: 'which reply you would rather read next as the player',
};
export const FLOORS = { minPairs: 24, preferShare: 0.45, overallDelta: -0.15, continuityDelta: -0.2 } as const;

export interface Segment { role: string; text: string; raw: string }
export interface ParsedPrompt { head: Segment[]; body: Segment[]; tail: string }

const SEGMENT = /<\|turn>(\w+)\n([\s\S]*?)<turn\|>\n?/g;

export function parsePrompt(prompt: string): ParsedPrompt {
  const segments: Segment[] = [];
  let end = 0;
  for (let match = SEGMENT.exec(prompt); match; match = SEGMENT.exec(prompt)) {
    if (match.index !== end) break;
    segments.push({ role: match[1], text: match[2], raw: match[0] });
    end = match.index + match[0].length;
  }
  SEGMENT.lastIndex = 0;
  const head = segments.length && segments[0].role === 'system' ? [segments[0]] : [];
  return { head, body: segments.slice(head.length), tail: prompt.slice(end) };
}

export const isHistory = (segment: Segment) => segment.role !== 'system';
export const tokensOf = (text: string) => Math.ceil(text.trim().length / 4);
export const render = (parsed: ParsedPrompt, body: Segment[] = parsed.body) => [...parsed.head, ...body].map((segment) => segment.raw).join('') + parsed.tail;

export function trimToFit(parsed: ParsedPrompt, body: Segment[], contextTokens: number): Segment[] {
  const kept = [...body];
  while (tokensOf(render(parsed, kept)) >= contextTokens) {
    const oldest = kept.findIndex(isHistory);
    if (oldest < 0 || kept.filter(isHistory).length <= 1) break;
    kept.splice(oldest, 1);
  }
  return kept;
}

export interface ArmPrompts { trim: string; compact: string; cutId: number | null; trimmedFrom: number; history: number }

export function armPrompts(prompt: string, contextTokens: number, readLag: number): ArmPrompts {
  const parsed = parsePrompt(prompt);
  const history = parsed.body.filter(isHistory);
  const trimBody = trimToFit(parsed, parsed.body, contextTokens);
  const band = compactionBand(contextTokens);
  const plan = band ? planCompaction(history.map((segment, id) => ({ id, cost: tokensOf(segment.text) })), band, history.length - 1 - readLag) : null;
  let seen = -1;
  const compacted = plan ? parsed.body.filter((segment) => !isHistory(segment) || (seen += 1) >= plan.cutId) : parsed.body;
  return {
    trim: render(parsed, trimBody), compact: render(parsed, trimToFit(parsed, compacted, contextTokens)), cutId: plan?.cutId ?? null,
    trimmedFrom: history.length - trimBody.filter(isHistory).length, history: history.length,
  };
}

export const commonPrefix = (left: string, right: string) => {
  let index = 0;
  while (index < left.length && index < right.length && left.charCodeAt(index) === right.charCodeAt(index)) index += 1;
  return index;
};

export interface StabilityRow { arm: Arm; pairs: number; reusedShareP50: number; trunkMoves: number }

export function stability(sequences: string[][], arm: Arm): StabilityRow {
  const shares: number[] = [];
  let moves = 0;
  for (const prompts of sequences) {
    for (let index = 1; index < prompts.length; index += 1) {
      const shared = commonPrefix(prompts[index - 1], prompts[index]);
      shares.push(shared / Math.max(1, prompts[index].length));
      const parsed = parsePrompt(prompts[index]);
      const trunk = [...parsed.head, ...parsed.body.slice(0, 1)].map((segment) => segment.raw).join('').length;
      if (shared < trunk) moves += 1;
    }
  }
  const sorted = [...shares].sort((left, right) => left - right);
  return { arm, pairs: shares.length, reusedShareP50: sorted.length ? Number(sorted[Math.floor(sorted.length / 2)].toFixed(3)) : 0, trunkMoves: moves };
}

export const hashOf = (text: string) => createHash('sha256').update(text, 'utf-8').digest('hex');

export function letters(seed: string, id: string): Record<'A' | 'B', Arm> {
  return parseInt(hashOf(`${seed}|${id}`).slice(0, 8), 16) % 2 === 0 ? { A: 'trim', B: 'compact' } : { A: 'compact', B: 'trim' };
}

export interface PairReply { text: string; reasoning?: string | null }
export interface PackPair { id: string; context: Array<{ who: string; text: string }>; replies: Record<'A' | 'B', PairReply> }
export interface SealedKey { format: 1; seed: string; pairs: Record<string, Record<'A' | 'B', Arm>> }

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, Math.floor(max * 0.6))}\n[… ${text.length - max} characters left out …]\n${text.slice(-Math.floor(max * 0.4))}`);

export function contextOf(prompt: string, turns = 10, maxChars = 900) {
  return parsePrompt(prompt).body.filter(isHistory).slice(-turns).map((segment) => {
    const at = segment.text.indexOf(': ');
    const named = at > 0 && at < 40;
    return { who: named ? segment.text.slice(0, at) : segment.role, text: clip(named ? segment.text.slice(at + 2) : segment.text, maxChars) };
  });
}

export function buildPairs(seed: string, points: Array<{ id: string; prompt: string; replies: Record<Arm, PairReply> }>): { pairs: PackPair[]; key: SealedKey } {
  const key: SealedKey = { format: 1, seed, pairs: {} };
  const pairs = points.map((point) => {
    const order = letters(seed, point.id);
    key.pairs[point.id] = order;
    return { id: point.id, context: contextOf(point.prompt), replies: { A: point.replies[order.A], B: point.replies[order.B] } };
  });
  return { pairs, key };
}

export const packLeaks = (pairs: PackPair[]) => {
  const text = JSON.stringify(pairs);
  return ['trim', 'compact', 'compaction', 'arm'].filter((word) => new RegExp(`\\b${word}\\b`, 'i').test(text));
};

export function judgePrompt(pair: PackPair): string {
  return [
    'You compare two candidate next replies in an interactive roleplay chat. The recent messages are shown; the same story continued earlier than what is shown here.',
    'Each reply was written by the same model for the same moment; they differ in how much of the older chat the model could still see.',
    '',
    'Recent messages:',
    ...pair.context.map((line) => `${line.who}: ${line.text}`),
    '',
    ...(['A', 'B'] as const).flatMap((letter) => [`Reply ${letter}:`, pair.replies[letter].text.trim() || '(empty)', '']),
    'Score each reply 1 (bad) to 5 (excellent) on:',
    ...CRITERIA.map((criterion) => `- ${criterion}: ${CRITERIA_TEXT[criterion]}`),
    'Then name the reply you prefer ("A", "B" or "tie").',
    'Answer with one JSON object only: {"A":{"continuity":n,"voice":n,"scene":n,"agency":n,"overall":n},"B":{...},"prefer":"A"|"B"|"tie","why":"one sentence"}',
  ].join('\n');
}

export type Judged = { scores: Record<'A' | 'B', Record<Criterion, number>>; prefer: 'A' | 'B' | 'tie' };

export function parseJudge(text: string): Judged | { problem: string } {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return { problem: 'no JSON object' };
  let value: any;
  try { value = JSON.parse(text.slice(start, end + 1)); } catch { return { problem: 'JSON does not parse' }; }
  for (const letter of ['A', 'B'] as const) {
    for (const criterion of CRITERIA) {
      const score = value?.[letter]?.[criterion];
      if (!Number.isInteger(score) || score < 1 || score > 5) return { problem: `${letter}.${criterion} is not 1-5` };
    }
  }
  if (!['A', 'B', 'tie'].includes(value.prefer)) return { problem: 'prefer is not A, B or tie' };
  return { scores: { A: value.A, B: value.B }, prefer: value.prefer };
}

export interface Verdict {
  pairs: number;
  compactPreferredOrTied: number;
  mean: Record<Arm, Record<Criterion, number>>;
  floors: Record<'pairs' | 'prefer' | 'overall' | 'continuity', boolean>;
  pass: boolean;
}

export function verdict(judged: Record<string, Judged>, key: SealedKey): Verdict {
  const sums: Record<Arm, Record<Criterion, number>> = { trim: Object.fromEntries(CRITERIA.map((c) => [c, 0])) as Record<Criterion, number>, compact: Object.fromEntries(CRITERIA.map((c) => [c, 0])) as Record<Criterion, number> };
  let pairs = 0;
  let kept = 0;
  for (const [id, row] of Object.entries(judged)) {
    const order = key.pairs[id];
    if (!order) continue;
    pairs += 1;
    for (const letter of ['A', 'B'] as const) for (const criterion of CRITERIA) sums[order[letter]][criterion] += row.scores[letter][criterion];
    if (row.prefer === 'tie' || order[row.prefer] === 'compact') kept += 1;
  }
  const mean = Object.fromEntries(ARMS.map((arm) => [arm, Object.fromEntries(CRITERIA.map((c) => [c, pairs ? Number((sums[arm][c] / pairs).toFixed(3)) : 0]))])) as Verdict['mean'];
  const floors = {
    pairs: pairs >= FLOORS.minPairs,
    prefer: pairs > 0 && kept / pairs >= FLOORS.preferShare,
    overall: mean.compact.overall - mean.trim.overall >= FLOORS.overallDelta,
    continuity: mean.compact.continuity - mean.trim.continuity >= FLOORS.continuityDelta,
  };
  return { pairs, compactPreferredOrTied: kept, mean, floors, pass: Object.values(floors).every(Boolean) };
}
