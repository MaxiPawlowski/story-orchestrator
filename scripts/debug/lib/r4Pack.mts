import { createHash } from 'node:crypto';
import { latencyPercentiles } from './roleEffort.mts';

export const R4_ARM_LEVEL = 'high';
export const R4_FLOOR = { preferredShare: 0.6, p95Ratio: 2 } as const;
export const R4_ITEM_ID = /^r4-\d{2}$/;
const ITEM_KEYS = ['id', 'context', 'replyA', 'replyB'];
const LEAK_MARKERS = [/reasoning_effort/i, /enable_thinking/i, /chat_template_kwargs/i, /include_reasoning/i, /effects\.reasoning/i, /<\/?think(ing)?>/i, /\[(arm|control)\]/i, /\b(arm|control)\s*[:=]/i, /\breasoning\s*[:=]\s*(off|low|medium|high)\b/i];
const PLACEHOLDER = /<[^<>]+>/;

export type R4Side = 'arm' | 'control';

export interface R4Turn {
  id: string;
  story: string;
  storyId: string;
  checkpoint: string;
  chatId: string;
  member: string | null;
  contextMessages: number;
  note?: string;
}

export interface R4TurnsFile {
  plan: string;
  step: string;
  arm: string;
  frozenSha256: string | null;
  turns: R4Turn[];
  [key: string]: unknown;
}

export interface R4Line {
  name: string;
  text: string;
}

export interface R4PayloadProof {
  captured: boolean;
  source: string | null;
  reasoningEffort: unknown;
  includeReasoning: unknown;
  enableThinking: boolean | null;
}

export interface R4Generation {
  side: R4Side;
  order: number;
  reply: string;
  speaker: string | null;
  latencyMs: number;
  payload: R4PayloadProof;
  shot: unknown;
}

export interface R4TurnRecord {
  turnId: string;
  context: R4Line[];
  generations: R4Generation[];
}

export interface R4PackItem {
  id: string;
  context: R4Line[];
  replyA: string;
  replyB: string;
}

export interface R4Pack {
  plan: string;
  step: string;
  kind: 'blind-pair';
  question: string;
  items: R4PackItem[];
}

export interface R4KeyItem {
  turnId: string;
  a: R4Side;
  b: R4Side;
}

export interface R4Key {
  plan: string;
  step: string;
  runId: string;
  seed: string;
  turnsSha256: string;
  packSha256: string;
  items: Record<string, R4KeyItem>;
  excluded: Array<{ turnId: string; reasons: string[] }>;
  latencyMs: { control: number[]; arm: number[] };
}

export type R4Preference = 'A' | 'B' | 'tie';

export interface R4Ratings {
  packSha256: string;
  rater?: string;
  ratings: Array<{ item: string; prefer: R4Preference | null }>;
}

const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, inner]) => [key, sortKeys(inner)]));
  return value;
};

export const stableJson = (value: unknown): string => JSON.stringify(sortKeys(value));

export const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

export const turnsDigest = (file: R4TurnsFile): string => sha256(stableJson({ ...file, frozenSha256: null }));

export const packDigest = (pack: R4Pack): string => sha256(stableJson(pack));

const placeholders = (value: unknown, path = ''): string[] => {
  if (typeof value === 'string') return PLACEHOLDER.test(value) ? [`${path || '(root)'}: ${value}`] : [];
  if (Array.isArray(value)) return value.flatMap((item, index) => placeholders(item, `${path}[${index}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, inner]) => placeholders(inner, path ? `${path}.${key}` : key));
  return [];
};

export function turnsProblems(file: R4TurnsFile, expect = { turns: 20, stories: 2 }): string[] {
  const problems = placeholders(file.turns).map((entry) => `placeholder not filled in: turns${entry.startsWith('[') ? '' : '.'}${entry}`);
  if (file.arm !== R4_ARM_LEVEL) problems.push(`the arm must be "${R4_ARM_LEVEL}", got "${file.arm}"`);
  if (file.turns.length !== expect.turns) problems.push(`${file.turns.length} turns declared, the recipe needs ${expect.turns}`);
  const stories = new Set(file.turns.map((turn) => turn.storyId));
  if (stories.size !== expect.stories) problems.push(`${stories.size} stories declared, the recipe needs ${expect.stories}`);
  const ids = file.turns.map((turn) => turn.id);
  const repeated = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (repeated.length) problems.push(`turn ids repeat: ${[...new Set(repeated)].join(', ')}`);
  file.turns.filter((turn) => !Number.isInteger(turn.contextMessages) || turn.contextMessages < 1).forEach((turn) => problems.push(`${turn.id}: contextMessages must be a positive integer`));
  return problems;
}

export function freezeTurns(file: R4TurnsFile): R4TurnsFile {
  const problems = turnsProblems(file);
  if (problems.length) throw new Error(`refusing to freeze the R4 turns:\n- ${problems.join('\n- ')}`);
  return { ...file, frozenSha256: turnsDigest(file) };
}

export function assertFrozen(file: R4TurnsFile): string {
  const problems = turnsProblems(file);
  if (problems.length) throw new Error(`the R4 turns file is not ready:\n- ${problems.join('\n- ')}`);
  const digest = turnsDigest(file);
  if (file.frozenSha256 !== digest) throw new Error(`the R4 turns file is not frozen as recorded (frozenSha256 ${file.frozenSha256 ?? 'null'}, content ${digest}); inputs changed after freezing, or were never frozen`);
  return digest;
}

const thinkingFrom = (body: unknown): boolean | null => {
  if (typeof body !== 'string' || !body.trim()) return null;
  try {
    const parsed = JSON.parse(body) as { chat_template_kwargs?: { enable_thinking?: unknown } };
    const value = parsed?.chat_template_kwargs?.enable_thinking;
    return typeof value === 'boolean' ? value : null;
  } catch {
    const match = /enable_thinking["']?\s*:\s*(true|false)/i.exec(body);
    return match ? match[1].toLowerCase() === 'true' : null;
  }
};

export function payloadProof(body: unknown): R4PayloadProof {
  if (!body || typeof body !== 'object') return { captured: false, source: null, reasoningEffort: null, includeReasoning: null, enableThinking: null };
  const request = body as Record<string, unknown>;
  return {
    captured: true,
    source: typeof request.chat_completion_source === 'string' ? request.chat_completion_source : null,
    reasoningEffort: request.reasoning_effort ?? null,
    includeReasoning: request.include_reasoning ?? null,
    enableThinking: thinkingFrom(request.custom_include_body),
  };
}

const carriesArm = (proof: R4PayloadProof): boolean =>
  proof.source === 'custom' ? proof.enableThinking === true : proof.reasoningEffort === R4_ARM_LEVEL;

export function pairProblems(record: R4TurnRecord): string[] {
  const problems: string[] = [];
  const control = record.generations.filter((generation) => generation.side === 'control');
  const arm = record.generations.filter((generation) => generation.side === 'arm');
  if (control.length !== 1 || arm.length !== 1) return [`expected one control and one arm generation, got ${control.length} and ${arm.length}`];
  const [c, a] = [control[0], arm[0]];
  if (!a.payload.captured) problems.push('no request was captured for the arm');
  else if (!carriesArm(a.payload)) problems.push(`the arm key did not land in the request (source ${a.payload.source ?? 'unknown'}, reasoning_effort ${JSON.stringify(a.payload.reasoningEffort)}, enable_thinking ${JSON.stringify(a.payload.enableThinking)})`);
  if (!c.payload.captured) problems.push('no request was captured for the control');
  else if (carriesArm(c.payload)) problems.push('the control request already carries the arm\'s value, so the pair compares nothing');
  if (a.payload.captured && c.payload.captured && a.payload.source !== c.payload.source) problems.push(`the two requests went to different sources (${c.payload.source} vs ${a.payload.source})`);
  if (!c.reply.trim()) problems.push('the control reply is empty');
  if (!a.reply.trim()) problems.push('the arm reply is empty');
  if (!(c.latencyMs > 0) || !(a.latencyMs > 0)) problems.push('a latency is missing');
  return problems;
}

const seedState = (seed: string): number => Number.parseInt(sha256(seed).slice(0, 8), 16) >>> 0;

export function seededRandom(seed: string): () => number {
  let state = seedState(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const pick = Math.floor(random() * (index + 1));
    [out[index], out[pick]] = [out[pick], out[index]];
  }
  return out;
}

export const R4_QUESTION = 'Read the context, then both replies. Which reply is the better next turn for this story at this moment? Answer A, B or tie.';

export function buildPack(records: R4TurnRecord[], { seed, runId, turnsSha256, plan = 'docs/plans/v2.6/05-reasoning-control.md' }: { seed: string; runId: string; turnsSha256: string; plan?: string }): { pack: R4Pack; key: R4Key } {
  const excluded = records.map((record) => ({ turnId: record.turnId, reasons: pairProblems(record) })).filter((entry) => entry.reasons.length);
  const valid = records.filter((record) => !excluded.some((entry) => entry.turnId === record.turnId));
  const random = seededRandom(seed);
  const order = shuffled(valid, random);
  const armFirst = new Set(shuffled(order.map((_record, index) => index), random).slice(0, Math.floor(order.length / 2)));
  const items: R4PackItem[] = [];
  const keyItems: Record<string, R4KeyItem> = {};
  order.forEach((record, index) => {
    const id = `r4-${String(index + 1).padStart(2, '0')}`;
    const control = record.generations.find((generation) => generation.side === 'control') as R4Generation;
    const arm = record.generations.find((generation) => generation.side === 'arm') as R4Generation;
    const aIsArm = armFirst.has(index);
    items.push({ id, context: record.context.map((line) => ({ name: line.name, text: line.text })), replyA: (aIsArm ? arm : control).reply, replyB: (aIsArm ? control : arm).reply });
    keyItems[id] = { turnId: record.turnId, a: aIsArm ? 'arm' : 'control', b: aIsArm ? 'control' : 'arm' };
  });
  const pack: R4Pack = { plan, step: 'R4', kind: 'blind-pair', question: R4_QUESTION, items };
  const latencyMs = {
    control: valid.map((record) => (record.generations.find((generation) => generation.side === 'control') as R4Generation).latencyMs),
    arm: valid.map((record) => (record.generations.find((generation) => generation.side === 'arm') as R4Generation).latencyMs),
  };
  return { pack, key: { plan, step: 'R4', runId, seed, turnsSha256, packSha256: packDigest(pack), items: keyItems, excluded, latencyMs } };
}

export function packLeaks(pack: R4Pack, key: R4Key, turnIds: string[] = []): string[] {
  const leaks: string[] = [];
  const packText = stableJson(pack);
  if (key.seed && packText.includes(key.seed)) leaks.push('the pack carries the seed');
  for (const item of pack.items) {
    const extra = Object.keys(item).filter((field) => !ITEM_KEYS.includes(field));
    if (extra.length) leaks.push(`${item.id}: carries fields beyond the blind shape (${extra.join(', ')})`);
    if (!R4_ITEM_ID.test(item.id)) leaks.push(`${item.id}: the item id is not an opaque r4-NN id`);
    const texts = [item.replyA, item.replyB, ...item.context.flatMap((line) => [line.name, line.text])];
    for (const marker of LEAK_MARKERS) if (texts.some((text) => marker.test(text))) leaks.push(`${item.id}: text matches ${marker} (an arm label or a reasoning trace)`);
    if (turnIds.some((turnId) => texts.some((text) => text.includes(turnId)))) leaks.push(`${item.id}: text names a turn id`);
    if (!key.items[item.id]) leaks.push(`${item.id}: not in the key`);
  }
  const ids = pack.items.map((item) => item.id);
  Object.keys(key.items).filter((id) => !ids.includes(id)).forEach((id) => leaks.push(`${id}: in the key but not in the pack`));
  const n = pack.items.length;
  const armInA = pack.items.filter((item) => key.items[item.id]?.a === 'arm').length;
  if (n >= 2 && armInA !== Math.floor(n / 2) && armInA !== Math.ceil(n / 2)) leaks.push(`the arm is reply A in ${armInA} of ${n} items; the sides must be balanced so position cannot predict the arm`);
  const positions = pack.items.map((item) => key.items[item.id]?.a);
  if (n >= 10 && positions.every((side, index) => index === 0 || side !== positions[index - 1])) leaks.push('the arm alternates A/B item by item, so position predicts it');
  const declared = pack.items.map((item) => key.items[item.id]?.turnId);
  const sortedTurns = [...declared].sort((a, b) => turnIds.indexOf(a ?? '') - turnIds.indexOf(b ?? ''));
  if (n >= 4 && turnIds.length && declared.every((turnId, index) => turnId === sortedTurns[index])) leaks.push('the items are in declared turn order, so they were not shuffled');
  return leaks;
}

export interface R4Score {
  ok: boolean;
  items: number;
  armPreferred: number;
  controlPreferred: number;
  ties: number;
  preferredShare: number;
  p95: { control: number | null; arm: number | null };
  p95Ratio: number | null;
  floor: typeof R4_FLOOR;
  failures: string[];
}

export function scoreRatings({ pack, key, ratings, turnsSha256, minItems }: { pack: R4Pack; key: R4Key; ratings: R4Ratings; turnsSha256: string; minItems: number }): R4Score {
  const refusals: string[] = [];
  if (key.turnsSha256 !== turnsSha256) refusals.push(`the turns file changed since the pack was built (key ${key.turnsSha256}, now ${turnsSha256})`);
  const packSha = packDigest(pack);
  if (key.packSha256 !== packSha) refusals.push(`the pack changed since it was sealed (key ${key.packSha256}, now ${packSha})`);
  if (ratings.packSha256 !== key.packSha256) refusals.push(`the ratings were made against another pack (${ratings.packSha256})`);
  const known = new Set(pack.items.map((item) => item.id));
  const seen = new Set<string>();
  for (const row of ratings.ratings) {
    if (!known.has(row.item)) refusals.push(`the ratings name an unknown item "${row.item}"`);
    if (seen.has(row.item)) refusals.push(`item "${row.item}" is rated twice`);
    seen.add(row.item);
    if (row.prefer !== 'A' && row.prefer !== 'B' && row.prefer !== 'tie') refusals.push(`item "${row.item}" has no valid preference (${JSON.stringify(row.prefer)}); use A, B or tie`);
  }
  const unrated = [...known].filter((id) => !seen.has(id));
  if (unrated.length) refusals.push(`unrated items: ${unrated.join(', ')}`);
  if (refusals.length) throw new Error(`refusing to score R4:\n- ${refusals.join('\n- ')}`);
  let armPreferred = 0;
  let controlPreferred = 0;
  let ties = 0;
  for (const row of ratings.ratings) {
    if (row.prefer === 'tie') { ties += 1; continue; }
    const side = row.prefer === 'A' ? key.items[row.item].a : key.items[row.item].b;
    if (side === 'arm') armPreferred += 1;
    else controlPreferred += 1;
  }
  const items = ratings.ratings.length;
  const preferredShare = items ? armPreferred / items : 0;
  const control = latencyPercentiles(key.latencyMs.control).p95;
  const arm = latencyPercentiles(key.latencyMs.arm).p95;
  const p95Ratio = control && arm !== null ? arm / control : null;
  const failures: string[] = [];
  if (items < minItems) failures.push(`${items} valid rated pairs, the floor is declared on ${minItems}; re-run the excluded turns`);
  if (preferredShare < R4_FLOOR.preferredShare) failures.push(`arm preferred in ${armPreferred} of ${items} (${(preferredShare * 100).toFixed(1)}%), floor ${R4_FLOOR.preferredShare * 100}%`);
  if (p95Ratio === null) failures.push('no latency to compare');
  else if (p95Ratio > R4_FLOOR.p95Ratio) failures.push(`arm p95 is ${p95Ratio.toFixed(2)}x the control, floor ${R4_FLOOR.p95Ratio}x`);
  return { ok: failures.length === 0, items, armPreferred, controlPreferred, ties, preferredShare, p95: { control, arm }, p95Ratio, floor: R4_FLOOR, failures };
}
