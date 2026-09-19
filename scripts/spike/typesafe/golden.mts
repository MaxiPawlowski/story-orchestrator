import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { OUT_ROOT, PROJECT_ROOT } from './lib/client.mts';
import { loadData, worlds } from './lib/story.mts';

const USAGE = `Usage: node --experimental-transform-types scripts/spike/typesafe/golden.mts director

Exports real Jev answers from the spike cache as a jest golden for the production judge code.
Only cached answers are used, so nothing is sent to the API. Director answers are remapped from the
spike's question ids (s:who, addr:<name>) to production ids (who, addr:<rosterId>).`;

interface DirectorCase {
  id: string; world: string; checkpoint: string; candidates: string[]; lead?: string; instruction?: string;
  allowSilence?: boolean; window: Array<{ speaker: string; text: string }>; acceptable: string[];
}

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '_');

function cachedBodies() {
  const dir = join(OUT_ROOT, 'cache');
  return readdirSync(dir).map((file) => JSON.parse(readFileSync(join(dir, file), 'utf-8')) as { body: any; response: any });
}

function director() {
  const all = worlds();
  const cases = loadData<DirectorCase[]>('director.json');
  const entries = cachedBodies().filter((entry) => Boolean(entry.body?.questions?.['s:who']) && Boolean(entry.response?.answers?.['s:who']));
  const rows = cases.map((entry) => {
    const world = all[entry.world];
    const checkpoint = world.checkpoints[entry.checkpoint];
    const match = entries.find((cached) => JSON.stringify(cached.body.state.transcript) === JSON.stringify(entry.window) && Object.keys(cached.body.questions).some((key) => key === `addr:${entry.candidates[0]}`));
    if (!match) throw new Error(`no cached director answers for ${entry.id}; run run.mts --only director first`);
    const source = match.response.answers;
    const answers: Record<string, unknown> = { who: source['s:who'], nobody: source.nobody };
    entry.candidates.forEach((name) => {
      answers[`addr:${slug(name)}`] = source[`addr:${name}`];
      answers[`reason:${slug(name)}`] = source[`reason:${name}`];
    });
    return {
      id: entry.id,
      acceptable: entry.acceptable,
      model: match.response.model,
      input: {
        checkpointName: checkpoint.name,
        objective: checkpoint.objective,
        ...(entry.instruction ? { instruction: entry.instruction } : {}),
        player: world.player,
        candidates: entry.candidates.map((name) => ({ rosterId: slug(name), name, role: world.roster.find((member) => member.name === name)?.role })),
        ...(entry.lead ? { lead: entry.lead } : {}),
        allowSilence: entry.allowSilence === true,
        window: entry.window,
      },
      answers,
    };
  });
  const out = join(PROJECT_ROOT, 'test', 'goldens', 'judge');
  mkdirSync(out, { recursive: true });
  const file = join(out, 'director.json');
  writeFileSync(file, `${JSON.stringify({ source: 'spike cache (scripts/spike/typesafe), jev answers remapped to production question ids', recordedAt: new Date().toISOString(), rows }, null, 2)}\n`);
  console.log(`wrote ${rows.length} rows to ${file}`);
}

const [command] = process.argv.slice(2);
if (command === 'director') director();
else console.log(USAGE);
