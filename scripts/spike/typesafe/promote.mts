import { register } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_ROOT } from './lib/client.mts';
import { loadData, worlds, type WorldDef } from './lib/story.mts';

register('./lib/loader.mts', import.meta.url);
const { worldForSpeakers } = await import('./lib/sharedRead.mts');

const USAGE = `Usage: node --no-warnings --experimental-transform-types scripts/spike/typesafe/promote.mts scene|scene-holdout

Promotes Phase A spike data to a production calibration fixture in test/fixtures/judge/. The rows
carry the production input (src/judge SceneReadInput) plus the labels written before any answer
was read, so calibrate-node and so-judge run exactly what the runtime sends.`;

interface Line { speaker: string; text: string }
interface Window { id: string; world: string; checkpoint: string; tags: string[]; transcript: Line[]; labels: { present: Record<string, boolean>; location: string; time: string }; reachable: Array<{ name: string; objective: string; heading: boolean }> }
interface SceneCase { id: string; label: boolean; reason?: string; tags?: string[]; prev: Line[]; next: Line }

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const cast = (world: WorldDef) => world.roster.map((member) => ({ rosterId: slug(member.name), name: member.name, role: member.role }));
const all = { sceneBreak: true, tracker: true, lookahead: true };

function input(world: WorldDef, checkpointId: string, locations: string[], transcript: Line[], reachable: Array<{ name: string; objective: string }>, families = all) {
  const checkpoint = world.checkpoints[checkpointId] ?? Object.values(world.checkpoints)[0];
  return {
    storyTitle: world.title,
    checkpointName: checkpoint.name,
    objective: checkpoint.objective,
    cast: cast(world),
    player: world.player,
    locations,
    reachable: reachable.map((entry, index) => ({ id: `r${index + 1}`, name: entry.name, objective: entry.objective })),
    window: transcript,
    families,
  };
}

function scene(holdout = false) {
  const data = loadData<{ vocab: Record<string, string[]>; physical: Record<string, string[]>; windows: Window[] }>('scene-read.json');
  const known = worlds();
  const windows = data.windows.map((window) => {
    const world = known[window.world];
    return {
      id: window.id,
      kind: 'window',
      lang: window.tags.includes('spanish') ? 'es' : 'en',
      input: input(world, window.checkpoint, data.vocab[window.world], window.transcript, window.reachable),
      labels: {
        present: Object.fromEntries(Object.entries(window.labels.present).map(([name, value]) => [slug(name), value])),
        location: window.labels.location,
        time: window.labels.time,
        heading: Object.fromEntries(window.reachable.map((entry, index) => [`r${index + 1}`, entry.heading])),
      },
    };
  });
  const breaks = loadData<SceneCase[]>(holdout ? 'scenes-holdout.json' : 'scenes.json').flatMap((entry) => {
    const transcript = [...entry.prev, entry.next];
    const world = worldForSpeakers(transcript.map((line) => line.speaker));
    const lang = entry.tags?.includes('spanish') ? 'es' : 'en';
    return [
      { id: entry.id, kind: 'break', lang, input: input(world, Object.keys(world.checkpoints)[0], data.vocab[world.id] ?? [], transcript, []), labels: { sceneBreak: entry.label } },
      { id: `${entry.id}t`, kind: 'break', lang, input: input(world, Object.keys(world.checkpoints)[0], [], transcript, [], { sceneBreak: true, tracker: false, lookahead: false }), labels: { sceneBreak: entry.label } },
    ];
  });
  const out = join(PROJECT_ROOT, 'test', 'fixtures', 'judge');
  mkdirSync(out, { recursive: true });
  if (holdout) {
    writeFileSync(join(out, 'scene-holdout.json'), `${JSON.stringify({ use: 'scene', floors: { break: 0.5, nobreak: 1 }, labelledAt: '2026-09-19', source: 'Held out: scripts/spike/typesafe/data/scenes-holdout.json, written and labelled after S08 missed at 0.49 and before SCENE_TRIGGER 0.4 was scored on anything; each case full state and trigger-only (`<id>t`).', rows: breaks }, null, 2)}
`);
    console.log(`${breaks.length} held-out break rows`);
    return;
  }
  writeFileSync(join(out, 'scene.json'), `${JSON.stringify({
    use: 'scene',
    floors: { present: 0.9, location: 0.85, time: 0.8, heading: 0.85, break: 0.5, nobreak: 1 },
    labelledAt: '2026-09-19',
    source: 'Promoted from scripts/spike/typesafe/data/scene-read.json (windows R01-R21) and scenes.json (S01-S22, each twice: inside the full state, and trigger-only as `<id>t`). Labels were written before any answer was read. OOC is not included: it failed Phase A and is not built.',
    rows: [...windows, ...breaks],
  }, null, 2)}\n`);
  console.log(`${windows.length} windows, ${breaks.length} break rows`);
}

const [command] = process.argv.slice(2);
if (command === 'scene') scene();
else if (command === 'scene-holdout') scene(true);
else console.log(USAGE);
