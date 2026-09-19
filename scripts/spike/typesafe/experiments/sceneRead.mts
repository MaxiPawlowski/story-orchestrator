import { choiceOf, noulOf, systemOne, type Question } from '../lib/client.mts';
import { loadData, msgId, worlds, type WorldDef } from '../lib/story.mts';
import { worldForSpeakers } from '../lib/sharedRead.mts';
import { auroc, binaryAccuracy, frac, fixed, pct, table, type BinaryRow } from '../lib/stats.mts';
import type { Experiment } from './types.mts';

interface Line { speaker: string; text: string }
interface Reachable { name: string; objective: string; heading: boolean }
interface Window { id: string; world: string; checkpoint: string; tags: string[]; transcript: Line[]; labels: { present: Record<string, boolean>; location: string; time: string }; reachable: Reachable[] }
interface OocCase { id: string; ooc: boolean; lang: string; text: string }
interface SceneReadData { vocab: Record<string, string[]>; physical: Record<string, string[]>; windows: Window[]; ooc: OocCase[] }
interface SceneCase { id: string; label: boolean; prev: Line[]; next: Line }

const TIMES = ['dawn', 'morning', 'midday', 'afternoon', 'evening', 'night'];
const SCENE_PLAIN = 'Does the latest message in `transcript` start a new scene compared with the messages before it?';
const SCENE_STRUCTURED = {
  true: 'The story cuts forward in time, moves to a different place, or passes an explicit scene divider',
  false: 'The same scene continues: someone arrives, characters move around the same place, talk about other times or places, or pause',
};
const OOC_QUESTION = 'Is the latest message by `player` written out of character, speaking to the storyteller or system instead of acting in the story?';

const roleOf = (world: WorldDef, name: string) => world.roster.find((member) => member.name === name)?.role ?? name;

function fullState(world: WorldDef, checkpointId: string, locations: string[], transcript: Line[], reachable: Array<{ name: string; objective: string }>) {
  const checkpoint = world.checkpoints[checkpointId] ?? Object.values(world.checkpoints)[0];
  return {
    story: { title: world.title },
    scene: { checkpoint: checkpoint.name, objective: checkpoint.objective },
    cast: world.roster.map((member) => ({ name: member.name, role: member.role })),
    player: world.player,
    locations,
    times: TIMES,
    reachable: reachable.map((entry) => ({ name: entry.name, objective: entry.objective })),
    transcript: transcript.map((line, index) => ({ id: msgId(index + 1), speaker: line.speaker, text: line.text })),
  };
}

function sceneQuestions(world: WorldDef, physical: string[], locations: string[], reachable: Array<{ name: string; objective: string }>): Record<string, Question> {
  const questions: Record<string, Question> = {
    scene_break: { type: 'noul', instructions: SCENE_PLAIN, criteria: SCENE_STRUCTURED },
    location: {
      type: 'choice',
      instructions: 'Where is the scene taking place at the end of `transcript`? Pick one of `locations`.',
      criteria: { ...Object.fromEntries(locations.map((place) => [place, null])), elsewhere: 'Somewhere not listed in `locations`', unclear: 'The transcript does not make the place clear' },
    },
    time: {
      type: 'choice',
      instructions: 'What time of day is it in the scene at the end of `transcript`?',
      criteria: { ...Object.fromEntries(TIMES.map((time) => [time, null])), unclear: 'The transcript gives no cue for the time of day' },
    },
    ooc: { type: 'noul', instructions: OOC_QUESTION },
  };
  physical.forEach((name) => { questions[`present:${name}`] = { type: 'noul', instructions: `Is ${name} (${roleOf(world, name)}) physically present in the scene at the end of \`transcript\`?` }; });
  reachable.forEach((entry, index) => { questions[`heading:${index}`] = { type: 'noul', instructions: `Is the play in \`transcript\` moving toward: ${entry.name} — ${entry.objective}?` }; });
  return questions;
}

const withinOne = (a: string, b: string) => {
  if (a === b) return true;
  const i = TIMES.indexOf(a);
  const j = TIMES.indexOf(b);
  return i >= 0 && j >= 0 && Math.abs(i - j) <= 1;
};

// v2.2 plan 03 Phase A: the scene read's unmeasured families (presence, location, time of day, OOC,
// look-ahead) plus scene_break re-measured inside the full state. Floors are in the plan.
export const sceneRead: Experiment = {
  id: 'scene-read',
  title: 'Scene read families — v2.2 plan 03 Phase A',
  async run() {
    const data = loadData<SceneReadData>('scene-read.json');
    const all = worlds();
    const windowRows = await Promise.all(data.windows.map(async (window) => {
      const world = all[window.world];
      const locations = data.vocab[window.world];
      const physical = data.physical[window.world];
      const record = await systemOne({ state: fullState(world, window.checkpoint, locations, window.transcript, window.reachable), questions: sceneQuestions(world, physical, locations, window.reachable) }, { tag: `scene-read:${window.id}` });
      return {
        window,
        present: physical.map((name) => ({ name, p: noulOf(record, `present:${name}`), label: window.labels.present[name] })),
        location: choiceOf(record, 'location'),
        time: choiceOf(record, 'time'),
        heading: window.reachable.map((entry, index) => ({ name: entry.name, p: noulOf(record, `heading:${index}`), label: entry.heading })),
        ooc: noulOf(record, 'ooc'),
      };
    }));

    const oocRows = await Promise.all(data.ooc.map(async (entry) => {
      const state = { player: 'Max', transcript: [{ id: msgId(1), speaker: 'Narrator', text: 'The scene goes on around you.' }, { id: msgId(2), speaker: 'Max', text: entry.text }] };
      const record = await systemOne({ state, questions: { ooc: { type: 'noul', instructions: OOC_QUESTION } } }, { tag: `scene-read:ooc:${entry.id}` });
      return { ...entry, p: noulOf(record, 'ooc') };
    }));

    const scenes = loadData<SceneCase[]>('scenes.json');
    const sceneRows = await Promise.all(scenes.map(async (entry) => {
      const transcript = [...entry.prev, entry.next];
      const world = worldForSpeakers(transcript.map((line) => line.speaker));
      const locations = data.vocab[world.id] ?? [];
      const physical = data.physical[world.id] ?? [];
      const record = await systemOne({ state: fullState(world, Object.keys(world.checkpoints)[0], locations, transcript, []), questions: sceneQuestions(world, physical, locations, []) }, { tag: `scene-read:scene:${entry.id}` });
      return { id: entry.id, label: entry.label, p: noulOf(record, 'scene_break') };
    }));

    const presentRows: BinaryRow[] = windowRows.flatMap((row) => row.present.map((item) => ({ p: item.p, label: item.label })));
    const headingRows: BinaryRow[] = windowRows.flatMap((row) => row.heading.map((item) => ({ p: item.p, label: item.label })));
    const confidentHeading = windowRows.flatMap((row) => row.heading).filter((item) => item.p >= 0.7);
    const locationRight = windowRows.filter((row) => row.location.choice === row.window.labels.location).length;
    const timeExact = windowRows.filter((row) => row.time.choice === row.window.labels.time).length;
    const timeNear = windowRows.filter((row) => withinOne(row.time.choice, row.window.labels.time)).length;
    const oocBinary: BinaryRow[] = oocRows.map((row) => ({ p: row.p, label: row.ooc }));
    const oocFalse = oocRows.filter((row) => !row.ooc && row.p >= 0.5).length;
    const windowOocFalse = windowRows.filter((row) => row.ooc >= 0.5).length;
    const sceneBinary: BinaryRow[] = sceneRows.map((row) => ({ p: row.p, label: row.label }));
    const spanish = windowRows.filter((row) => row.window.tags.includes('spanish'));
    const spanishPresent = spanish.flatMap((row) => row.present).filter((item) => (item.p >= 0.5) === item.label).length;
    const spanishPresentTotal = spanish.flatMap((row) => row.present).length;

    return {
      id: this.id,
      title: this.title,
      summary: [
        `Presence: ${frac(presentRows.filter((row) => (row.p >= 0.5) === row.label).length, presentRows.length)} per-member at 0.5, AUROC ${fixed(auroc(presentRows))} (floor 0.9). Spanish ${spanishPresent}/${spanishPresentTotal}.`,
        `Location: ${frac(locationRight, windowRows.length)} exact (floor 0.85). Time of day: ${frac(timeExact, windowRows.length)} exact (floor 0.8), ${frac(timeNear, windowRows.length)} within one bucket (floor 0.95).`,
        `OOC: ${pct(binaryAccuracy(oocBinary))} on ${oocRows.length} messages (floor 0.9), ${oocFalse} false positives among ${oocRows.filter((row) => !row.ooc).length} in-character, ${windowOocFalse}/${windowRows.length} false positives on the windows' in-character last messages.`,
        `Look-ahead: AUROC ${fixed(auroc(headingRows))} (floor 0.8), accuracy at 0.5 ${pct(binaryAccuracy(headingRows))}, p ≥ 0.7 right ${frac(confidentHeading.filter((item) => item.label).length, confidentHeading.length)} (floor 0.85).`,
        `scene_break inside the full state: ${frac(sceneBinary.filter((row) => (row.p >= 0.5) === row.label).length, sceneBinary.length)} at 0.5 (needs 22/22), AUROC ${fixed(auroc(sceneBinary))}.`,
      ],
      sections: [
        { title: 'Windows', body: table(['window', 'presence (p / label)', 'location', 'time', 'heading (p / label)', 'ooc p'], windowRows.map((row) => [
          `${row.window.id}${row.window.tags.includes('spanish') ? ' es' : ''}`,
          row.present.map((item) => `${item.name} ${fixed(item.p)}${(item.p >= 0.5) === item.label ? '' : ' ✗'}`).join('; '),
          `${row.location.choice}${row.location.choice === row.window.labels.location ? ' ✓' : ` ✗ (${row.window.labels.location})`} ${fixed(row.location.confidence)}`,
          `${row.time.choice}${row.time.choice === row.window.labels.time ? ' ✓' : ` ✗ (${row.window.labels.time})`} ${fixed(row.time.confidence)}`,
          row.heading.map((item) => `${item.name} ${fixed(item.p)}${(item.p >= 0.5) === item.label ? '' : ' ✗'}`).join('; '),
          fixed(row.ooc),
        ])) },
        { title: 'OOC messages', body: table(['id', 'label', 'lang', 'p(ooc)', 'text'], oocRows.map((row) => [row.id, row.ooc ? 'ooc' : 'in character', row.lang, `${fixed(row.p)}${(row.p >= 0.5) === row.ooc ? '' : ' ✗'}`, row.text])) },
        { title: 'Scene break in the full state', body: table(['case', 'label', 'p'], sceneRows.map((row) => [row.id, row.label ? 'break' : 'same scene', `${fixed(row.p)}${(row.p >= 0.5) === row.label ? '' : ' ✗'}`])) },
      ],
      data: { windowRows, oocRows, sceneRows },
    };
  },
};
