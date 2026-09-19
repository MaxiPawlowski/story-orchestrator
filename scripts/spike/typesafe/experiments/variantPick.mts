import { noulOf, scoreOf, systemOne, type Question } from '../lib/client.mts';
import { loadData } from '../lib/story.mts';
import { frac, fixed, table } from '../lib/stats.mts';
import type { Experiment } from './types.mts';

interface Chain { label: 'clean' | 'contradicts' | 'wanders'; beats: string[] }
interface Stub { id: string; lang: string; facts: string[]; target: { name: string; objective: string }; cast: string[]; trajectory: string[]; chains: Chain[] }

const SHAPE_LEVELS = [
  'The beats ignore the trajectory: their tension runs the opposite way or stays flat where it should move',
  'The beats follow the trajectory in one place and break it elsewhere',
  'The beats roughly follow the trajectory, with one step out of place',
  'The beats follow the trajectory closely, each step close to its target level',
  'The beats match the trajectory step for step',
];

// The three critic nouls are the spike's (experiments/guards.mts:63-66) verbatim; the shape score is new.
export const chainQuestions = (): Record<string, Question> => ({
  contradicts: { type: 'noul', instructions: 'Does any beat in `generated_beats` contradict one of `established_facts`?', criteria: { true: 'A beat shows something an established fact rules out', false: 'Every beat is compatible with every established fact' } },
  advances: { type: 'noul', instructions: 'Do `generated_beats`, taken in order, move the story toward `target_checkpoint`?', criteria: { true: 'The beats end at or clearly closer to the target', false: 'The beats wander, go backwards, or make the target impossible' } },
  newCharacter: { type: 'noul', instructions: 'Do `generated_beats` bring in a named character who is not in `cast`?', criteria: { true: 'A new named person appears in a beat', false: 'Only cast members or unnamed people appear' } },
  shape: { type: 'score', instructions: 'How closely do `generated_beats` follow `tension_trajectory`, one level per beat in order?', criteria: SHAPE_LEVELS },
});

export const chainScore = (answers: { contradicts: number; advances: number; newCharacter: number; shape: number }) => answers.advances + answers.shape - 2 * answers.contradicts - answers.newCharacter;

// v2.2 plan 07 Phase A: rank N chains per stub; code picks. Floors: the clean chain ranks first in
// ≥ 8/10 stubs, and every contradicting chain is rejected at contradicts ≥ 0.3.
export const variantPick: Experiment = {
  id: 'variant-pick',
  title: 'Generate-then-pick: ranking beat chains — v2.2 plan 07 Phase A',
  async run() {
    const stubs = loadData<{ stubs: Stub[] }>('variants.json').stubs;
    const rows = await Promise.all(stubs.map(async (stub) => {
      const scored = await Promise.all(stub.chains.map(async (chain) => {
        const state = {
          established_facts: stub.facts,
          target_checkpoint: stub.target,
          cast: stub.cast,
          tension_trajectory: stub.trajectory,
          generated_beats: chain.beats.map((objective) => ({ objective })),
        };
        const record = await systemOne({ state, questions: chainQuestions() }, { tag: `variant-pick:${stub.id}:${chain.label}` });
        const shape = scoreOf(record, 'shape').score / (SHAPE_LEVELS.length - 1);
        const answers = { contradicts: noulOf(record, 'contradicts'), advances: noulOf(record, 'advances'), newCharacter: noulOf(record, 'newCharacter'), shape };
        return { label: chain.label, ...answers, total: chainScore(answers) };
      }));
      const ranked = [...scored].sort((a, b) => b.total - a.total);
      return { stub, scored, top: ranked[0].label };
    }));
    rows.sort((a, b) => a.stub.id.localeCompare(b.stub.id, undefined, { numeric: true }));
    const cleanFirst = rows.filter((row) => row.top === 'clean').length;
    const contradicting = rows.map((row) => row.scored.find((item) => item.label === 'contradicts')!);
    const rejected = contradicting.filter((item) => item.contradicts >= 0.3).length;
    const wanders = rows.map((row) => row.scored.find((item) => item.label === 'wanders')!);
    const cleanChains = rows.map((row) => row.scored.find((item) => item.label === 'clean')!);
    const verdictPass = (item: { contradicts: number; advances: number; newCharacter: number }) => item.contradicts < 0.3 && item.advances >= 0.5 && item.newCharacter < 0.5;
    return {
      id: this.id,
      title: this.title,
      summary: [
        `${rows.length} stubs × 3 chains (2 stubs in Spanish). Clean chain ranked first: ${frac(cleanFirst, rows.length)} (floor 8/10).`,
        `Contradicting chains rejected at contradicts ≥ 0.3: ${frac(rejected, contradicting.length)} (floor: all). Wandering chains with advances < 0.5: ${frac(wanders.filter((item) => item.advances < 0.5).length, wanders.length)}.`,
        `Judge verdict (contradicts < 0.3, advances ≥ 0.5, newCharacter < 0.5): clean chains pass ${frac(cleanChains.filter(verdictPass).length, cleanChains.length)}, defective chains pass ${frac([...contradicting, ...wanders].filter(verdictPass).length, contradicting.length + wanders.length)}.`,
      ],
      sections: [{ title: 'Every chain', body: table(['stub', 'chain', 'contradicts', 'advances', 'new char', 'shape', 'score', 'rank 1?'], rows.flatMap((row) => row.scored.map((item) => [
        `${row.stub.id}${row.stub.lang === 'es' ? ' es' : ''}`, item.label, fixed(item.contradicts), fixed(item.advances), fixed(item.newCharacter), fixed(item.shape), fixed(item.total), row.top === item.label ? '←' : '',
      ]))) }],
      data: rows,
    };
  },
};
