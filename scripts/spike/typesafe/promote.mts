import { register } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_ROOT } from './lib/client.mts';
import { readFileSync } from 'node:fs';
import { expectedFinal, loadData, loadFixtureCases, loadHardCases, msgId, worlds, type ExtractionCase, type QualityDef, type WorldDef } from './lib/story.mts';

register('./lib/loader.mts', import.meta.url);
const { worldForSpeakers } = await import('./lib/sharedRead.mts');

const USAGE = `Usage: node --no-warnings --experimental-transform-types scripts/spike/typesafe/promote.mts scene|scene-holdout|lore|lore-holdout|curator-filter|continuity|continuity-holdout|backgrounds|typed|stall

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

interface LoreWindows { book: string; uids: { from: number; to: number; extra?: number[] }; scene: { name: string; goal: string }; windows: Array<{ id: string; lang: string; needed: number[]; transcript: Line[] }> }
interface WiFile { entries: Record<string, Array<{ title: string; content: string }>>; scenes: Array<{ id: string; world: string; checkpoint: string; case: string; on: string[]; off: string[] }> }

function lore(holdout = false) {
  const data = loadData<LoreWindows>(holdout ? 'lore-windows-holdout.json' : 'lore-windows.json');
  const book = JSON.parse(readFileSync(data.book, 'utf-8')) as { entries: Record<string, { uid: number; comment?: string; content?: string; disable?: boolean; constant?: boolean }> };
  const world = 'SO-J11 Adolion World';
  const adolion = Object.values(book.entries)
    .filter((entry) => (entry.uid >= data.uids.from && entry.uid <= data.uids.to) || (data.uids.extra ?? []).includes(entry.uid))
    .sort((left, right) => left.uid - right.uid)
    .map((entry) => ({ world, uid: entry.uid, comment: entry.comment ?? '', content: entry.content ?? '', ...(entry.disable ? { disable: true } : {}), ...(entry.constant ? { constant: true } : {}) }));
  const wi = loadData<WiFile>('wi-relevance.json');
  const known = worlds();
  const hard = Object.fromEntries(loadHardCases().map((item) => [item.id, item]));
  const pools: Record<string, unknown[]> = { adolion };
  const spikeRows = wi.scenes.map((scene) => {
    const checkpoint = known[scene.world].checkpoints[scene.checkpoint];
    const entries = wi.entries[scene.world]
      .map((entry, uid) => ({ world: `spike-${scene.world}`, uid, comment: entry.title, content: entry.content }))
      .filter((entry) => scene.on.includes(entry.comment) || scene.off.includes(entry.comment));
    pools[`spike-${scene.id}`] = entries;
    return {
      id: scene.id,
      lang: 'en',
      pool: `spike-${scene.id}`,
      scene: { checkpointName: checkpoint.name, objective: checkpoint.objective, window: hard[scene.case].transcript.map((message) => ({ speaker: message.speaker, text: message.text })) },
      needed: entries.filter((entry) => scene.on.includes(entry.comment)).map((entry) => `${entry.world}.${entry.uid}`),
    };
  });
  if (holdout) {
    Object.keys(pools).filter((key) => key !== 'adolion').forEach((key) => delete pools[key]);
    spikeRows.length = 0;
  }
  const rows = [
    ...data.windows.map((window) => ({ id: window.id, lang: window.lang, pool: 'adolion', scene: { checkpointName: data.scene.name, objective: data.scene.goal, window: window.transcript }, needed: window.needed.map((uid) => `${world}.${uid}`) })),
    ...spikeRows,
  ];
  const out = join(PROJECT_ROOT, 'test', 'fixtures', 'judge');
  writeFileSync(join(out, holdout ? 'lore-holdout.json' : 'lore.json'), `${JSON.stringify({
    use: 'lore',
    floors: { recall: 0.8, precision: 0.7 },
    labelledAt: '2026-09-19',
    source: 'Adolion World entries uid 1-64 (pool `adolion`, from the Adolion campaign build) against 10 hand-written windows whose text avoids the needed entries’ keywords (scripts/spike/typesafe/data/lore-windows.json), plus the spike’s WI-relevance scenes (on = needed). Labels were written before any answer was read.',
    pools,
    rows,
  }, null, 2)}
`);
  console.log(`${rows.length} lore rows, pools ${Object.keys(pools).length} (adolion ${adolion.length} entries)`);
}

function curatorFilter() {
  const stories = loadData<{ stories: Array<{ id: string; checkpoint: { name: string; objective: string }; canon: string; openThreads: string[]; entries: Array<{ title: string; on: boolean; content: string; attention: boolean }> }> }>('curator-filter.json').stories;
  const rows = stories.map((story) => ({
    id: story.id,
    lang: story.id === 'noir' ? 'es' : 'en',
    input: { checkpoint: story.checkpoint, canon: story.canon, openThreads: story.openThreads, entries: story.entries.map((entry) => ({ title: entry.title, content: entry.content, enabled: entry.on })) },
    attention: story.entries.map((entry) => entry.attention),
  }));
  writeFileSync(join(PROJECT_ROOT, 'test', 'fixtures', 'judge', 'curator-filter.json'), `${JSON.stringify({
    use: 'curator-filter',
    floors: { recall: 0.9, narrowed: 0 },
    labelledAt: '2026-09-19',
    source: 'Promoted from scripts/spike/typesafe/data/curator-filter.json (Phase A, labels written before any answer was read; the noir set is Spanish). recall = an entry needing attention is still shown to the curator; narrowed = a fine switched-on entry was dropped from its prompt (reported, no floor).',
    rows,
  }, null, 2)}
`);
  console.log(`${rows.length} curator-filter stories`);
}

function continuity() {
  const spike = loadData<Array<{ id: string; tags: string[]; established: string[]; reply: { speaker: string; text: string }; contradicts: number[] }>>('continuity.json');
  const extra = loadData<{ cases: Array<{ id: string; lang: string; established: string[]; reply: { speaker: string; text: string }; contradicts: number[] }> }>('continuity-extra.json').cases;
  const rows = [
    ...spike.map((entry) => ({ id: entry.id, lang: entry.tags.includes('spanish') ? 'es' : 'en', established: entry.established, reply: entry.reply, contradicts: entry.contradicts })),
    ...extra,
  ];
  writeFileSync(join(PROJECT_ROOT, 'test', 'fixtures', 'judge', 'continuity.json'), `${JSON.stringify({
    use: 'continuity',
    floors: { reply: 0.9, broken: 0.85, consistent: 0.966 },
    labelledAt: '2026-09-19',
    source: 'Spike C01-C18 (scripts/spike/typesafe/data/continuity.json) plus CX01-CX10 (continuity-extra.json, 4 Spanish), labels written before any answer was read. consistent 0.966 = at most 1 false alarm per 30 consistent facts. Real-play Artemis replies are still owed at the live gate.',
    rows,
  }, null, 2)}
`);
  console.log(`${rows.length} continuity cases, ${rows.reduce((sum, row) => sum + row.established.length, 0)} facts`);
}

function backgrounds() {
  const spike = loadData<{ installed: string[]; cases: Array<{ id: string; scene: string; acceptable: string[] }> }>('backgrounds.json');
  const composed = loadData<{ cases: Array<{ id: string; lang: string; checkpointName: string; objective: string; location?: string; time?: string; messages: Array<{ speaker: string; text: string }>; acceptable: string[] }> }>('backgrounds-composed.json').cases;
  const installed = [...spike.installed, '_black.jpg', '_white.jpg', '__transparent.png'];
  const rows = [
    ...spike.cases.map((entry) => ({ id: entry.id, lang: 'en', scene: entry.scene, acceptable: entry.acceptable })),
    ...composed.map((entry) => ({ id: entry.id, lang: entry.lang, compose: { checkpointName: entry.checkpointName, objective: entry.objective, location: entry.location ?? null, time: entry.time ?? null, messages: entry.messages }, acceptable: entry.acceptable })),
  ];
  writeFileSync(join(PROJECT_ROOT, 'test', 'fixtures', 'judge', 'backgrounds.json'), `${JSON.stringify({
    use: 'backgrounds',
    floors: { pick: 0.85, none: 1 },
    labelledAt: '2026-09-19',
    source: 'Spike B01-B12 (hand-written scene text) plus BX01-BX10 (backgrounds-composed.json: scene text composed by src/judge/curators.ts sceneDescription). Installed = this install’s 22 backgrounds plus its three utility files, which the candidate filter must drop.',
    installed,
    rows,
  }, null, 2)}
`);
  console.log(`${rows.length} background cases over ${installed.length} installed`);
}

const productionQuality = (key: string, quality: QualityDef) => {
  const readAs = quality.type === 'bool' || quality.type === 'enum' ? 'choice' : quality.jev === 'score' ? 'rating' : 'stated';
  const hasRange = /from\s+-?\d+\s*\([^)]+\)\s*to\s+-?\d+\s*\([^)]+\)/i.test(quality.rubric);
  const levels = readAs === 'rating' && !hasRange && Array.isArray(quality.structured?.levels)
    ? (quality.structured!.levels as string[]).map((label, index) => ({ value: (quality.min ?? 0) + index, label }))
    : null;
  return { key, type: quality.type, source: 'extractor', rubric: quality.rubric, ...(quality.values ? { values: quality.values } : {}), ...(quality.latching ? { latching: true } : {}), read_as: readAs, ...(levels ? { criteria: { levels } } : {}) };
};
const windowOf = (entry: ExtractionCase) => entry.transcript.map((message) => ({ id: message.index, speaker: message.speaker, text: message.text }));
const langOf = (entry: ExtractionCase) => (entry.tags.includes('spanish') ? 'es' : 'en');

function typed() {
  const cases = [...loadHardCases(), ...loadFixtureCases()];
  const rows = cases.map((entry) => ({
    id: entry.id,
    lang: langOf(entry),
    story: { title: entry.title, checkpointName: entry.checkpoint.name, objective: entry.checkpoint.objective },
    qualities: entry.ask.map((key) => productionQuality(key, entry.qualities[key])),
    window: windowOf(entry),
    prior: entry.prior,
    acceptable: Object.fromEntries(entry.ask.map((key) => [key, expectedFinal(entry.qualities[key], entry.expected[key] ?? null, entry.prior[key]) ?? null])),
  }));
  writeFileSync(join(PROJECT_ROOT, 'test', 'fixtures', 'judge', 'typed.json'), `${JSON.stringify({
    use: 'typed',
    floors: { answered: 0.95, coverage: 0 },
    labelledAt: '2026-09-19',
    source: 'Spike hard set (extraction-hard.json) plus the extractor* live-suite fixtures, labels as recorded there. Every asked quality gets the plain hint its type implies (bool/enum choice, spike score qualities rating, numbers and strings stated), which is the measured shape. answered = the value the chain would hold is right when the judge answered over the floor; coverage = how many it answered at all (the rest stays with the LLM read, no floor).',
    rows,
  }, null, 2)}\n`);
  console.log(`${rows.length} typed cases, ${rows.reduce((sum, row) => sum + row.qualities.length, 0)} qualities`);
}

function stall() {
  const cases = [...loadHardCases(), ...loadFixtureCases()];
  const rows = cases.flatMap((entry) => {
    const leaves: Array<Record<string, unknown>> = [];
    for (const key of entry.ask) {
      const quality = entry.qualities[key];
      if (quality.type !== 'bool' && quality.type !== 'enum') continue;
      const final = expectedFinal(quality, entry.expected[key] ?? null, entry.prior[key]);
      const shown = entry.expected[key] !== null && entry.expected[key] !== undefined && Boolean(final?.length);
      const leaf = (v: unknown, isShown: boolean) => leaves.push({ q: key, rubric: quality.rubric, type: quality.type, op: '==', v, shown: isShown });
      if (quality.type === 'bool') {
        if (shown) { leaf(final![0], true); leaf(!final![0], false); } else leaf(entry.prior[key] === true ? false : true, false);
        continue;
      }
      const values = quality.values ?? [];
      if (shown) {
        const accepted = final!.map(String);
        leaf(accepted[0], true);
        const other = values.find((candidate) => !accepted.includes(candidate) && candidate !== 'unknown');
        if (other) leaf(other, false);
      } else {
        const other = values.find((candidate) => candidate !== entry.prior[key] && candidate !== 'unknown');
        if (other) leaf(other, false);
      }
    }
    return leaves.length ? [{ id: entry.id, lang: langOf(entry), window: windowOf(entry), leaves }] : [];
  });
  writeFileSync(join(PROJECT_ROOT, 'test', 'fixtures', 'judge', 'stall.json'), `${JSON.stringify({
    use: 'stall',
    floors: { direct: 1, kept: 1 },
    labelledAt: '2026-09-19',
    source: 'Phase A leaves (spike experiments/stallLeaves.mts leavesFor) over the hard set plus the live-suite fixtures: one shown leaf and one contradicting or never-shown leaf per bool/enum quality. direct = a leaf the pre-check would write at STALL_DIRECT_P was really shown; kept = a shown leaf never falls under STALL_GENUINE_P (a real stall taken as genuine).',
    rows,
  }, null, 2)}\n`);
  console.log(`${rows.length} stall cases, ${rows.reduce((sum, row) => sum + row.leaves.length, 0)} leaves`);
}

const [command] = process.argv.slice(2);
if (command === 'scene') scene();
else if (command === 'scene-holdout') scene(true);
else if (command === 'lore') lore();
else if (command === 'lore-holdout') lore(true);
else if (command === 'curator-filter') curatorFilter();
else if (command === 'continuity') continuity();
else if (command === 'continuity-holdout') {
  const rows = loadData<{ cases: unknown[] }>('continuity-holdout.json').cases;
  writeFileSync(join(PROJECT_ROOT, 'test', 'fixtures', 'judge', 'continuity-holdout.json'), `${JSON.stringify({ use: 'continuity', floors: { reply: 0.9, broken: 0.85, consistent: 0.966 }, labelledAt: '2026-09-19', source: 'Held out: scripts/spike/typesafe/data/continuity-holdout.json, written after the first run and before CONTINUITY_P 0.7 was scored.', rows }, null, 2)}
`);
  console.log(`${rows.length} held-out continuity cases`);
}
else if (command === 'backgrounds') backgrounds();
else if (command === 'typed') typed();
else if (command === 'stall') stall();
else console.log(USAGE);
