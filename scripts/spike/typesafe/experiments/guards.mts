import { noulOf, systemOne } from '../lib/client.mts';
import { loadData } from '../lib/story.mts';
import { auroc, binaryAccuracy, frac, fixed, pct, table, type BinaryRow } from '../lib/stats.mts';
import type { Experiment, ExperimentContext } from './types.mts';

interface ContinuityCase { id: string; established: string[]; reply: { speaker: string; text: string }; contradicts: number[]; tags: string[] }
interface CriticCase { id: string; target: string; roster: string[]; facts: string[]; beats: string[]; labels: { contradicts: boolean; advances: boolean; newCharacter: boolean } }

const CONTRA_PLAIN = (fact: string) => `Does \`reply\` contradict this established fact: "${fact}"?`;
const CONTRA_CRITERIA = {
  true: 'The reply and the fact cannot both be true: the reply shows or narrates something the fact rules out, or a character knows something the fact says they do not',
  false: 'Both can be true: the reply agrees with the fact, does not touch it, or only shows a suspicion or a character\'s own claim',
};

export const continuity: Experiment = {
  id: 'continuity',
  title: 'Continuity warden: does the latest reply contradict what is established?',
  async run(ctx: ExperimentContext) {
    const cases = loadData<ContinuityCase[]>('continuity.json');
    const rows: Array<Record<string, any>> = [];
    await Promise.all(cases.map(async (entry) => {
      const questions: Record<string, any> = {};
      entry.established.forEach((fact, index) => {
        questions[`plain:${index}`] = { type: 'noul', instructions: CONTRA_PLAIN(fact) };
        questions[`structured:${index}`] = { type: 'noul', instructions: CONTRA_PLAIN(fact), criteria: CONTRA_CRITERIA };
      });
      const record = await systemOne({ state: { established_facts: entry.established, reply: entry.reply }, questions }, { tag: `continuity:${entry.id}` });
      entry.established.forEach((fact, index) => rows.push({ caseId: entry.id, fact, reply: entry.reply.text, tags: entry.tags, label: entry.contradicts.includes(index), plain: noulOf(record, `plain:${index}`), structured: noulOf(record, `structured:${index}`) }));
    }));
    rows.sort((a, b) => a.caseId.localeCompare(b.caseId, undefined, { numeric: true }));
    const caseIds = [...new Set(rows.map((row) => row.caseId))];
    const caseLevel = (key: string, cut: number) => caseIds.filter((id) => {
      const list = rows.filter((row) => row.caseId === id);
      return list.some((row) => row.label) === list.some((row) => row[key] >= cut);
    }).length;
    const binary = (key: string): BinaryRow[] => rows.map((row) => ({ p: row[key], label: row.label }));
    const falseAlarms = (key: string) => rows.filter((row) => !row.label && row[key] >= 0.5).length;
    return {
      id: this.id,
      title: this.title,
      summary: [
        `${cases.length} replies checked against ${rows.length} established facts (${rows.filter((row) => row.label).length} real contradictions: dead character speaking, forgotten injury, knowledge leak, wrong time of day, reversed state).`,
        `Per fact, AUROC: question-only ${fixed(auroc(binary('plain')))}, with criteria ${fixed(auroc(binary('structured')))}; accuracy at 0.5 ${pct(binaryAccuracy(binary('plain')))} / ${pct(binaryAccuracy(binary('structured')))}.`,
        `Per reply ("flag this turn?"), criteria at 0.5: ${frac(caseLevel('structured', 0.5), caseIds.length)}; false alarms on consistent facts: ${falseAlarms('structured')}/${rows.filter((row) => !row.label).length}.`,
      ],
      sections: [
        { title: 'Every fact check', body: table(['case', 'fact', 'reply', 'truth', 'q-only', 'criteria'], rows.map((row) => [row.caseId, row.fact, row.reply, row.label ? 'contradiction' : 'consistent', fixed(row.plain), fixed(row.structured)])) },
      ],
      data: rows,
    };
  },
};

export const critic: Experiment = {
  id: 'critic',
  title: 'Expansion critic: checking generated beats',
  async run(ctx: ExperimentContext) {
    const cases = loadData<CriticCase[]>('critic.json');
    const rows: Array<Record<string, any>> = [];
    await Promise.all(cases.map(async (entry) => {
      const record = await systemOne({
        state: { target_checkpoint: entry.target, cast: entry.roster, established_facts: entry.facts, generated_beats: entry.beats },
        questions: {
          contradicts: { type: 'noul', instructions: 'Does any beat in `generated_beats` contradict one of `established_facts`?', criteria: { true: 'A beat shows something an established fact rules out', false: 'Every beat is compatible with every established fact' } },
          advances: { type: 'noul', instructions: 'Do `generated_beats`, taken in order, move the story toward `target_checkpoint`?', criteria: { true: 'The beats end at or clearly closer to the target', false: 'The beats wander, go backwards, or make the target impossible' } },
          newCharacter: { type: 'noul', instructions: 'Do `generated_beats` bring in a named character who is not in `cast`?', criteria: { true: 'A new named person appears in a beat', false: 'Only cast members or unnamed people appear' } },
        },
      }, { tag: `critic:${entry.id}` });
      rows.push({ id: entry.id, labels: entry.labels, contradicts: noulOf(record, 'contradicts'), advances: noulOf(record, 'advances'), newCharacter: noulOf(record, 'newCharacter') });
    }));
    rows.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    const checks = ['contradicts', 'advances', 'newCharacter'] as const;
    const right = (check: typeof checks[number]) => rows.filter((row) => (row[check] >= 0.5) === row.labels[check]).length;
    const verdictRight = rows.filter((row) => {
      const truthPass = !row.labels.contradicts && row.labels.advances && !row.labels.newCharacter;
      const jevPass = row.contradicts < 0.5 && row.advances >= 0.5 && row.newCharacter < 0.5;
      return truthPass === jevPass;
    }).length;
    return {
      id: this.id,
      title: this.title,
      summary: [
        `${rows.length} generated beat chains, three checks each. Right per check: contradiction ${frac(right('contradicts'), rows.length)}, advances toward target ${frac(right('advances'), rows.length)}, new named character ${frac(right('newCharacter'), rows.length)}. Overall pass/fail verdict ${frac(verdictRight, rows.length)}.`,
        'Not compared with the current critic, whose prompt needs a full expansion plan; the checks here are the ones its JSON verdict is meant to cover.',
      ],
      sections: [
        { title: 'Every chain', body: table(['case', 'truth c/a/n', 'contradicts', 'advances', 'new character'], rows.map((row) => [row.id, `${row.labels.contradicts ? 'Y' : 'n'}/${row.labels.advances ? 'Y' : 'n'}/${row.labels.newCharacter ? 'Y' : 'n'}`, fixed(row.contradicts), fixed(row.advances), fixed(row.newCharacter)])) },
      ],
      data: rows,
    };
  },
};
