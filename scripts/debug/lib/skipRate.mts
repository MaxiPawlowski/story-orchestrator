import { createHash } from 'node:crypto';

export const SKIP_RATE_FORMAT = 'v30-32-skip-rate';
export const CONTROL_LINE = 'We travel on.';
export const CATEGORIES = ['coherence', 'voice', 'guidance', 'continuity'] as const;
export const FLAGS = ['voiceBleed', 'guidanceIgnored', 'leak'] as const;
export const LABELS = ['landsAtThreshold', 'decidesForPlayer', 'undisclosedReveal'] as const;

export const SKIP_FLOORS = { rated: 25, categoryDelta: -0.2, flagsOverControl: 2, landsAtThreshold: 20, decidesForPlayer: 1, undisclosedReveal: 0 } as const;

type Category = (typeof CATEGORIES)[number];
type Flag = (typeof FLAGS)[number];
type Label = (typeof LABELS)[number];

export interface ArmReply { text: string; reasoning: string; closed: boolean }
export interface CapturedState { id: string; speaker: string; chat: string[]; visible: string; skip: ArmReply; control: ArmReply }
export type Side = Record<Category, number> & Record<Flag, boolean> & Record<Label, boolean>;
export interface Verdict { X: Side; Y: Side; prefer: 'X' | 'Y' | 'tie'; why: string }
export interface RatedRow { id: string; flip: boolean; skip: Side & { closed: boolean }; control: Side & { closed: boolean }; prefer: 'skip' | 'control' | 'tie'; why: string }

export const flipFor = (id: string, salt: string): boolean => createHash('sha256').update(`${salt}:${id}`).digest()[0] % 2 === 1;

export const ratePrompt = (state: CapturedState, salt: string): string => {
  const [x, y] = flipFor(state.id, salt) ? [state.control, state.skip] : [state.skip, state.control];
  return [
    `Two replies were written by the same model at the same moment of a group roleplay. The character speaking is "${state.speaker}".`,
    `In both, the player wanted the story to move past travel, waiting or routine: in one the player typed a short line asking to move on, in the other the player asked through a button and typed nothing. You are not told which is which.`,
    '', 'What the player has seen so far that matters (reference only):', '<<<', state.visible, '>>>',
    '', 'Most recent chat messages (oldest first):', '<<<', state.chat.join('\n\n'), '>>>',
    '', 'Reply X:', '<<<', x.text, '>>>', '', 'Reply Y:', '<<<', y.text, '>>>', '',
    'Rate each reply 1-5 on: coherence (readable, consistent, follows from the chat), voice (sounds like the speaker), guidance (moves time on briefly and lands at a sensible stopping point), continuity (consistent with established facts, the scene and who is present).',
    'Flags per reply: voiceBleed (takes on another cast member\'s voice or speaks for them), guidanceIgnored (does not move time on at all, or plays out every beat), leak (planning notes, bullet thinking or instructions appear in the reply).',
    'Labels per reply: landsAtThreshold (ends at a moment that needs the player, with the next move left to them), decidesForPlayer (writes the player\'s actions, words, feelings or choices), undisclosedReveal (states something the player has not seen and the chat does not support).',
    'Then say which you prefer.',
    '',
    'Answer only: {"X":{"coherence":n,"voice":n,"guidance":n,"continuity":n,"voiceBleed":bool,"guidanceIgnored":bool,"leak":bool,"landsAtThreshold":bool,"decidesForPlayer":bool,"undisclosedReveal":bool},"Y":{same keys},"prefer":"X"|"Y"|"tie","why":"one sentence"}',
  ].join('\n');
};

const side = (value: unknown): Side | null => {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (!CATEGORIES.every((key) => { const score = row[key]; return typeof score === 'number' && score >= 1 && score <= 5; })) return null;
  if (![...FLAGS, ...LABELS].every((key) => typeof row[key] === 'boolean')) return null;
  return row as unknown as Side;
};

export const parseVerdict = (raw: Record<string, unknown> | null): Verdict | null => {
  const x = side(raw?.X);
  const y = side(raw?.Y);
  const prefer = raw?.prefer;
  if (!x || !y || (prefer !== 'X' && prefer !== 'Y' && prefer !== 'tie')) return null;
  return { X: x, Y: y, prefer, why: typeof raw?.why === 'string' ? raw.why : '' };
};

export const unseal = (state: CapturedState, verdict: Verdict, salt: string): RatedRow => {
  const flip = flipFor(state.id, salt);
  const skip = flip ? verdict.Y : verdict.X;
  const control = flip ? verdict.X : verdict.Y;
  const prefer = verdict.prefer === 'tie' ? 'tie' : (verdict.prefer === 'X') !== flip ? 'skip' : 'control';
  return { id: state.id, flip, skip: { ...skip, closed: state.skip.closed }, control: { ...control, closed: state.control.closed }, prefer, why: verdict.why };
};

export const summarize = (rows: readonly RatedRow[]) => {
  const mean = (arm: 'skip' | 'control', key: Category) => (rows.length ? rows.reduce((sum, row) => sum + row[arm][key], 0) / rows.length : 0);
  const count = (arm: 'skip' | 'control', key: Flag | Label) => rows.filter((row) => row[arm][key]).length;
  const means = Object.fromEntries(CATEGORIES.map((key) => [key, { control: +mean('control', key).toFixed(2), skip: +mean('skip', key).toFixed(2), delta: +(mean('skip', key) - mean('control', key)).toFixed(2) }]));
  const flags = Object.fromEntries(FLAGS.map((key) => [key, { control: count('control', key), skip: count('skip', key) }]));
  const labels = Object.fromEntries(LABELS.map((key) => [key, { control: count('control', key), skip: count('skip', key) }]));
  const notClosed = { control: rows.filter((row) => !row.control.closed).length, skip: rows.filter((row) => !row.skip.closed).length };
  const floors = {
    rated: rows.length >= SKIP_FLOORS.rated,
    categories: Object.values(means).every((entry) => entry.delta >= SKIP_FLOORS.categoryDelta),
    flags: Object.values(flags).reduce((sum, entry) => sum + entry.skip, 0) <= Object.values(flags).reduce((sum, entry) => sum + entry.control, 0) + SKIP_FLOORS.flagsOverControl,
    thinkingClosure: notClosed.skip <= notClosed.control,
    landsAtThreshold: count('skip', 'landsAtThreshold') >= SKIP_FLOORS.landsAtThreshold,
    decidesForPlayer: count('skip', 'decidesForPlayer') <= SKIP_FLOORS.decidesForPlayer,
    undisclosedReveal: count('skip', 'undisclosedReveal') <= SKIP_FLOORS.undisclosedReveal,
  };
  const prefer = { skip: rows.filter((row) => row.prefer === 'skip').length, control: rows.filter((row) => row.prefer === 'control').length, tie: rows.filter((row) => row.prefer === 'tie').length };
  return { format: SKIP_RATE_FORMAT, rated: rows.length, means, flags, labels, notClosed, prefer, floors, pass: Object.values(floors).every(Boolean) };
};

export const packLeaks = (prompts: readonly string[]): string[] =>
  prompts.flatMap((prompt, index) => (/\bso-[a-z]|skipAhead|\/story skip/i.test(prompt) ? [`prompt ${index} names the arm`] : []));
