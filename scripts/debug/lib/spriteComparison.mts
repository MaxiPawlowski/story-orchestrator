import { createHash } from 'node:crypto';
import { seededRandom } from './ratingPack.mts';
import { slugName } from './imageHarnessConfig.mts';

export const COMPARISON_ARMS = ['regular', 'simple', 'smooth'] as const;
export const COMPARISON_LABELS = ['neutral', 'happy', 'angry', 'worried'] as const;
export type ComparisonArm = typeof COMPARISON_ARMS[number];
export interface ComparisonSample { label: string; base: string; blink: string; talk: string; talk2: string }
export interface ComparisonVote { id: string; preferred: 'A' | 'B' | 'tie' | null; seamA: boolean | null; seamB: boolean | null; expressionA: boolean | null; expressionB: boolean | null; note: string }
export interface LookRating { id: number; sameCharacter: boolean; changeVisible: boolean; expressionPreserved: boolean }
export interface LabeledVote { label: string; preferred: ComparisonArm | 'tie' | null; modes: Record<ComparisonArm, { seam: boolean | null; expression: boolean | null }>; note: string }

export function labeledComparison(samples: ComparisonSample[], seed: string, character: string) {
  const who = slugName(character ?? '');
  if (!who) throw new Error('A labeled comparison names its character.');
  comparisonPack(samples, seed);
  const votes: LabeledVote[] = samples.map(({ label }) => ({ label, preferred: null,
    modes: { regular: { seam: null, expression: null }, simple: { seam: null, expression: null }, smooth: { seam: null, expression: null } }, note: '' }));
  const content = createHash('sha256').update(JSON.stringify(samples)).digest('hex').slice(0, 12);
  return { id: `${who}-${seed}-${content}-labeled`, character, samples, votes };
}

export function scoreLabeled(votes: LabeledVote[]) {
  if (votes.length !== 4 || new Set(votes.map((vote) => vote.label)).size !== 4
    || COMPARISON_LABELS.some((label) => !votes.some((vote) => vote.label === label))) throw new Error('All four labeled expression reviews are required.');
  const rated = votes.filter((vote) => [...COMPARISON_ARMS, 'tie'].includes(vote.preferred ?? '')
    && COMPARISON_ARMS.every((mode) => typeof vote.modes?.[mode]?.seam === 'boolean' && typeof vote.modes?.[mode]?.expression === 'boolean')).length;
  return { status: rated === 4 ? 'user-reviewed' : 'pending-user-ratings', presentation: 'labeled-simultaneous', ratedExpressions: rated,
    preferences: Object.fromEntries([...COMPARISON_ARMS, 'tie'].map((mode) => [mode, votes.filter((vote) => vote.preferred === mode).length])),
    acceptance: 'pending-full-S28-matrix-and-runtime-gates' };
}

export function scoreLooks(ratings: LookRating[]) {
  if (ratings.length !== 20 || ratings.some((row, at) => row.id !== at
    || [row.sameCharacter, row.changeVisible, row.expressionPreserved].some((value) => typeof value !== 'boolean'))) {
    throw new Error('All twenty ordered look ratings are required.');
  }
  const identity = ratings.filter((row) => row.sameCharacter).length / 20;
  const change = ratings.filter((row) => row.changeVisible).length / 20;
  return { identity, change, expression: ratings.filter((row) => row.expressionPreserved).length / 20,
    passes: identity >= 0.9 && change >= 0.9, runtimeAcceptance: 'pending-on-demand-lifecycle-and-text-wait' };
}

export function comparisonPack(samples: ComparisonSample[], seed: string) {
  if (samples.length !== 4 || new Set(samples.map((sample) => sample.label)).size !== 4
    || COMPARISON_LABELS.some((label) => !samples.some((sample) => sample.label === label))) throw new Error('All four expression samples are required.');
  if (samples.some((sample) => [sample.base, sample.blink, sample.talk, sample.talk2].some((value) => !value.startsWith('data:image/png;base64,')))) throw new Error('Every sample needs its base and all three PNG frames.');
  const random = seededRandom(seed);
  const pairs = samples.flatMap((sample) => [[0, 1], [0, 2], [1, 2]].map(([first, second]) => {
    const [a, b] = random() < 0.5 ? [first, second] : [second, first];
    const id = createHash('sha256').update(`${seed}:${sample.label}:${first}:${second}`).digest('hex').slice(0, 12);
    return { id, label: sample.label, sample, variants: [a, b], order: random() };
  })).sort((a, b) => a.order - b.order);
  const key = pairs.map((pair) => ({ id: pair.id, A: COMPARISON_ARMS[pair.variants[0]], B: COMPARISON_ARMS[pair.variants[1]] }));
  const votes: ComparisonVote[] = pairs.map(({ id }) => ({ id, preferred: null, seamA: null, seamB: null, expressionA: null, expressionB: null, note: '' }));
  return { pairs: pairs.map(({ order, ...pair }) => pair), key, votes, status: 'pending-user-ratings' };
}

export function scoreComparison(key: Array<{ id: string; A: ComparisonArm; B: ComparisonArm }>, votes: ComparisonVote[]) {
  if (new Set(key.map((row) => row.id)).size !== key.length || new Set(votes.map((row) => row.id)).size !== votes.length
    || votes.some((vote) => !key.some((row) => row.id === vote.id))) throw new Error('Duplicate or unknown rating ids.');
  const complete = key.length > 0 && key.every((row) => {
    const vote = votes.find((vote) => vote.id === row.id);
    return vote && ['A', 'B', 'tie'].includes(vote.preferred ?? '')
      && [vote.seamA, vote.seamB, vote.expressionA, vote.expressionB].every((value) => typeof value === 'boolean');
  });
  if (!complete) return { status: 'pending-user-ratings', rated: votes.filter((vote) => vote.preferred !== null).length, pairs: key.length };
  const results = key.map((row) => {
    const vote = votes.find((vote) => vote.id === row.id)!;
    return { arms: [row.A, row.B], winner: vote.preferred === 'tie' ? null : row[vote.preferred!], vote };
  });
  const regular = results.filter((row) => row.arms.includes('regular'));
  const mouth = results.filter((row) => !row.arms.includes('regular'));
  const preference = regular.filter((row) => row.winner && row.winner !== 'regular').length / regular.length;
  const seams = results.reduce((sum, row) => sum + Number(row.vote.seamA) + Number(row.vote.seamB), 0) / (results.length * 2);
  const smooth = mouth.filter((row) => row.winner === 'smooth').length / mouth.length;
  return { status: 'rated-pilot', pairs: key.length, animationPreference: preference, seamRate: seams,
    visualFloors: preference >= 0.7 && seams <= 0.05, mouthChoice: smooth > 0.5 ? 'smooth' : 'simple',
    acceptance: 'pending-full-S28-matrix-and-runtime-gates' };
}
