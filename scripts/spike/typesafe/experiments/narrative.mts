import { choiceOf, noulOf, systemOne } from '../lib/client.mts';
import { loadData, msgId, worlds, type Message } from '../lib/story.mts';
import { sharedReadBaseline, worldForSpeakers } from '../lib/sharedRead.mts';
import { applyArcSignals, detectSceneBreakHeuristic, matchArcBridges } from '../lib/prod.mts';
import { auroc, binaryAccuracy, frac, fixed, pct, table, type BinaryRow } from '../lib/stats.mts';
import type { Experiment, ExperimentContext } from './types.mts';

interface SceneCase { id: string; label: boolean; reason?: string; tags: string[]; prev: Array<{ speaker: string; text: string }>; next: { speaker: string; text: string } }
interface ArcCase { id: string; world: string; tags: string[]; openArcs: string[]; transcript: Message[]; resolved: string[] }

const SCENE_PLAIN = 'Does the latest message in `transcript` start a new scene compared with the messages before it?';
const SCENE_STRUCTURED = {
  true: 'The story cuts forward in time, moves to a different place, or passes an explicit scene divider',
  false: 'The same scene continues: someone arrives, characters move around the same place, talk about other times or places, or pause',
};

export const scenes: Experiment = {
  id: 'scenes',
  title: 'Scene-break detection',
  async run(ctx: ExperimentContext) {
    const cases = loadData<SceneCase[]>('scenes.json');
    const rows: Array<Record<string, any>> = [];
    await Promise.all(cases.map(async (entry) => {
      const transcript: Message[] = [...entry.prev, entry.next].map((message, index) => ({ index: index + 1, ...message }));
      const state = { transcript: transcript.map((message) => ({ id: msgId(message.index), speaker: message.speaker, text: message.text })) };
      const record = await systemOne({
        state,
        questions: {
          plain: { type: 'noul', instructions: SCENE_PLAIN },
          structured: { type: 'noul', instructions: SCENE_PLAIN, criteria: SCENE_STRUCTURED },
          reason: { type: 'choice', instructions: 'If the latest message in `transcript` starts a new scene, what kind of break is it?', criteria: { time_skip: 'A jump forward in time', location: 'A move to a different place', divider: 'An explicit divider such as * * * or ---', none: 'No scene break' } },
        },
      }, { tag: `scenes:${entry.id}` });
      const heuristic = detectSceneBreakHeuristic(entry.next.text, false, false);
      const base = await sharedReadBaseline(worldForSpeakers(transcript.map((message) => message.speaker)), transcript, `baseline:scenes:${entry.id}`);
      rows.push({
        id: entry.id, label: entry.label, reason: entry.reason, tags: entry.tags,
        plain: noulOf(record, 'plain'), structured: noulOf(record, 'structured'), jevReason: choiceOf(record, 'reason').choice,
        heuristic: heuristic.hit, heuristicSignals: heuristic.signals.join(','),
        base: base ? Boolean(base.parsed.sceneBreak) : null, baseLine: base ? (base.raw.split('\n').find((line) => /^SCENE_(BREAK|NONE)/i.test(line.trim())) ?? '(no scene line)') : null,
      });
    }));
    rows.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    const n = rows.length;
    const hasBase = rows.some((row) => row.base !== null);
    const acc = (pick: (row: any) => boolean | null) => frac(rows.filter((row) => pick(row) === row.label).length, n);
    const fp = (pick: (row: any) => boolean | null) => `${rows.filter((row) => !row.label && pick(row) === true).length}/${rows.filter((row) => !row.label).length}`;
    const fn = (pick: (row: any) => boolean | null) => `${rows.filter((row) => row.label && pick(row) === false).length}/${rows.filter((row) => row.label).length}`;
    const systems: Array<[string, (row: any) => boolean | null]> = [
      ['regex heuristic (production)', (row) => row.heuristic],
      ['current model SCENE_BREAK line', (row) => row.base],
      ['heuristic OR current model', (row) => (row.base === null ? null : row.heuristic || row.base)],
      ['Jev noul, question only', (row) => row.plain >= 0.5],
      ['Jev noul, with true/false criteria', (row) => row.structured >= 0.5],
    ];
    const plainRows: BinaryRow[] = rows.map((row) => ({ p: row.plain, label: row.label }));
    const structuredRows: BinaryRow[] = rows.map((row) => ({ p: row.structured, label: row.label }));
    const reasonHits = rows.filter((row) => row.label && row.jevReason === row.reason).length;
    return {
      id: this.id,
      title: this.title,
      summary: [
        `${n} cases (${rows.filter((row) => row.label).length} real breaks, ${rows.filter((row) => !row.label).length} traps such as "later that day" in dialogue, someone arriving, or walking to a window).`,
        `Accuracy: heuristic ${acc((row) => row.heuristic)}, Jev question-only ${acc((row) => row.plain >= 0.5)}, Jev with criteria ${acc((row) => row.structured >= 0.5)}${hasBase ? `, current model ${acc((row) => row.base)}` : ''}.`,
        `Jev AUROC: question-only ${fixed(auroc(plainRows))}, with criteria ${fixed(auroc(structuredRows))}. Break type named correctly on ${reasonHits}/${rows.filter((row) => row.label).length} real breaks.`,
      ],
      sections: [
        { title: 'Systems', body: table(['system', 'accuracy', 'false breaks', 'missed breaks'], systems.filter(([name]) => hasBase || !name.includes('current')).map(([name, pick]) => [name, acc(pick), fp(pick), fn(pick)])) },
        { title: 'Every case', body: table(['case', 'truth', 'tags', 'heuristic', 'current', 'Jev q-only', 'Jev criteria', 'Jev type'], rows.map((row) => [row.id, row.label ? `break (${row.reason})` : 'same scene', row.tags.join(','), `${row.heuristic ? 'break' : '-'} ${row.heuristicSignals}`, row.baseLine ?? '-', fixed(row.plain), fixed(row.structured), row.jevReason])) },
      ],
      data: { rows, accuracyAt05: { plain: binaryAccuracy(plainRows), structured: binaryAccuracy(structuredRows) } },
    };
  },
};

export const arcs: Experiment = {
  id: 'arcs',
  title: 'Arc resolution (and the arc_bridges progress bump)',
  async run(ctx: ExperimentContext) {
    const all = worlds();
    const cases = loadData<ArcCase[]>('arcs.json');
    const rows: Array<Record<string, any>> = [];
    await Promise.all(cases.map(async (entry) => {
      const state = { transcript: entry.transcript.map((message) => ({ id: msgId(message.index), speaker: message.speaker, text: message.text })) };
      const questions: Record<string, any> = {};
      entry.openArcs.forEach((arc, index) => {
        questions[`plain:${index}`] = { type: 'noul', instructions: `Does \`transcript\` resolve this open story thread: "${arc}"?` };
        questions[`structured:${index}`] = {
          type: 'noul',
          instructions: `Does \`transcript\` close this open story thread: "${arc}"?`,
          criteria: {
            true: 'The thread is closed: the promise is kept, the mystery is answered, the goal is achieved or becomes impossible, or the conflict ends',
            false: 'The thread is still open: a related clue, partial progress, a restated promise, or the problem getting worse',
          },
        };
      });
      const record = await systemOne({ state, questions }, { tag: `arcs:${entry.id}` });
      const base = await sharedReadBaseline(all[entry.world], entry.transcript, `baseline:arcs:${entry.id}`, entry.openArcs);
      let baseResolved: string[] | null = null;
      let baseLines: string[] = [];
      let bridgeHits = 0;
      if (base) {
        const openEntries = entry.openArcs.map((text, index) => ({ id: `arc${index}`, text, status: 'open' as const, entities: [], openedAt: 0 }));
        const applied = applyArcSignals(openEntries, base.parsed.arcs, { boundary: 1 });
        baseResolved = applied.resolved.map((arc: { text: string }) => arc.text);
        baseLines = base.parsed.arcs.filter((signal: { kind: string }) => signal.kind === 'resolved').map((signal: { text: string }) => signal.text);
        bridgeHits = matchArcBridges([{ arcMatch: "sun's heart", anchor: 'cp-6', amount: 1 }, { arcMatch: 'missing brother', anchor: 'cp-6', amount: 1 }], applied.resolved).size;
      }
      entry.openArcs.forEach((arc, index) => {
        rows.push({
          caseId: entry.id, arc, tags: entry.tags, label: entry.resolved.includes(arc),
          plain: noulOf(record, `plain:${index}`), structured: noulOf(record, `structured:${index}`),
          base: baseResolved ? baseResolved.includes(arc) : null, baseLines: baseLines.join(' | '), bridgeHits,
        });
      });
    }));
    rows.sort((a, b) => a.caseId.localeCompare(b.caseId, undefined, { numeric: true }));
    const n = rows.length;
    const hasBase = rows.some((row) => row.base !== null);
    const acc = (pick: (row: any) => boolean | null) => frac(rows.filter((row) => pick(row) === row.label).length, n);
    const fp = (pick: (row: any) => boolean | null) => `${rows.filter((row) => !row.label && pick(row) === true).length}/${rows.filter((row) => !row.label).length}`;
    const fn = (pick: (row: any) => boolean | null) => `${rows.filter((row) => row.label && pick(row) !== true).length}/${rows.filter((row) => row.label).length}`;
    const systems: Array<[string, (row: any) => boolean | null]> = [
      ['current model [resolved] line + jaccard match', (row) => row.base],
      ['Jev noul per open arc, question only', (row) => row.plain >= 0.5],
      ['Jev noul per open arc, with criteria', (row) => row.structured >= 0.5],
    ];
    return {
      id: this.id,
      title: this.title,
      summary: [
        `${cases.length} windows, ${n} (open arc, window) judgments, ${rows.filter((row) => row.label).length} truly resolved.`,
        `Accuracy: Jev question-only ${acc((row) => row.plain >= 0.5)}, Jev with criteria ${acc((row) => row.structured >= 0.5)}${hasBase ? `, current model ${acc((row) => row.base)}` : ''}.`,
        `Jev AUROC with criteria ${fixed(auroc(rows.map((row) => ({ p: row.structured, label: row.label }))))}. Jev answers per arc id, so an authored bridge keyword never depends on the model's wording.`,
      ],
      sections: [
        { title: 'Systems', body: table(['system', 'accuracy', 'false resolutions', 'missed resolutions'], systems.filter(([name]) => hasBase || !name.includes('current')).map(([name, pick]) => [name, acc(pick), fp(pick), fn(pick)])) },
        { title: 'Every judgment', body: table(['case', 'arc', 'truth', 'Jev q-only', 'Jev criteria', 'current', 'current [resolved] lines'], rows.map((row) => [row.caseId, row.arc, row.label ? 'resolved' : 'open', fixed(row.plain), fixed(row.structured), row.base === null ? '-' : row.base ? 'resolved' : 'open', row.baseLines || '-'])) },
      ],
      data: rows,
    };
  },
};
