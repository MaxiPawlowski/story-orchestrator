import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { choiceOf, noulOf, PROJECT_ROOT, scoreOf, systemOne, type ChoiceAnswer, type Question } from '../lib/client.mts';
import { findNumbers, findStringCandidates } from '../lib/numbers.mts';
import { expectedFinal, loadFixtureCases, loadHardCases, msgId, transcriptState, valueMatches, type ExtractionCase, type Primitive, type QualityDef } from '../lib/story.mts';
import { tryBaseline } from '../lib/baseline.mts';
import { buildFixtureRun, parseSharedReadResponse, stripReasoningBlocks } from '../lib/prod.mts';
import { auroc, binaryAccuracy, brier, coverageSweep, frac, ms, pct, fixed, reliability, table, mean, type BinaryRow, type ConfidenceRow } from '../lib/stats.mts';
import type { Experiment, ExperimentContext } from './types.mts';

export const TENSION_LEVELS = ['calm', 'stirring', 'tense', 'critical', 'peak'];
export const TENSION_SCALE = [
  'safety, rest, or routine; no active threat',
  'unease, foreshadowing, or first signs of trouble',
  'open conflict, danger, or pressure in the current scene',
  'high stakes in motion: violence, chase, ultimatum, imminent loss',
  'climactic confrontation or catastrophe at full intensity',
];

const JUDGE = 'Judge only from what `transcript` shows.';
const NOT_SHOWN = 'not shown';

type Variant = 'plain' | 'structured';

interface Plan {
  questions: Record<string, Question>;
  decode: Array<{ key: string; variant: Variant; read: (answers: AnswerReader) => { value: Primitive | undefined; confidence: number; raw: string } }>;
  leafRows: Array<{ id: string; key: string; value: Primitive; label: boolean }>;
  evidenceIds: Record<string, string>;
}

interface AnswerReader {
  choice: (id: string) => ChoiceAnswer;
  noul: (id: string) => number;
  score: (id: string) => { score: number; confidence: number };
}

const rangeLabels = (rubric: string) => {
  const match = rubric.match(/from\s+(\d+)\s*\(([^)]+)\)\s*to\s+(\d+)\s*\(([^)]+)\)/i);
  return match ? { min: Number(match[1]), low: match[2], max: Number(match[3]), high: match[4] } : null;
};

function plainLevels(quality: QualityDef): string[] | null {
  const range = rangeLabels(quality.rubric);
  const min = range?.min ?? quality.min ?? 0;
  const max = range?.max ?? quality.max;
  if (max === undefined || max - min + 1 > 10 || max - min < 1) return null;
  return Array.from({ length: max - min + 1 }, (_, index) => {
    const level = min + index;
    if (range && level === min) return `${level}: ${range.low}`;
    if (range && level === max) return `${level}: ${range.high}`;
    return String(level);
  });
}

const boolCriteria: Record<string, string> = {
  yes: 'The transcript shows the answer is yes',
  no: 'The transcript shows the answer is no',
  [NOT_SHOWN]: 'The transcript does not settle the question',
};

function mapChoice(quality: QualityDef, answer: ChoiceAnswer): Primitive | undefined {
  if (answer.choice === NOT_SHOWN) return undefined;
  if (quality.type === 'bool') return answer.choice === 'yes';
  return answer.choice;
}

function planCase(entry: ExtractionCase): Plan {
  const questions: Record<string, Question> = {};
  const decode: Plan['decode'] = [];
  const leafRows: Plan['leafRows'] = [];
  const evidenceIds: Record<string, string> = {};
  const messages = entry.transcript.map((message) => ({ id: msgId(message.index), text: message.text }));

  for (const key of entry.ask) {
    const quality = entry.qualities[key];
    const structured = quality.structured;

    if (quality.type === 'bool' || quality.type === 'enum') {
      const plainCriteria = quality.type === 'bool'
        ? boolCriteria
        : { ...Object.fromEntries((quality.values ?? []).map((value) => [value, null])), [NOT_SHOWN]: 'The transcript does not settle this' };
      questions[`p:${key}`] = { type: 'choice', instructions: `${quality.rubric}\n${JUDGE}`, criteria: plainCriteria };
      decode.push({ key, variant: 'plain', read: (a) => { const answer = a.choice(`p:${key}`); return { value: mapChoice(quality, answer), confidence: answer.confidence, raw: answer.choice }; } });
      if (structured?.criteria) {
        questions[`s:${key}`] = { type: 'choice', instructions: `${structured.instructions ?? quality.rubric}\n${JUDGE}`, criteria: structured.criteria };
        decode.push({ key, variant: 'structured', read: (a) => { const answer = a.choice(`s:${key}`); return { value: mapChoice(quality, answer), confidence: answer.confidence, raw: answer.choice }; } });
      }
      const leafValues: Primitive[] = quality.type === 'bool' ? [true] : (quality.values ?? []);
      for (const value of leafValues) {
        const id = `leaf:${key}:${String(value)}`;
        const statement = quality.type === 'bool' ? `${quality.rubric} Answer yes only if the transcript shows that it is true.` : `${quality.rubric} Is the answer "${value}"?`;
        questions[id] = { type: 'noul', instructions: `Considering all of \`transcript\`, not only the last message: ${statement}` };
        const acceptable = expectedFinal(quality, entry.expected[key], entry.prior[key]);
        const label = quality.type === 'bool' ? valueMatches(quality, true, acceptable) : Boolean(acceptable?.some((item) => item === value));
        leafRows.push({ id, key, value, label });
      }
    } else if (quality.jev === 'score') {
      const plain = plainLevels(quality);
      const offset = rangeLabels(quality.rubric)?.min ?? quality.min ?? 0;
      questions[`presence:${key}`] = { type: 'noul', instructions: `Does \`transcript\` show anything that reveals or changes the answer to this question: ${quality.rubric}` };
      if (plain) {
        questions[`p:${key}`] = { type: 'score', instructions: `${quality.rubric}\n${JUDGE}`, criteria: plain };
        decode.push({ key, variant: 'plain', read: (a) => {
          const present = a.noul(`presence:${key}`);
          const score = a.score(`p:${key}`);
          return { value: present < 0.5 ? undefined : offset + Math.round(score.score), confidence: Math.min(score.confidence, Math.abs(present - 0.5) * 2), raw: `${fixed(score.score)} presence ${fixed(present)}` };
        } });
      }
      if (structured?.levels) {
        questions[`s:${key}`] = { type: 'score', instructions: `${quality.rubric}\n${JUDGE}`, criteria: structured.levels };
        decode.push({ key, variant: 'structured', read: (a) => {
          const present = a.noul(`presence:${key}`);
          const score = a.score(`s:${key}`);
          return { value: present < 0.5 ? undefined : offset + Math.round(score.score), confidence: Math.min(score.confidence, Math.abs(present - 0.5) * 2), raw: `${fixed(score.score)} presence ${fixed(present)}` };
        } });
      }
    } else {
      const numeric = quality.type === 'int' || quality.type === 'float';
      const found = numeric
        ? findNumbers(messages).map((mention) => ({ label: `"${mention.raw}" in ${mention.messageId}`, snippet: mention.snippet, value: mention.value as Primitive }))
        : findStringCandidates(messages).map((candidate) => ({ label: `"${candidate.raw}" in ${candidate.messageId}`, snippet: candidate.snippet, value: candidate.raw as Primitive }));
      const options = new Map<string, { snippet: string; value: Primitive }>();
      for (const item of found.slice(0, 250)) {
        let label = item.label;
        for (let n = 2; options.has(label); n += 1) label = `${item.label} #${n}`;
        options.set(label, { snippet: item.snippet, value: item.value });
      }
      if (!options.size) {
        decode.push({ key, variant: 'plain', read: () => ({ value: undefined, confidence: 1, raw: 'no candidates: decided in code' }) });
        continue;
      }
      const noneText = numeric ? 'No number in the transcript gives this value' : 'No span in the transcript gives this value';
      questions[`p:${key}`] = {
        type: 'choice',
        instructions: `${quality.rubric}\nWhich ${numeric ? 'number mention' : 'span'} in \`transcript\` gives this value as it stands at the end of the transcript? Pick "none" if no mention gives it.`,
        criteria: { ...Object.fromEntries([...options].map(([label, item]) => [label, item.snippet])), none: noneText },
      };
      decode.push({ key, variant: 'plain', read: (a) => {
        const answer = a.choice(`p:${key}`);
        return { value: answer.choice === 'none' ? undefined : options.get(answer.choice)?.value, confidence: answer.confidence, raw: answer.choice };
      } });
    }

    if (entry.transcript.length >= 2) {
      const id = `evidence:${key}`;
      evidenceIds[key] = id;
      questions[id] = {
        type: 'choice',
        instructions: `Which message in \`transcript\` shows the answer to this question: ${quality.rubric}`,
        criteria: Object.fromEntries(entry.transcript.map((message) => [msgId(message.index), null])),
      };
    }
  }

  questions.tension = {
    type: 'score',
    instructions: 'Rate the current tension of the scene in `transcript`: pick the highest level whose description is met, not the average mood.',
    criteria: TENSION_SCALE,
  };
  return { questions, decode, leafRows, evidenceIds };
}

interface Row {
  caseId: string;
  source: string;
  key: string;
  type: string;
  tags: string[];
  prior: Primitive | undefined;
  acceptable: Primitive[] | undefined;
  expectedChange: boolean;
  plain?: { value: Primitive | undefined; confidence: number; raw: string; correct: boolean };
  structured?: { value: Primitive | undefined; confidence: number; raw: string; correct: boolean };
  baseline?: { value: Primitive | undefined; correct: boolean; emitted: boolean };
  recorded?: { value: Primitive | undefined; correct: boolean; emitted: boolean };
}

const show = (value: unknown) => (value === undefined ? '-' : JSON.stringify(value));

export const extraction: Experiment = {
  id: 'extraction',
  title: 'Shared-read extraction: typed deltas, tension, evidence, gate leaves',
  async run(ctx: ExperimentContext) {
    const cases = [...loadFixtureCases(), ...loadHardCases()];
    const rows: Row[] = [];
    const tensionRows: Array<{ caseId: string; acceptable: string[]; jevLevel: string; jevScore: number; jevConfidence: number; baseLevel: string | null }> = [];
    const evidenceRows: Array<{ caseId: string; key: string; acceptable: string[]; picked: string; confidence: number; correct: boolean }> = [];
    const leafRows: Array<BinaryRow & { caseId: string; id: string }> = [];
    const baselineOutputs: Array<{ caseId: string; story: Record<string, string>; transcript: ExtractionCase['transcript']; memory: unknown[]; facts: unknown[]; raw: string }> = [];
    const recordedOutputs: typeof baselineOutputs = [];
    const latencies: number[] = [];
    const questionCounts: number[] = [];
    const promptChars: number[] = [];
    let scopeMismatches = 0;

    await Promise.all(cases.map(async (entry) => {
      const plan = planCase(entry);
      const state = transcriptState({ story: { title: entry.title, current_scene: entry.checkpoint.name, scene_goal: entry.checkpoint.objective } }, entry.transcript);
      const record = await systemOne({ state, questions: plan.questions }, { tag: `extraction:${entry.id}` });
      latencies.push(record.latencyMs);
      questionCounts.push(Object.keys(plan.questions).length);
      const reader: AnswerReader = {
        choice: (id) => choiceOf(record, id),
        noul: (id) => noulOf(record, id),
        score: (id) => { const answer = scoreOf(record, id); return { score: answer.score, confidence: answer.confidence }; },
      };

      const run = buildFixtureRun({
        story: entry.story,
        transcript: entry.transcript,
        activeCheckpointId: entry.checkpoint.id,
        blackboard: { values: entry.prior, versions: {}, latched: {} },
      });
      const scopeKeys = new Set(run.scope.map((item: { key: string }) => item.key));
      if (entry.ask.some((key) => !scopeKeys.has(key))) {
        scopeMismatches += 1;
        ctx.log(`  scope mismatch ${entry.id}: asked ${entry.ask.join(',')} vs prod scope ${[...scopeKeys].join(',')}`);
      }
      promptChars.push(run.prompt.length);
      const base = await tryBaseline(run.prompt, 512, `baseline:extraction:${entry.id}`);
      let baseValues: Record<string, Primitive> | null = null;
      let baseTension: string | null = null;
      if (base) {
        const raw = stripReasoningBlocks(base.raw);
        const parsed = parseSharedReadResponse(raw, run.story);
        baseValues = {};
        for (const delta of parsed.deltas) {
          if (delta.delta.q === 'tension_current') baseTension = delta.rawLevel ?? TENSION_LEVELS[Math.round(Number(delta.delta.v) * 4)] ?? null;
          else baseValues[delta.delta.q] = delta.delta.v as Primitive;
        }
        baselineOutputs.push({ caseId: entry.id, story: { title: entry.title, current_scene: entry.checkpoint.name, scene_goal: entry.checkpoint.objective }, transcript: entry.transcript, memory: parsed.memory, facts: parsed.facts, raw });
      }
      let recordedValues: Record<string, Primitive> | null = null;
      const goldenPath = join(PROJECT_ROOT, 'test', 'goldens', 'live', `${entry.id}.response.txt`);
      if (entry.source === 'fixture' && existsSync(goldenPath)) {
        const raw = stripReasoningBlocks(readFileSync(goldenPath, 'utf-8'));
        const parsed = parseSharedReadResponse(raw, run.story);
        recordedValues = {};
        for (const delta of parsed.deltas) if (delta.delta.q !== 'tension_current') recordedValues[delta.delta.q] = delta.delta.v as Primitive;
        recordedOutputs.push({ caseId: entry.id, story: { title: entry.title, current_scene: entry.checkpoint.name, scene_goal: entry.checkpoint.objective }, transcript: entry.transcript, memory: parsed.memory, facts: parsed.facts, raw });
      }

      for (const key of entry.ask) {
        const quality = entry.qualities[key];
        const prior = entry.prior[key];
        const acceptable = expectedFinal(quality, entry.expected[key], prior);
        const expectedChange = !valueMatches(quality, prior, acceptable);
        const row: Row = { caseId: entry.id, source: entry.source, key, type: quality.type + (quality.jev === 'score' ? '/rating' : quality.type === 'int' || quality.type === 'float' ? '/stated' : ''), tags: entry.tags, prior, acceptable, expectedChange };
        for (const item of plan.decode.filter((decoder) => decoder.key === key)) {
          const read = item.read(reader);
          const value = read.value === undefined ? prior : read.value;
          row[item.variant] = { value, confidence: read.confidence, raw: read.raw, correct: valueMatches(quality, value, acceptable) };
        }
        if (baseValues) {
          const emitted = Object.prototype.hasOwnProperty.call(baseValues, key);
          const value = emitted ? baseValues[key] : prior;
          row.baseline = { value, correct: valueMatches(quality, value, acceptable), emitted };
        }
        if (recordedValues) {
          const emitted = Object.prototype.hasOwnProperty.call(recordedValues, key);
          const value = emitted ? recordedValues[key] : prior;
          row.recorded = { value, correct: valueMatches(quality, value, acceptable), emitted };
        }
        rows.push(row);

        const evidenceId = plan.evidenceIds[key];
        const labelled = entry.evidence[key];
        if (evidenceId && labelled?.length) {
          const answer = choiceOf(record, evidenceId);
          const acceptableIds = labelled.map(msgId);
          evidenceRows.push({ caseId: entry.id, key, acceptable: acceptableIds, picked: answer.choice, confidence: answer.confidence, correct: acceptableIds.includes(answer.choice) });
        }
      }

      for (const leaf of plan.leafRows) leafRows.push({ caseId: entry.id, id: leaf.id, p: noulOf(record, leaf.id), label: leaf.label });

      if (entry.tension) {
        const tension = scoreOf(record, 'tension');
        tensionRows.push({ caseId: entry.id, acceptable: entry.tension, jevLevel: TENSION_LEVELS[Math.round(tension.score)], jevScore: tension.score, jevConfidence: tension.confidence, baseLevel: base ? baseTension : null });
      }
    }));

    rows.sort((a, b) => a.caseId.localeCompare(b.caseId, undefined, { numeric: true }));
    const hasBaseline = rows.some((row) => row.baseline);
    const acc = (list: Row[], pick: (row: Row) => { correct: boolean } | undefined) => {
      const scored = list.filter((row) => pick(row));
      return frac(scored.filter((row) => pick(row)?.correct).length, scored.length);
    };
    const slices: Array<[string, (row: Row) => boolean]> = [
      ['all', () => true],
      ['fixtures (22 live-suite cases)', (row) => row.source === 'fixture'],
      ['hard set', (row) => row.source === 'hard'],
      ['bool', (row) => row.type === 'bool'],
      ['enum', (row) => row.type === 'enum'],
      ['number stated in text', (row) => row.type.endsWith('/stated')],
      ['rating (no number in text)', (row) => row.type.endsWith('/rating')],
      ['string', (row) => row.type === 'string'],
      ['expected a change', (row) => row.expectedChange],
      ['expected no change', (row) => !row.expectedChange],
    ];
    const sliceTable = table(
      ['slice', 'n', 'Jev plain', 'Jev structured', hasBaseline ? 'current model (live)' : 'current model live (not run)', 'current path, recorded Gemma 4 goldens (fixtures only)'],
      slices.map(([name, filter]) => {
        const list = rows.filter(filter);
        return [name, list.length, acc(list, (row) => row.plain), acc(list, (row) => row.structured), hasBaseline ? acc(list, (row) => row.baseline) : '-', acc(list, (row) => row.recorded)];
      }),
    );
    const tags = [...new Set(rows.flatMap((row) => row.tags))].filter((tag) => tag !== 'fixture').sort();
    const tagTable = table(
      ['trap', 'n', 'Jev plain', 'Jev structured', 'current model'],
      tags.map((tag) => {
        const list = rows.filter((row) => row.tags.includes(tag));
        return [tag, list.length, acc(list, (row) => row.plain), acc(list, (row) => row.structured), hasBaseline ? acc(list, (row) => row.baseline) : '-'];
      }),
    );
    const falseChange = (pick: (row: Row) => { value: Primitive | undefined } | undefined) => {
      const list = rows.filter((row) => !row.expectedChange && pick(row));
      return frac(list.filter((row) => !valueMatches({ type: row.type.split('/')[0] as QualityDef['type'], rubric: '' }, pick(row)?.value, row.prior === undefined ? undefined : [row.prior])).length, list.length);
    };
    const missedChange = (pick: (row: Row) => { correct: boolean } | undefined) => {
      const list = rows.filter((row) => row.expectedChange && pick(row));
      return frac(list.filter((row) => !pick(row)?.correct).length, list.length);
    };
    const caseExact = (pick: (row: Row) => { correct: boolean } | undefined, source?: string) => {
      const ids = [...new Set(rows.filter((row) => !source || row.source === source).map((row) => row.caseId))];
      const ok = ids.filter((id) => rows.filter((row) => row.caseId === id).every((row) => pick(row)?.correct ?? false));
      return frac(ok.length, ids.length);
    };
    const confidenceRows = (variant: Variant): ConfidenceRow[] => rows.filter((row) => row[variant]).map((row) => ({ confidence: row[variant]!.confidence, correct: row[variant]!.correct }));
    const sweep = (variant: Variant) => coverageSweep(confidenceRows(variant));
    const sweepTable = table(
      ['confidence floor', 'plain: acted on', 'plain: accuracy when acting', 'structured: acted on', 'structured: accuracy when acting'],
      sweep('plain').map((item, index) => {
        const other = sweep('structured')[index];
        return [item.threshold, `${pct(item.coverage)} (${item.kept})`, pct(item.accuracy), `${pct(other.coverage)} (${other.kept})`, pct(other.accuracy)];
      }),
    );

    const tensionTable = (() => {
      const within = (level: string | null, acceptable: string[]) => level !== null && acceptable.some((item) => Math.abs(TENSION_LEVELS.indexOf(item) - TENSION_LEVELS.indexOf(level)) <= 1);
      const exact = (level: string | null, acceptable: string[]) => level !== null && acceptable.includes(level);
      const n = tensionRows.length;
      const based = tensionRows.filter((row) => row.baseLevel !== null || hasBaseline);
      return table(['system', 'n', 'level in acceptable set', 'within one level', 'no tension emitted'], [
        ['Jev score', n, frac(tensionRows.filter((row) => exact(row.jevLevel, row.acceptable)).length, n), frac(tensionRows.filter((row) => within(row.jevLevel, row.acceptable)).length, n), '0'],
        ['current model', hasBaseline ? based.length : '-', hasBaseline ? frac(based.filter((row) => exact(row.baseLevel, row.acceptable)).length, based.length) : '-', hasBaseline ? frac(based.filter((row) => within(row.baseLevel, row.acceptable)).length, based.length) : '-', hasBaseline ? String(based.filter((row) => row.baseLevel === null).length) : '-'],
      ]);
    })();

    const leafCalibration = reliability(leafRows);
    const leafTable = table(['p(yes) bucket', 'n', 'mean p', 'observed yes rate'], leafCalibration.buckets.map((bucket) => [`${fixed(bucket.from, 1)}-${fixed(bucket.to, 1)}`, bucket.count, fixed(bucket.meanPredicted), pct(bucket.observed)]));

    const failures = rows.filter((row) => (row.plain && !row.plain.correct) || (row.structured && !row.structured.correct) || (row.baseline && !row.baseline.correct) || (row.recorded && !row.recorded.correct));
    const failureTable = table(
      ['case', 'quality', 'tags', 'expected', 'plain', 'structured', 'current (live)', 'current (recorded)'],
      failures.map((row) => [
        row.caseId, row.key, row.tags.join(','), row.acceptable ? row.acceptable.map((item) => JSON.stringify(item)).join('|') : 'unchanged',
        row.plain ? `${show(row.plain.value)}${row.plain.correct ? ' ✓' : ' ✗'} (${fixed(row.plain.confidence)})` : '-',
        row.structured ? `${show(row.structured.value)}${row.structured.correct ? ' ✓' : ' ✗'} (${fixed(row.structured.confidence)})` : '-',
        row.baseline ? `${show(row.baseline.value)}${row.baseline.correct ? ' ✓' : ' ✗'}` : '-',
        row.recorded ? `${show(row.recorded.value)}${row.recorded.correct ? ' ✓' : ' ✗'}` : '-',
      ]),
    );

    ctx.shared.set('extraction.baselineOutputs', baselineOutputs.length ? { source: 'live current model', outputs: baselineOutputs } : { source: 'recorded Gemma 4 live-suite goldens (2026-07)', outputs: recordedOutputs });
    ctx.shared.set('extraction.latencies', latencies);
    ctx.shared.set('extraction.promptChars', promptChars);

    return {
      id: this.id,
      title: this.title,
      summary: [
        `${cases.length} cases (${cases.filter((c) => c.source === 'fixture').length} live-suite fixtures + ${cases.filter((c) => c.source === 'hard').length} hard), ${rows.length} quality judgments, one Jev call per case with ${fixed(mean(questionCounts), 1)} questions on average.`,
        `Per-quality accuracy: Jev plain ${acc(rows, (row) => row.plain)}, Jev structured ${acc(rows, (row) => row.structured)}${hasBaseline ? `, current model ${acc(rows, (row) => row.baseline)}` : ''}.`,
        `Whole-case exact on the live-suite fixtures that carry a quality (extractor16 is tension-only): Jev plain ${caseExact((row) => row.plain, 'fixture')}, recorded Gemma 4 goldens ${caseExact((row) => row.recorded, 'fixture')}${hasBaseline ? `, current model ${caseExact((row) => row.baseline, 'fixture')}` : ''}.`,
        `Spurious change where none was expected: Jev plain ${falseChange((row) => row.plain)}${hasBaseline ? `, current model ${falseChange((row) => row.baseline)}` : ''}. Missed an expected change: Jev plain ${missedChange((row) => row.plain)}${hasBaseline ? `, current model ${missedChange((row) => row.baseline)}` : ''}.`,
        `Gate-leaf yes/no questions (the reconcile shape): AUROC ${fixed(auroc(leafRows))}, accuracy at 0.5 ${pct(binaryAccuracy(leafRows))}, Brier ${fixed(brier(leafRows), 3)}, ECE ${fixed(leafCalibration.ece, 3)} over ${leafRows.length} questions.`,
        `Evidence message picked correctly: ${frac(evidenceRows.filter((row) => row.correct).length, evidenceRows.length)}.`,
        `Jev call latency p50 ${ms(latencies.sort((a, b) => a - b)[Math.floor(latencies.length / 2)])}.${scopeMismatches ? ` ${scopeMismatches} case(s) where production scope differed from the asked set.` : ''}`,
      ],
      sections: [
        { title: 'Accuracy by slice', body: sliceTable },
        { title: 'Accuracy by trap', body: tagTable },
        { title: 'Confidence as an abstain signal (below the floor, keep the prior value)', body: sweepTable },
        { title: 'Tension', body: tensionTable },
        { title: 'Gate-leaf noul calibration', body: leafTable },
        { title: 'Evidence localisation', body: table(['case', 'quality', 'labelled', 'picked', 'confidence'], evidenceRows.map((row) => [row.caseId, row.key, row.acceptable.join('|'), `${row.picked}${row.correct ? ' ✓' : ' ✗'}`, fixed(row.confidence)])) },
        { title: 'Every judgment any system got wrong', body: failureTable },
      ],
      data: { rows, tensionRows, evidenceRows, leafRows },
    };
  },
};
