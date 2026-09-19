import { choiceOf, noulOf, systemOne } from '../lib/client.mts';
import { loadData, loadHardCases, msgId, type Message } from '../lib/story.mts';
import { buildJaccardMatchSets, consolidateTier, jaccardSimilarity } from '../lib/prod.mts';
import { auroc, binaryAccuracy, frac, fixed, pct, table, type BinaryRow } from '../lib/stats.mts';
import type { Experiment, ExperimentContext } from './types.mts';

interface PairCase { id: string; label: 'duplicate' | 'update' | 'distinct' | 'unrelated'; type: string; a: string; b: string }
interface VerifyCase { case: string; lines: Array<{ text: string; supported: boolean; kind: string }> }

const ACTION: Record<string, string> = { duplicate: 'drop newer', update: 'supersede older', distinct: 'keep both', unrelated: 'keep both' };
const UNCERTAIN = 'uncertain: keep both, flag older';

const entry = (id: string, text: string, type: string, createdAt: number) => ({
  id, tier: 'facts', text, type, importance: 2, expiration: 'permanent', entities: [], confidence: 1, activationTriggers: [], evidence: '', createdAt, recallCount: 0,
});

export const memoryPairs: Experiment = {
  id: 'memory-pairs',
  title: 'Memory consolidation: duplicate, update, or distinct?',
  async run(ctx: ExperimentContext) {
    const cases = loadData<PairCase[]>('memory-pairs.json');
    const rows: Array<Record<string, any>> = [];
    await Promise.all(cases.map(async (pair) => {
      const instructions = 'Compare `older_note` and `newer_note`, two notes from the same story\'s memory. What is the relationship between them?';
      const record = await systemOne({
        state: { older_note: pair.a, newer_note: pair.b },
        questions: {
          plain: { type: 'choice', instructions, criteria: { duplicate: null, update: null, distinct: null, unrelated: null } },
          structured: {
            type: 'choice', instructions,
            criteria: {
              duplicate: 'The newer note says the same thing as the older one, possibly with extra detail; keeping both is redundant',
              update: 'Both notes are about the same subject, but the newer one reports a change, so the older one is now out of date',
              distinct: 'Same subject, but the newer note adds a different fact; both stay true',
              unrelated: 'The notes are about different subjects',
            },
          },
        },
      }, { tag: `memory-pairs:${pair.id}` });
      const entries = [entry('a', pair.a, pair.type, 1), entry('b', pair.b, pair.type, 2)];
      const result = consolidateTier(entries, buildJaccardMatchSets(entries));
      const production = result.droppedIds.includes('b') ? 'drop newer' : result.supersededPairs.some((item: { loserId: string }) => item.loserId === 'a') ? 'supersede older' : result.uncertain.length ? UNCERTAIN : 'keep both';
      const plain = choiceOf(record, 'plain');
      const structured = choiceOf(record, 'structured');
      rows.push({ ...pair, truth: ACTION[pair.label], jaccard: jaccardSimilarity(pair.a, pair.b), production, plain: plain.choice, plainConf: plain.confidence, structured: structured.choice, structuredConf: structured.confidence });
    }));
    rows.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    const n = rows.length;
    const prodRight = rows.filter((row) => row.production === row.truth).length;
    const prodDeferred = rows.filter((row) => row.production === UNCERTAIN).length;
    const actionOf = (label: string) => ACTION[label];
    const jevRight = (key: 'plain' | 'structured') => rows.filter((row) => actionOf(row[key]) === row.truth).length;
    const labelRight = (key: 'plain' | 'structured') => rows.filter((row) => row[key] === row.label).length;
    return {
      id: this.id,
      title: this.title,
      summary: [
        `${n} labelled note pairs. Right action (drop / supersede / keep): production jaccard ${frac(prodRight, n)}, with ${prodDeferred} more left uncertain (both kept, older flagged contradicted, no model call); Jev bare labels ${frac(jevRight('plain'), n)}; Jev described labels ${frac(jevRight('structured'), n)}.`,
        `Exact relationship label: Jev bare ${frac(labelRight('plain'), n)}, described ${frac(labelRight('structured'), n)}. Production's semantic cosine path (ST vectors) was not exercised here, only its jaccard fallback.`,
      ],
      sections: [
        { title: 'Every pair', body: table(['pair', 'truth', 'jaccard', 'production', 'Jev bare', 'Jev described'], rows.map((row) => [
          `${row.id}: "${row.a}" / "${row.b}"`, `${row.label} → ${row.truth}`, fixed(row.jaccard),
          `${row.production}${row.production === row.truth ? ' ✓' : row.production === UNCERTAIN ? ' …' : ' ✗'}`,
          `${row.plain}${actionOf(row.plain) === row.truth ? ' ✓' : ' ✗'} ${fixed(row.plainConf)}`,
          `${row.structured}${actionOf(row.structured) === row.truth ? ' ✓' : ' ✗'} ${fixed(row.structuredConf)}`,
        ])) },
      ],
      data: rows,
    };
  },
};

const VERIFY_PLAIN = (line: string) => `Is this note supported by \`transcript\`: "${line}"?`;
const VERIFY_CRITERIA = {
  true: 'The transcript states or clearly shows everything the note says',
  false: 'The note adds something the transcript does not show: an invented detail, cause or outcome, the wrong person, the opposite of what happened, or a character\'s false claim stated as fact',
};

export const memoryVerify: Experiment = {
  id: 'memory-verify',
  title: 'Memory-line verification before storing (the cascade "verify" rung)',
  async run(ctx: ExperimentContext) {
    const hard = Object.fromEntries(loadHardCases().map((item) => [item.id, item]));
    const cases = loadData<VerifyCase[]>('verify-lines.json');
    const rows: Array<Record<string, any>> = [];
    await Promise.all(cases.map(async (item) => {
      const transcript = hard[item.case].transcript;
      const state = { transcript: transcript.map((message) => ({ id: msgId(message.index), speaker: message.speaker, text: message.text })) };
      const questions: Record<string, any> = {};
      item.lines.forEach((line, index) => {
        questions[`plain:${index}`] = { type: 'noul', instructions: VERIFY_PLAIN(line.text) };
        questions[`structured:${index}`] = { type: 'noul', instructions: VERIFY_PLAIN(line.text), criteria: VERIFY_CRITERIA };
      });
      const record = await systemOne({ state, questions }, { tag: `memory-verify:${item.case}` });
      item.lines.forEach((line, index) => rows.push({ case: item.case, ...line, plain: noulOf(record, `plain:${index}`), structured: noulOf(record, `structured:${index}`) }));
    }));
    rows.sort((a, b) => a.case.localeCompare(b.case, undefined, { numeric: true }));

    const binary = (key: string): BinaryRow[] => rows.map((row) => ({ p: row[key], label: row.supported }));
    const catchAt = (key: string, keepSupported: number) => {
      const supported = rows.filter((row) => row.supported).map((row) => row[key]).sort((a, b) => a - b);
      const cut = supported[Math.floor((1 - keepSupported) * supported.length)] ?? 0;
      const unsupported = rows.filter((row) => !row.supported);
      return { cut, caught: unsupported.filter((row) => row[key] < cut).length, total: unsupported.length };
    };
    const kinds = [...new Set(rows.map((row) => row.kind))];

    const bonus: Array<Record<string, any>> = [];
    const shared = ctx.shared.get('extraction.baselineOutputs') as { source: string; outputs: Array<{ caseId: string; story: Record<string, string>; transcript: Message[]; memory: Array<{ text: string }>; facts: Array<{ text: string }> }> } | undefined;
    const outputs = shared?.outputs;
    if (outputs?.length) {
      await Promise.all(outputs.map(async (output) => {
        const lines = [...output.memory.map((item) => item.text), ...output.facts.map((item) => item.text)].filter(Boolean);
        if (!lines.length) return;
        const state = { story: output.story, transcript: output.transcript.map((message) => ({ id: msgId(message.index), speaker: message.speaker, text: message.text })) };
        const questions = Object.fromEntries(lines.map((line, index) => [`v:${index}`, { type: 'noul' as const, instructions: `${VERIFY_PLAIN(line)} Use \`story\` only as background for names and places.`, criteria: VERIFY_CRITERIA }]));
        const record = await systemOne({ state, questions }, { tag: `memory-verify:baseline:${output.caseId}` });
        lines.forEach((line, index) => bonus.push({ caseId: output.caseId, line, p: noulOf(record, `v:${index}`) }));
      }));
    }
    bonus.sort((a, b) => a.p - b.p);
    const s90 = catchAt('structured', 0.9);
    const p90 = catchAt('plain', 0.9);

    return {
      id: this.id,
      title: this.title,
      summary: [
        `${rows.length} candidate memory lines over ${cases.length} windows: ${rows.filter((row) => row.supported).length} supported, ${rows.filter((row) => !row.supported).length} unsupported (fabricated, embellished, wrong actor, inverted, contradicted, lie stated as fact).`,
        `AUROC: question-only ${fixed(auroc(binary('plain')))}, with criteria ${fixed(auroc(binary('structured')))}. Accuracy at 0.5: ${pct(binaryAccuracy(binary('plain')))} / ${pct(binaryAccuracy(binary('structured')))}.`,
        `Keeping 90% of true lines, Jev with criteria drops ${s90.caught}/${s90.total} unsupported lines (cut ${fixed(s90.cut)}); question-only drops ${p90.caught}/${p90.total}.`,
        ...(bonus.length ? [`On the current path's own MEMORY/FACT lines (${shared?.source}): ${bonus.filter((row) => row.p < 0.5).length}/${bonus.length} flagged as unsupported (listed below for a human read).`] : ['Current-model MEMORY/FACT lines were not available (baseline not run), so the live-output check was skipped.']),
      ],
      sections: [
        { title: 'By kind of line', body: table(['kind', 'n', 'supported?', 'mean p (q-only)', 'mean p (criteria)', 'right at 0.5 (criteria)'], kinds.map((kind) => {
          const list = rows.filter((row) => row.kind === kind);
          return [kind, list.length, list[0].supported ? 'yes' : 'no', fixed(list.reduce((sum, row) => sum + row.plain, 0) / list.length), fixed(list.reduce((sum, row) => sum + row.structured, 0) / list.length), `${list.filter((row) => (row.structured >= 0.5) === row.supported).length}/${list.length}`];
        })) },
        { title: 'Every line', body: table(['window', 'line', 'truth', 'kind', 'q-only', 'criteria'], rows.map((row) => [row.case, row.text, row.supported ? 'supported' : 'unsupported', row.kind, fixed(row.plain), fixed(row.structured)])) },
        ...(bonus.length ? [{ title: `Current-path memory lines (${shared?.source}), lowest support first`, body: table(['case', 'line', 'p(supported)'], bonus.slice(0, 25).map((row) => [row.caseId, row.line, fixed(row.p)])) }] : []),
      ],
      data: { rows, bonus },
    };
  },
};
