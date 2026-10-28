import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadEntry } from './bundleEntry.mts';
import { readJson, writeJson } from './witreal.mts';
import type { PlannedSet } from './witnessRecord.mts';

export const PRESENCE_READS_FORMAT = 'so-witness-presence-reads/1';
export const PRESENCE_FLOORS = { pairAccuracy: 0.95, falsePresent: 0.02 } as const;
export const SCENE_WINDOW = 8;

type Obj = Record<string, unknown>;
type Label = { messageId: number; present: string[]; review?: { writer: string; checker: string; agreed: boolean; adjudicator?: string; adjudicated?: boolean } | null };
type Labels = { set: string; synthetic: boolean; members: string[]; labels: Label[] };
type Ratio = { hits: number; of: number; rate: number | null };

export type SceneInput = {
  storyTitle: string; checkpointName: string; objective: string; cast: Array<{ rosterId: string; name: string; role?: string }>;
  player: string; locations?: string[]; times?: string[]; window: Array<{ speaker: string; text: string }>;
  families: { sceneBreak: boolean; tracker: boolean; lookahead: boolean };
};
export type PresenceItem = { set: string; messageId: number; input: SceneInput; names: Record<string, string> };
export type PresenceRow = { set: string; messageId: number; present: Record<string, number> | null; members: Record<string, number> | null; model: string | null; latencyMs: number; fallback: string | null };
export type PresenceAsk = (input: SceneInput) => Promise<{ present: Record<string, number> | null; model: string | null; latencyMs: number; fallback: string | null }>;

interface SceneKit {
  buildSceneReadRequest(input: SceneInput): unknown;
  readScene(answers: Record<string, unknown>, input: SceneInput): { present?: Record<string, number> };
  PRESENT_P: number;
}

export const loadSceneKit = () => loadEntry<SceneKit>('scripts/debug/lib/witnessEntry.ts');

const isObj = (value: unknown): value is Obj => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);

const kept = (set: Labels, label: Label) => {
  const review = label.review;
  if (set.synthetic) return true;
  if (!review || review.writer === review.checker) return false;
  return review.agreed || (review.adjudicated === true && Boolean(review.adjudicator) && review.adjudicator !== review.writer && review.adjudicator !== review.checker);
};

export function sceneInput(set: PlannedSet, messageId: number): SceneInput {
  const story = isObj(set.story) ? set.story : {};
  const read = set.reads.find((entry) => entry.from <= messageId && messageId <= entry.to) ?? set.reads.find((entry) => messageId <= entry.to) ?? set.reads.at(-1);
  const state = isObj(read?.state) ? read.state : {};
  const checkpointId = read?.activeCheckpointId ?? text(state.activeCheckpointId);
  const checkpoints = Array.isArray(story.checkpoints) ? story.checkpoints.filter(isObj) : [];
  const checkpoint = checkpoints.find((entry) => entry.id === checkpointId) ?? checkpoints[0] ?? {};
  const roster = Array.isArray(story.roster) ? story.roster.filter(isObj).filter((row) => typeof row.id === 'string') : [];
  const qualities = Array.isArray(story.qualities) ? story.qualities.filter(isObj) : [];
  const sceneRead = isObj(story.scene_read) ? story.scene_read : {};
  const locationQuality = qualities.find((quality) => quality.key === 'location');
  const locations = Array.isArray(sceneRead.locations) ? sceneRead.locations : locationQuality?.type === 'enum' && Array.isArray(locationQuality.values) ? locationQuality.values : [];
  const times = Array.isArray(sceneRead.times) ? sceneRead.times : [];
  const userIds = new Set(set.chat.flatMap((row, id) => (row.is_user ? [id] : [])));
  const player = set.messages.find((message) => userIds.has(message.messageId))?.speaker ?? 'Player';
  const window = set.messages.filter((message) => message.messageId <= messageId && message.messageId > messageId - SCENE_WINDOW)
    .map((message) => ({ speaker: message.speaker, text: message.text }));
  return {
    storyTitle: text(story.title), checkpointName: text(checkpoint.name, text(checkpoint.id)), objective: text(checkpoint.objective),
    cast: roster.map((row) => ({ rosterId: row.id as string, name: text(row.name, row.id as string), ...(typeof row.role === 'string' ? { role: row.role } : {}) })),
    player, ...(locations.length ? { locations: locations.filter((entry): entry is string => typeof entry === 'string') } : {}),
    ...(times.length ? { times: times.filter((entry): entry is string => typeof entry === 'string') } : {}),
    window, families: { sceneBreak: false, tracker: true, lookahead: false },
  };
}

export function planPresence(sets: readonly PlannedSet[], labels: ReadonlyMap<string, Labels>): PresenceItem[] {
  return sets.flatMap((set) => {
    const labelSet = labels.get(set.key);
    if (!labelSet) return [];
    const nameOf = rosterNames(set);
    return labelSet.labels.filter((label) => kept(labelSet, label)).map((label) => {
      const input = sceneInput(set, label.messageId);
      const names = Object.fromEntries(input.cast.flatMap((member) => (nameOf(member.rosterId) ? [[member.rosterId, nameOf(member.rosterId) as string]] : [])));
      return { set: set.key, messageId: label.messageId, input, names };
    });
  });
}

export async function recordPresence(items: readonly PresenceItem[], ask: PresenceAsk, file: string, log: (line: string) => void = console.log) {
  const prior = existsSync(file) ? (await readJson<{ rows: PresenceRow[] }>(file)).rows.filter((row) => row.present) : [];
  const rows = [...prior];
  const done = new Set(prior.map((row) => `${row.set}#${row.messageId}`));
  for (const item of items) {
    if (done.has(`${item.set}#${item.messageId}`)) continue;
    const answer = await ask(item.input);
    const members = answer.present ? Object.fromEntries(Object.entries(answer.present).flatMap(([id, p]) => (item.names[id] ? [[item.names[id], p]] : []))) : null;
    rows.push({ set: item.set, messageId: item.messageId, ...answer, members });
    await writeJson(file, { format: PRESENCE_READS_FORMAT, rows });
    log(`${item.set}#${item.messageId} ${answer.present ? 'ok' : `no answer (${answer.fallback ?? 'none'})`} ${answer.latencyMs} ms`);
  }
  return { format: PRESENCE_READS_FORMAT, calls: rows.length, answered: rows.filter((row) => row.present).length, file };
}

const ratio = (hits: number, of: number): Ratio => ({ hits, of, rate: of ? hits / of : null });

export function scorePresence(rows: readonly PresenceRow[], labelSet: Labels, threshold: number, skip: readonly string[] = []) {
  const byId = new Map(rows.filter((row) => row.set === labelSet.set).map((row) => [row.messageId, row]));
  const counts = { pairs: 0, correct: 0, absent: 0, falsePresent: 0, presentPairs: 0, falseAbsent: 0, band: 0, unanswered: 0 };
  const members = labelSet.members.filter((member) => !skip.includes(member));
  for (const label of labelSet.labels.filter((entry) => kept(labelSet, entry))) {
    const row = byId.get(label.messageId);
    const p = new Map(Object.entries(row?.members ?? {}));
    if (!row?.members) counts.unanswered += 1;
    for (const member of members) {
      const value = p.get(member);
      const predicted = value !== undefined && value >= threshold;
      const truth = label.present.includes(member);
      counts.pairs += 1;
      if (value !== undefined && value >= 0.3 && value < threshold) counts.band += 1;
      if (value !== undefined && predicted === truth) counts.correct += 1;
      if (truth) {
        counts.presentPairs += 1;
        if (!predicted) counts.falseAbsent += 1;
      } else {
        counts.absent += 1;
        if (predicted) counts.falsePresent += 1;
      }
    }
  }
  const pairAccuracy = ratio(counts.correct, counts.pairs);
  const falsePresent = ratio(counts.falsePresent, counts.absent);
  const floors = { pairAccuracy: pairAccuracy.rate !== null && pairAccuracy.rate >= PRESENCE_FLOORS.pairAccuracy - 1e-9, falsePresent: falsePresent.rate !== null && falsePresent.rate <= PRESENCE_FLOORS.falsePresent + 1e-9 };
  return {
    set: labelSet.set, messages: byId.size, unanswered: counts.unanswered, members: members.length, pairAccuracy, falsePresent, falseAbsent: ratio(counts.falseAbsent, counts.presentPairs),
    band: counts.band, floors, verdict: floors.pairAccuracy && floors.falsePresent ? 'pass' : 'fail',
  };
}

export const presentAtFrom = (rows: readonly PresenceRow[], set: string, threshold: number): Map<number, string[]> =>
  new Map(rows.filter((row) => row.set === set && row.members).map((row) => [row.messageId,
    Object.entries(row.members as Record<string, number>).filter(([, p]) => p >= threshold).map(([name]) => name)]));

export const rosterNames = (set: PlannedSet) => {
  const story = isObj(set.story) ? set.story : {};
  const roster = Array.isArray(story.roster) ? story.roster.filter(isObj) : [];
  const byId = new Map(roster.filter((row) => typeof row.id === 'string').map((row) => [row.id as string, text(row.name, row.id as string)]));
  const names = new Map(set.members.map((member) => [member.name.toLowerCase(), member.name]));
  return (rosterId: string): string | null => names.get((byId.get(rosterId) ?? '').toLowerCase()) ?? null;
};

export const presenceFile = (out: string) => join(out, 'presence-reads.json');

async function labelsBySet(out: string): Promise<Map<string, Labels>> {
  const { labelFiles } = await import('./witnessLabel.mts');
  const sets = await Promise.all((await labelFiles(out, true)).map((file) => readJson<Labels>(file)));
  return new Map(sets.map((set) => [set.set, set]));
}

async function planned(root: string, labRows?: string, labStory?: string) {
  const { planAll } = await import('./witnessRecord.mts');
  return planAll(root, labRows, labStory);
}

export async function presenceReadAll(out: string, root: string, labRows?: string, labStory?: string) {
  const kit = await loadSceneKit();
  const items = planPresence(await planned(root, labRows, labStory), await labelsBySet(out));
  const { withST } = await import('./cli.mts');
  return withST(async (page) => {
    const ask: PresenceAsk = async (input) => {
      const request = kit.buildSceneReadRequest(input);
      const result = await page.evaluate(async (payload) => {
        const judge = (globalThis as unknown as { storyOrchestratorJudge?: { probe(request: unknown): Promise<{ answers: Record<string, unknown> | null; model: string | null; latencyMs: number; fallback?: string }> } }).storyOrchestratorJudge;
        if (!judge) throw new Error('storyOrchestratorJudge not registered (extension not loaded?)');
        return judge.probe(payload);
      }, request);
      const present = result.answers ? kit.readScene(result.answers, input).present ?? null : null;
      return { present, model: result.model, latencyMs: result.latencyMs, fallback: result.fallback ?? null };
    };
    return recordPresence(items, ask, presenceFile(out));
  });
}

export const omniscientNames = (set: PlannedSet): string[] => {
  const story = isObj(set.story) ? set.story : {};
  const roster = Array.isArray(story.roster) ? story.roster.filter(isObj) : [];
  const nameOf = rosterNames(set);
  return roster.filter((row) => row.view === 'omniscient' && typeof row.id === 'string').flatMap((row) => nameOf(row.id as string) ?? []);
};

const sumRatio = (parts: Ratio[]): Ratio => ratio(parts.reduce((total, part) => total + part.hits, 0), parts.reduce((total, part) => total + part.of, 0));

function combine(set: string, scores: Array<ReturnType<typeof scorePresence>>) {
  const pairAccuracy = sumRatio(scores.map((score) => score.pairAccuracy));
  const falsePresent = sumRatio(scores.map((score) => score.falsePresent));
  const floors = { pairAccuracy: pairAccuracy.rate !== null && pairAccuracy.rate >= PRESENCE_FLOORS.pairAccuracy - 1e-9, falsePresent: falsePresent.rate !== null && falsePresent.rate <= PRESENCE_FLOORS.falsePresent + 1e-9 };
  return {
    set, messages: scores.reduce((total, score) => total + score.messages, 0), unanswered: scores.reduce((total, score) => total + score.unanswered, 0),
    pairAccuracy, falsePresent, falseAbsent: sumRatio(scores.map((score) => score.falseAbsent)), band: scores.reduce((total, score) => total + score.band, 0),
    floors, verdict: floors.pairAccuracy && floors.falsePresent ? 'pass' : 'fail',
  };
}

export async function presenceScoreAll(out: string, root: string, labRows?: string, labStory?: string) {
  const kit = await loadSceneKit();
  const rows = (await readJson<{ rows: PresenceRow[] }>(presenceFile(out))).rows;
  const labels = await labelsBySet(out);
  const sets = (await planned(root, labRows, labStory)).filter((set) => labels.has(set.key));
  const score = (skipOmniscient: boolean, lab: boolean) => combine(lab ? 'lab' : 'real', sets.filter((set) => set.key.startsWith('lab/') === lab)
    .map((set) => scorePresence(rows, labels.get(set.key) as Labels, kit.PRESENT_P, skipOmniscient ? omniscientNames(set) : [])));
  return {
    format: 'so-witness-presence-score/1', threshold: kit.PRESENT_P, floors: PRESENCE_FLOORS, calls: rows.length,
    models: [...new Set(rows.map((row) => row.model))],
    real: score(false, false), lab: score(false, true), withoutOmniscient: { real: score(true, false), lab: score(true, true) },
  };
}
