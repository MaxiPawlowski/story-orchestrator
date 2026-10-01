import { noulOf, systemOne } from '../lib/client.mts';
import { loadData } from '../lib/story.mts';
import { auroc, frac, fixed, table, type BinaryRow } from '../lib/stats.mts';
import type { Experiment } from './types.mts';

interface Entry { id: string; title: string; on: boolean; content: string; attention: boolean; why?: string }
interface StoryCase { id: string; checkpoint: { name: string; objective: string }; canon: string; openThreads: string[]; entries: Entry[] }

const CUTS = [0.2, 0.3, 0.4, 0.5];

export const filterQuestion = (index: number) => `Look at \`entries[${index}]\`. Has the story so far (\`canon\`, \`open_threads\`, \`checkpoint\`) made something in it out of date, or, if it is switched off, made it newly needed?`;

// v2.2 plan 04 Phase A: the WI curator pre-filter. A missed stale entry silently loses the curator's
// only job, so the floor is recall (≥ 0.9) at the chosen cut; precision says how much it narrows.
export const curatorFilter: Experiment = {
  id: 'curator-filter',
  title: 'World Info curator pre-filter — v2.2 plan 04 Phase A',
  async run() {
    const stories = loadData<{ stories: StoryCase[] }>('curator-filter.json').stories;
    const rows: Array<Entry & { story: string; p: number }> = [];
    await Promise.all(stories.map(async (story) => {
      const state = {
        checkpoint: story.checkpoint,
        canon: story.canon,
        open_threads: story.openThreads,
        entries: story.entries.map((entry) => ({ title: entry.title, switched_on: entry.on, content: entry.content })),
      };
      const questions = Object.fromEntries(story.entries.map((_, index) => [`entry:${index}`, { type: 'noul' as const, instructions: filterQuestion(index) }]));
      const record = await systemOne({ state, questions }, { tag: `curator-filter:${story.id}` });
      story.entries.forEach((entry, index) => rows.push({ ...entry, story: story.id, p: noulOf(record, `entry:${index}`) }));
    }));
    rows.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    const binary: BinaryRow[] = rows.map((row) => ({ p: row.p, label: row.attention }));
    const positives = rows.filter((row) => row.attention).length;
    const sweep = CUTS.map((cut) => {
      const kept = rows.filter((row) => row.p >= cut);
      return { cut, recall: kept.filter((row) => row.attention).length, kept: kept.length };
    });
    return {
      id: this.id,
      title: this.title,
      summary: [
        `${rows.length} entries over ${stories.length} stories: ${positives} need attention (stale or newly needed), ${rows.length - positives} fine.`,
        `AUROC ${fixed(auroc(binary))}. Recall floor 0.9: ${sweep.map((row) => `cut ${row.cut} → recall ${frac(row.recall, positives)}, keeps ${row.kept}/${rows.length}`).join('; ')}.`,
      ],
      sections: [{ title: 'Every entry', body: table(['entry', 'story', 'on', 'label', 'p', 'why'], rows.map((row) => [`${row.id} ${row.title}`, row.story, row.on ? 'on' : 'off', row.attention ? 'attention' : 'fine', `${fixed(row.p)}${(row.p >= 0.5) === row.attention ? '' : ' ✗'}`, row.why ?? ''])) }],
      data: { rows, sweep },
    };
  },
};
