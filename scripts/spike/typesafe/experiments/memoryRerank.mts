import { noulOf, systemOne } from '../lib/client.mts';
import { loadData, msgId } from '../lib/story.mts';
import { scoreEntry } from '../lib/prod.mts';
import { frac, table } from '../lib/stats.mts';
import type { Experiment } from './types.mts';

interface Note { id: string; text: string; type: string; importance: number; createdAt: number; entities: string[] }
interface Window { id: string; world: string; boundary: number; lang: string; openArcs: string[]; transcript: Array<{ speaker: string; text: string }>; needed: string[] }
interface RerankData { budget: number; pools: Record<string, Note[]>; windows: Window[] }

const JUDGE_WEIGHT = 2;

const toEntry = (note: Note) => ({
  id: note.id, tier: 'facts', text: note.text, type: note.type, importance: note.importance, expiration: 'permanent',
  entities: note.entities, confidence: 1, activationTriggers: [], evidence: '', createdAt: note.createdAt, recallCount: 0,
});

// v2.2 plan 04 Phase A: does a judge relevance term improve which memory makes the injection budget?
// Build only if recall@budget improves by >= 10 points over today's static scoreEntry ranking.
export const memoryRerank: Experiment = {
  id: 'memory-rerank',
  title: 'Memory injection re-rank (recall@budget) — v2.2 plan 04 Phase A',
  async run() {
    const data = loadData<RerankData>('memory-rerank.json');
    const rows = await Promise.all(data.windows.map(async (window) => {
      const pool = data.pools[window.world];
      const turnText = window.transcript.map((line) => line.text).join('\n');
      const turnEntities = pool.flatMap((note) => note.entities).filter((entity) => turnText.toLowerCase().includes(entity.toLowerCase()));
      const context = { boundary: window.boundary, turnText, turnEntities: [...new Set(turnEntities)], openArcs: window.openArcs };
      const staticScores = pool.map((note) => ({ note, score: scoreEntry(toEntry(note) as any, context) }));
      const state = { transcript: window.transcript.map((line, index) => ({ id: msgId(index + 1), speaker: line.speaker, text: line.text })), notes: pool.map((note) => note.text) };
      const questions = Object.fromEntries(pool.map((_, index) => [`note:${index}`, { type: 'noul' as const, instructions: `Does \`notes[${index}]\` matter for the next reply, given \`transcript\`?` }]));
      const record = await systemOne({ state, questions }, { tag: `memory-rerank:${window.id}` });
      const judged = staticScores.map((item, index) => ({ ...item, p: noulOf(record, `note:${index}`) }));
      const top = (key: (item: typeof judged[number]) => number) => [...judged].sort((a, b) => key(b) - key(a)).slice(0, data.budget).map((item) => item.note.id);
      const staticTop = top((item) => item.score);
      const blendedTop = top((item) => item.score + JUDGE_WEIGHT * item.p);
      const judgeTop = top((item) => item.p);
      const recall = (ids: string[]) => window.needed.filter((id) => ids.includes(id)).length;
      return { id: window.id, lang: window.lang, needed: window.needed, staticTop, blendedTop, judgeTop, staticRecall: recall(staticTop), blendedRecall: recall(blendedTop), judgeRecall: recall(judgeTop) };
    }));
    rows.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    const needed = rows.reduce((sum, row) => sum + row.needed.length, 0);
    const sum = (key: 'staticRecall' | 'blendedRecall' | 'judgeRecall') => rows.reduce((total, row) => total + row[key], 0);
    const gain = (sum('blendedRecall') - sum('staticRecall')) / needed;
    return {
      id: this.id,
      title: this.title,
      summary: [
        `${rows.length} turns, ${needed} needed notes, budget top-${data.budget} of 18-20. Recall@budget: static ${frac(sum('staticRecall'), needed)}, static + ${JUDGE_WEIGHT}×judge ${frac(sum('blendedRecall'), needed)}, judge alone ${frac(sum('judgeRecall'), needed)}.`,
        `Gain of the blend over static: ${(gain * 100).toFixed(0)} points (build only if ≥ 10).`,
      ],
      sections: [{ title: 'Every turn', body: table(['turn', 'needed', 'static top', 'blend top', 'recall static / blend / judge'], rows.map((row) => [`${row.id}${row.lang === 'es' ? ' es' : ''}`, row.needed.join(' '), row.staticTop.join(' '), row.blendedTop.join(' '), `${row.staticRecall} / ${row.blendedRecall} / ${row.judgeRecall} of ${row.needed.length}`])) }],
      data: rows,
    };
  },
};
