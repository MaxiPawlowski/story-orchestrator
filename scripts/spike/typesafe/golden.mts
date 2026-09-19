import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { OUT_ROOT, PROJECT_ROOT } from './lib/client.mts';
import { loadData, worlds } from './lib/story.mts';

const USAGE = `Usage: node --experimental-transform-types scripts/spike/typesafe/golden.mts director|memory

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

function memory() {
  const cached = cachedBodies();
  const pairs = loadData<Array<{ id: string; label: string; a: string; b: string }>>('memory-pairs.json').map((pair) => {
    const match = cached.find((entry) => entry.body?.state?.older_note === pair.a && entry.body?.state?.newer_note === pair.b && entry.response?.answers?.structured);
    if (!match) throw new Error(`no cached pair answers for ${pair.id}; run run.mts --only memory-pairs first`);
    return { id: pair.id, label: pair.label, older: pair.a, newer: pair.b, model: match.response.model, answers: { relation: match.response.answers.structured } };
  });
  const verify = loadData<Array<{ case: string; lines: Array<{ text: string; supported: boolean; kind: string }> }>>('verify-lines.json').flatMap((window) => {
    const match = cached.find((entry) => entry.body?.questions?.['structured:0'] && String(entry.body.questions['structured:0'].instructions).includes(window.lines[0].text) && !entry.body?.state?.story);
    if (!match) throw new Error(`no cached verify answers for ${window.case}; run run.mts --only memory-verify first`);
    return window.lines.map((line, index) => ({ case: window.case, text: line.text, supported: line.supported, kind: line.kind, p: match.response.answers[`structured:${index}`].noul }));
  });
  const out = join(PROJECT_ROOT, 'test', 'goldens', 'judge');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'memory-pairs.json'), `${JSON.stringify({ source: 'spike cache, described-label question (production wording)', recordedAt: new Date().toISOString(), rows: pairs }, null, 2)}
`);
  writeFileSync(join(out, 'memory-verify.json'), `${JSON.stringify({ source: 'spike cache, criteria question WITHOUT the story clause (production adds it; live calibration measures that shape)', recordedAt: new Date().toISOString(), rows: verify }, null, 2)}
`);
  console.log(`wrote ${pairs.length} pair rows and ${verify.length} verify rows`);
}

const [command] = process.argv.slice(2);
if (command === 'director') director();
else if (command === 'memory') memory();
else console.log(USAGE);
