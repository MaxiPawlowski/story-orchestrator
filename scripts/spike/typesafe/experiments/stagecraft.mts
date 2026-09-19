import { choiceOf, noulOf, systemOne } from '../lib/client.mts';
import { loadData, loadHardCases, msgId, worlds } from '../lib/story.mts';
import { auroc, binaryAccuracy, frac, fixed, pct, table } from '../lib/stats.mts';
import type { Experiment, ExperimentContext } from './types.mts';

interface WiFile {
  entries: Record<string, Array<{ title: string; content: string }>>;
  scenes: Array<{ id: string; world: string; checkpoint: string; case: string; on: string[]; off: string[] }>;
}
interface BgFile { installed: string[]; cases: Array<{ id: string; scene: string; acceptable: string[] }> }

export const wiRelevance: Experiment = {
  id: 'wi-relevance',
  title: 'World Info curator: which lore entries matter right now?',
  async run(ctx: ExperimentContext) {
    const file = loadData<WiFile>('wi-relevance.json');
    const all = worlds();
    const hard = Object.fromEntries(loadHardCases().map((item) => [item.id, item]));
    const rows: Array<Record<string, any>> = [];
    await Promise.all(file.scenes.map(async (scene) => {
      const checkpoint = all[scene.world].checkpoints[scene.checkpoint];
      const entries = file.entries[scene.world].filter((entry) => scene.on.includes(entry.title) || scene.off.includes(entry.title));
      const questions: Record<string, any> = {};
      entries.forEach((entry, index) => {
        questions[`e:${index}`] = {
          type: 'noul',
          instructions: `Should this lore entry be active for the scene in \`scene\` and \`transcript\`? Entry "${entry.title}": ${entry.content}`,
          criteria: { true: 'The entry describes something present, happening, or about to matter in this scene', false: 'The entry is about places, people or things that are not part of this scene' },
        };
      });
      const record = await systemOne({
        state: { scene: { name: checkpoint.name, goal: checkpoint.objective }, transcript: hard[scene.case].transcript.map((message) => ({ id: msgId(message.index), speaker: message.speaker, text: message.text })) },
        questions,
      }, { tag: `wi-relevance:${scene.id}` });
      entries.forEach((entry, index) => rows.push({ scene: scene.id, title: entry.title, label: scene.on.includes(entry.title), p: noulOf(record, `e:${index}`) }));
    }));
    rows.sort((a, b) => `${a.scene}${a.title}`.localeCompare(`${b.scene}${b.title}`));
    const binary = rows.map((row) => ({ p: row.p, label: row.label }));
    return {
      id: this.id,
      title: this.title,
      summary: [
        `${file.scenes.length} scenes x their candidate entries = ${rows.length} on/off judgments. Accuracy at 0.5: ${pct(binaryAccuracy(binary))}, AUROC ${fixed(auroc(binary))}.`,
        'This covers the enable/disable half of the curator only; rewrites and patches need generated text and stay on the LLM.',
      ],
      sections: [{ title: 'Every entry', body: table(['scene', 'entry', 'should be', 'p(active)'], rows.map((row) => [row.scene, row.title, row.label ? 'on' : 'off', `${fixed(row.p)}${(row.p >= 0.5) === row.label ? ' ✓' : ' ✗'}`])) }],
      data: rows,
    };
  },
};

export const backgrounds: Experiment = {
  id: 'backgrounds',
  title: 'Scene-setter: pick an installed background',
  async run(ctx: ExperimentContext) {
    const file = loadData<BgFile>('backgrounds.json');
    const rows: Array<Record<string, any>> = [];
    await Promise.all(file.cases.map(async (entry) => {
      const record = await systemOne({
        state: { scene: entry.scene },
        questions: {
          pick: {
            type: 'choice',
            instructions: 'Which installed background image best fits `scene`? File names describe the picture. Pick "none" if no background fits the setting.',
            criteria: { ...Object.fromEntries(file.installed.map((name) => [name, null])), none: 'No installed background fits this setting' },
          },
        },
      }, { tag: `backgrounds:${entry.id}` });
      const answer = choiceOf(record, 'pick');
      rows.push({ id: entry.id, scene: entry.scene, acceptable: entry.acceptable, pick: answer.choice, confidence: answer.confidence, correct: entry.acceptable.includes(answer.choice) });
    }));
    rows.sort((a, b) => a.id.localeCompare(b.id));
    const n = rows.length;
    return {
      id: this.id,
      title: this.title,
      summary: [
        `${n} scenes, ${file.installed.length} installed backgrounds + "none". Right pick: ${frac(rows.filter((row) => row.correct).length, n)}; including the two scenes with no fitting background: ${rows.filter((row) => row.acceptable.includes('none')).map((row) => `${row.id} → ${row.pick}`).join(', ')}.`,
      ],
      sections: [{ title: 'Every scene', body: table(['case', 'scene', 'acceptable', 'pick', 'confidence'], rows.map((row) => [row.id, row.scene, row.acceptable.join(' | '), `${row.pick}${row.correct ? ' ✓' : ' ✗'}`, fixed(row.confidence)])) }],
      data: rows,
    };
  },
};
