import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { OUTCOMES, readDrafts, type Outcome } from './sceneReplay.mts';
import { unblind, type KeyRow, type Rating } from './sceneRate.mts';

export const SCENE_FLOORS = {
  s7Honour: 0.8, s8NarratedMax: 0, s8Margin: 0.05, s9Margin: 0.1, s11Changed: 0.7, s11ExpectedSurprise: 0.3,
  frontiers: 20, minRated: 15, runs: 2,
} as const;

const EPSILON = 1e-9;
const CHANGED: Outcome[] = ['altered', 'interrupt'];

export type Ratio = { hits: number; of: number; rate: number | null };
const ratio = (hits: number, of: number): Ratio => ({ hits, of, rate: of ? hits / of : null });
const atMost = (value: Ratio, bar: number | null) => (value.rate === null || bar === null ? null : value.rate <= bar + EPSILON);
const atLeast = (value: Ratio, bar: number) => (value.rate === null ? null : value.rate >= bar - EPSILON);
const all = (values: Array<boolean | null>) => (values.some((value) => value === null) ? null : values.every(Boolean));

export interface RunInput { run: number; drafts: any[]; honour: { ratings: Rating[]; key: KeyRow[] } | null; blind: { ratings: Rating[]; key: KeyRow[] } | null }

export function scoreSceneRun(input: RunInput, frontiers: number = SCENE_FLOORS.frontiers) {
  const reasons: string[] = [];
  const arm = (outcome: Outcome) => input.drafts.filter((draft) => draft.outcome === outcome);
  for (const outcome of OUTCOMES) if (arm(outcome).length < frontiers) reasons.push(`${outcome}: ${arm(outcome).length} of ${frontiers} drafts`);
  if (input.drafts.some((draft) => draft.plumbing)) reasons.push('plumbing drafts: never a measurement');
  if (!input.honour) reasons.push('no honour ratings (S7)');
  if (!input.blind) reasons.push('no blind ratings (S8, S11)');
  const honour = input.honour ? unblind(input.honour.ratings.filter((rating) => rating.ok), input.honour.key) : [];
  const blind = input.blind ? unblind(input.blind.ratings.filter((rating) => rating.ok), input.blind.key) : [];
  const rated = (rows: typeof blind, outcome: Outcome) => rows.filter((row) => row.outcome === outcome);
  const delivered = (outcome: Outcome) => arm(outcome).filter((draft) => draft.delivered).length;
  for (const outcome of OUTCOMES) {
    if (input.blind && rated(blind, outcome).length < delivered(outcome)) reasons.push(`blind ${outcome}: ${rated(blind, outcome).length} of ${delivered(outcome)} delivered drafts rated`);
    if (input.blind && rated(blind, outcome).length < SCENE_FLOORS.minRated) reasons.push(`blind ${outcome}: ${rated(blind, outcome).length} rated, fewer than ${SCENE_FLOORS.minRated}`);
  }
  for (const outcome of CHANGED) if (input.honour && rated(honour, outcome).length < delivered(outcome)) reasons.push(`honour ${outcome}: ${rated(honour, outcome).length} of ${delivered(outcome)} delivered drafts rated`);
  const yes = (row: any, field: string) => row.answer?.[field] === true;

  const s7Arms = Object.fromEntries(CHANGED.map((outcome) => [outcome, ratio(rated(honour, outcome).filter((row) => yes(row, 'honours') && yes(row, 'world_side')).length, arm(outcome).length)]));
  const s7 = {
    floor: `honours and world-side rate >= ${SCENE_FLOORS.s7Honour} for altered and for interrupt (undelivered drafts count as not honoured)`,
    arms: s7Arms,
    pass: all(CHANGED.map((outcome) => atLeast(s7Arms[outcome], SCENE_FLOORS.s7Honour))),
  };

  const narratedAttempts = Object.fromEntries(OUTCOMES.map((outcome) => [outcome, arm(outcome).reduce((sum, draft) => sum + draft.attempts.filter((attempt: any) => attempt.narrated).length, 0)]));
  const narrated = Object.values(narratedAttempts).reduce((sum, value) => sum + value, 0);
  const agency = Object.fromEntries(OUTCOMES.map((outcome) => [outcome, ratio(rated(blind, outcome).filter((row) => yes(row, 'agency_flag')).length, rated(blind, outcome).length)]));
  const agencyBar = agency.expected.rate === null ? null : agency.expected.rate + SCENE_FLOORS.s8Margin;
  const s8 = {
    floor: `guard narrated-player count = ${SCENE_FLOORS.s8NarratedMax} over every parsed attempt (a detector, a lower bound); agency-flag rate of each changed arm <= expected + ${SCENE_FLOORS.s8Margin}`,
    narratedAttempts, narrated, agency, bar: agencyBar,
    pass: all([narrated <= SCENE_FLOORS.s8NarratedMax, ...CHANGED.map((outcome) => atMost(agency[outcome], agencyBar))]),
  };

  const criticRefused = (draft: any) => draft.attempts.some((attempt: any) => attempt.critic?.refused);
  const critic = Object.fromEntries(OUTCOMES.map((outcome) => [outcome, ratio(arm(outcome).filter(criticRefused).length, arm(outcome).length)]));
  const criticBar = critic.expected.rate === null ? null : critic.expected.rate + SCENE_FLOORS.s9Margin;
  const stageRate = (stage: string) => Object.fromEntries(OUTCOMES.map((outcome) => [outcome, ratio(arm(outcome).filter((draft) => draft.attempts.some((attempt: any) => attempt.stage === stage)).length, arm(outcome).length)]));
  const s9 = {
    floor: `critic refusal rate (drafts with at least one critic refusal) of each changed arm <= expected + ${SCENE_FLOORS.s9Margin}`,
    critic, bar: criticBar,
    pass: all(CHANGED.map((outcome) => atMost(critic[outcome], criticBar))),
    informational: {
      parseRefusal: stageRate('parse'),
      opsRefusal: stageRate('ops'),
      guardRefusal: stageRate('guard'),
      sceneAnswerRefusal: Object.fromEntries(OUTCOMES.map((outcome) => [outcome, ratio(arm(outcome).filter((draft) => draft.attempts.some((attempt: any) => attempt.scene?.length)).length, arm(outcome).length)])),
      finalRefused: Object.fromEntries(OUTCOMES.map((outcome) => [outcome, ratio(arm(outcome).filter((draft) => draft.status !== 'ok').length, arm(outcome).length)])),
      changedKinds: Object.fromEntries(CHANGED.map((outcome) => [outcome, arm(outcome).reduce<Record<string, number>>((counts, draft) => {
        const kind = outcome === 'altered' ? (draft.delivered?.changed ?? ['none']).join('+') : draft.delivered?.advances ? 'advances' : 'none';
        return { ...counts, [kind]: (counts[kind] ?? 0) + 1 };
      }, {})])),
    },
  };

  const surprisingCoherent = Object.fromEntries(OUTCOMES.map((outcome) => [outcome, ratio(rated(blind, outcome).filter((row) => yes(row, 'surprising') && yes(row, 'coherent')).length, rated(blind, outcome).length)]));
  const surprising = Object.fromEntries(OUTCOMES.map((outcome) => [outcome, ratio(rated(blind, outcome).filter((row) => yes(row, 'surprising')).length, rated(blind, outcome).length)]));
  const s11 = {
    floor: `blind: altered and interrupt each surprising-and-coherent >= ${SCENE_FLOORS.s11Changed}; expected surprising <= ${SCENE_FLOORS.s11ExpectedSurprise}`,
    surprisingCoherent, surprising,
    pass: all([...CHANGED.map((outcome) => atLeast(surprisingCoherent[outcome], SCENE_FLOORS.s11Changed)), atMost(surprising.expected, SCENE_FLOORS.s11ExpectedSurprise)]),
  };

  const floors = { S7: s7.pass, S8: s8.pass, S9: s9.pass, S11: s11.pass };
  const verdict = reasons.length || Object.values(floors).some((value) => value === null) ? 'insufficient' : Object.values(floors).every(Boolean) ? 'pass' : 'fail';
  return {
    run: input.run, verdict, reasons, floors,
    counts: Object.fromEntries(OUTCOMES.map((outcome) => [outcome, { drafts: arm(outcome).length, delivered: delivered(outcome), accepted: arm(outcome).filter((draft) => draft.status === 'ok').length, blindRated: rated(blind, outcome).length, honourRated: rated(honour, outcome).length }])),
    raters: [...new Set([...honour, ...blind].map((row) => row.rater))],
    routes: [...new Set(input.drafts.map((draft) => draft.route?.model ?? null))],
    S7: s7, S8: s8, S9: s9, S11: s11,
  };
}

export function overallVerdict(runs: Array<{ verdict: string }>, needed: number = SCENE_FLOORS.runs) {
  if (runs.length < needed || runs.some((run) => run.verdict === 'insufficient')) return 'insufficient';
  return runs.every((run) => run.verdict === 'pass') ? 'pass' : 'fail';
}

const readJson = async (file: string) => JSON.parse(await readFile(file, 'utf-8'));

async function ratingsOf(out: string, run: number, pack: 'honour' | 'blind') {
  const dir = join(out, `run${run}`, 'rate');
  const ratings = join(dir, `${pack}-ratings.json`);
  const key = join(dir, `${pack}-key.json`);
  if (!existsSync(ratings) || !existsSync(key)) return null;
  const held = await readJson(ratings);
  return { ratings: held.ratings as Rating[], key: (await readJson(key)).rows as KeyRow[], plumbing: held.plumbing === true };
}

export async function scoreScene(out: string, runs: number[] = [1, 2]) {
  const scored = [];
  for (const run of runs) {
    const honour = await ratingsOf(out, run, 'honour');
    const blind = await ratingsOf(out, run, 'blind');
    const score = scoreSceneRun({ run, drafts: await readDrafts(out, run), honour, blind });
    if (honour?.plumbing || blind?.plumbing) {
      score.reasons.push('plumbing ratings: never a measurement');
      score.verdict = 'insufficient';
    }
    scored.push(score);
  }
  return { plan: 'v2.8 48 S7, S8, S9, S11 (CL)', floors: SCENE_FLOORS, informational: 'floors are informational (00-overview rule 9): a miss is recorded, the feature stays on', runs: scored, verdict: overallVerdict(scored) };
}
