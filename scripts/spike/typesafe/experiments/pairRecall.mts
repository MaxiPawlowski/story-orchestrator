import { loadData } from '../lib/story.mts';
import { buildJaccardMatchSets, DEFAULT_DEDUP_THRESHOLDS, jaccardSimilarity } from '../lib/prod.mts';
import { frac, fixed, table } from '../lib/stats.mts';
import type { Experiment } from './types.mts';

interface PairCase { id: string; label: 'duplicate' | 'update' | 'distinct' | 'unrelated'; type: string; a: string; b: string }

const FLOORS = [0.4, 0.3, 0.25, 0.2, 0.15, 0.1];
const JUDGE_RIGHT_ON = new Set(['M01', 'M02', 'M03', 'M04', 'M05', 'M06', 'M07', 'M09', 'M10', 'M11', 'M12', 'M13', 'M14', 'M15', 'M16', 'M17', 'M18', 'M19', 'M20']);

const entry = (id: string, text: string, type: string, createdAt: number) => ({
  id, tier: 'facts', text, type, importance: 2, expiration: 'permanent', entities: [], confidence: 1, activationTriggers: [], evidence: '', createdAt, recallCount: 0,
});

// v2.2 plan 02 Phase A (Jaccard half): the judge only ever sees the pairs the candidate generator
// surfaces, so its 19/20 is an upper bound. This measures the generator: at each sameTopic floor,
// which non-unrelated pairs become candidates, how many unrelated ones ride along, and the resulting
// end-to-end ceiling (candidate AND judge right on it, using the spike's described-label answers).
export const pairRecall: Experiment = {
  id: 'pair-recall',
  title: 'Consolidation candidate recall (Jaccard fallback) — v2.2 plan 02 Phase A',
  async run() {
    const cases = loadData<PairCase[]>('memory-pairs.json');
    const rows = FLOORS.map((floor) => {
      const thresholds = { ...DEFAULT_DEDUP_THRESHOLDS, jaccardSameTopic: floor };
      const surfaced = cases.map((pair) => {
        const entries = [entry('a', pair.a, pair.type, 1), entry('b', pair.b, pair.type, 2)];
        const matches = buildJaccardMatchSets(entries, thresholds);
        return { pair, candidate: matches.dup[1].has(0) || matches.sameTopic[1].has(0) };
      });
      const related = surfaced.filter((row) => row.pair.label !== 'unrelated');
      const recall = related.filter((row) => row.candidate).length;
      const riders = surfaced.filter((row) => row.pair.label === 'unrelated' && row.candidate).length;
      const ceiling = surfaced.filter((row) => (row.pair.label === 'unrelated' || row.pair.label === 'distinct' ? !row.candidate || JUDGE_RIGHT_ON.has(row.pair.id) : row.candidate && JUDGE_RIGHT_ON.has(row.pair.id))).length;
      const missed = related.filter((row) => !row.candidate).map((row) => `${row.pair.id} (${fixed(jaccardSimilarity(row.pair.a, row.pair.b))})`);
      return { floor, recall, related: related.length, riders, ceiling, total: cases.length, missed };
    });
    return {
      id: this.id,
      title: this.title,
      summary: [
        `${cases.length} labelled pairs; ${rows[0].related} are related (duplicate/update/distinct). Today's sameTopic floor ${DEFAULT_DEDUP_THRESHOLDS.jaccardSameTopic} surfaces ${frac(rows[0].recall, rows[0].related)} of them.`,
        `End-to-end right action (candidate generator × the spike's described-label judge answers; a pair that never becomes a candidate keeps both notes): ${rows.map((row) => `floor ${row.floor} → ${row.ceiling}/${row.total}`).join(', ')}.`,
        'Vector-cosine recall is the other half of Phase A and needs the ST page (/api/vector/*).',
      ],
      sections: [{ title: 'By floor', body: table(['sameTopic floor', 'related pairs surfaced', 'unrelated riders', 'end-to-end right action', 'missed (jaccard)'], rows.map((row) => [row.floor, frac(row.recall, row.related), row.riders, frac(row.ceiling, row.total), row.missed.join(', ') || '—'])) }],
      data: rows,
    };
  },
};
