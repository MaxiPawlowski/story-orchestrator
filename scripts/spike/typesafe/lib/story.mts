import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_ROOT, SPIKE_ROOT } from './client.mts';

export type Primitive = string | number | boolean;
export type Expected = Primitive | null | { anyOf: Primitive[] };

export interface QualityDef {
  type: 'bool' | 'enum' | 'int' | 'float' | 'string';
  values?: string[];
  latching?: boolean;
  rubric: string;
  jev?: 'candidates' | 'score';
  min?: number;
  max?: number;
  structured?: { instructions?: string; criteria?: Record<string, unknown>; levels?: unknown[] };
}

export interface RosterDef { name: string; role: string }

export interface WorldDef {
  id: string;
  title: string;
  player: string;
  roster: RosterDef[];
  checkpoints: Record<string, { name: string; objective: string }>;
  qualities: Record<string, QualityDef>;
}

export interface Message { index: number; speaker: string; text: string }

export interface ExtractionCase {
  id: string;
  source: 'fixture' | 'hard';
  title: string;
  checkpoint: { id: string; name: string; objective: string };
  qualities: Record<string, QualityDef>;
  ask: string[];
  prior: Record<string, Primitive>;
  transcript: Message[];
  expected: Record<string, Expected>;
  evidence: Record<string, number[]>;
  tension: string[] | null;
  tags: string[];
  long: boolean;
  story: unknown;
}

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf-8'));

export const loadData = <T,>(name: string): T => readJson(join(SPIKE_ROOT, 'data', name)) as T;

export const worlds = (): Record<string, WorldDef> => Object.fromEntries(loadData<WorldDef[]>('worlds.json').map((world) => [world.id, world]));

export const msgId = (index: number) => `msg_${index}`;

const FIXTURE_DIR = join(PROJECT_ROOT, 'test', 'fixtures');

export function loadFixtureCases(): ExtractionCase[] {
  const names = readdirSync(FIXTURE_DIR)
    .filter((file) => /^extractor\d*\.story\.json$/.test(file))
    .map((file) => file.replace('.story.json', ''))
    .sort((a, b) => Number(a.replace(/\D/g, '') || 1) - Number(b.replace(/\D/g, '') || 1));
  return names.map((name) => {
    const story = readJson(join(FIXTURE_DIR, `${name}.story.json`));
    const transcript: Message[] = readJson(join(FIXTURE_DIR, `${name}.transcript.json`));
    const expectedFile = readJson(join(FIXTURE_DIR, `${name}.expected.json`));
    const qualities: Record<string, QualityDef> = {};
    for (const quality of story.qualities) {
      if (quality.source !== 'extractor') continue;
      qualities[quality.key] = { type: quality.type, values: quality.values, latching: quality.latching, rubric: quality.rubric, jev: quality.type === 'int' || quality.type === 'float' ? 'candidates' : undefined };
    }
    const deltas: Array<{ q: string; v: Primitive; evidence: string }> = expectedFile.deltas ?? [];
    const tensionDelta = deltas.find((delta) => delta.q === 'tension_current');
    const expected: Record<string, Expected> = {};
    const evidence: Record<string, number[]> = {};
    for (const key of Object.keys(qualities)) {
      if (key === 'tension_current') continue;
      const delta = deltas.find((entry) => entry.q === key);
      expected[key] = delta ? delta.v : null;
      if (delta) {
        const hit = transcript.find((message) => message.text.toLowerCase().includes(delta.evidence.toLowerCase()));
        if (hit) evidence[key] = [hit.index];
      }
    }
    const levels = ['calm', 'stirring', 'tense', 'critical', 'peak'];
    const start = story.checkpoints.find((checkpoint: { start?: boolean }) => checkpoint.start) ?? story.checkpoints[0];
    return {
      id: name,
      source: 'fixture',
      title: story.title,
      checkpoint: { id: start.id, name: start.name, objective: start.objective },
      qualities,
      ask: Object.keys(qualities).filter((key) => key !== 'tension_current'),
      prior: {},
      transcript,
      expected,
      evidence,
      tension: tensionDelta ? [levels[Math.round(Number(tensionDelta.v) * 4)]] : null,
      tags: ['fixture'],
      long: transcript.length >= 8,
      story,
    };
  });
}

interface HardCaseFile {
  id: string;
  world: string;
  checkpoint: string;
  ask: string[];
  prior?: Record<string, Primitive>;
  transcript: Message[];
  expected: Record<string, Expected>;
  evidence?: Record<string, number[]>;
  tension?: string[];
  tags?: string[];
}

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

const gateLeaf = (key: string, quality: QualityDef) => {
  if (quality.type === 'bool') return { q: key, op: '==', v: true };
  if (quality.type === 'enum') return { q: key, op: 'in', v: quality.values ?? [] };
  if (quality.type === 'string') return { q: key, op: '!=', v: '' };
  return { q: key, op: '>=', v: quality.min ?? 0 };
};

export function buildMiniStory(world: WorldDef, checkpointId: string, ask: string[]) {
  const checkpoint = world.checkpoints[checkpointId];
  return {
    format: 2,
    id: `spike-${world.id}`,
    title: world.title,
    description: 'TypeSafe spike case.',
    qualities: [
      { key: 'message_count', type: 'int', source: 'code', monotonic: true, rubric: 'Rendered boundary count.' },
      ...ask.map((key) => {
        const quality = world.qualities[key];
        return { key, type: quality.type, ...(quality.values ? { values: quality.values } : {}), source: 'extractor', ...(quality.latching ? { latching: true } : {}), rubric: quality.rubric };
      }),
    ],
    checkpoints: [
      { id: checkpointId, name: checkpoint.name, objective: checkpoint.objective, type: 'anchor', start: true },
      { id: 'spike_next', name: 'Next', objective: 'Continue the story.', type: 'anchor' },
    ],
    transitions: [{ from: checkpointId, to: 'spike_next', priority: 1, gate: { any: ask.map((key) => gateLeaf(key, world.qualities[key])) } }],
    roster: world.roster.map((member) => ({ id: slug(member.name), name: member.name })),
  };
}

export function loadHardCases(): ExtractionCase[] {
  const all = worlds();
  return loadData<HardCaseFile[]>('extraction-hard.json').map((entry) => {
    const world = all[entry.world];
    if (!world) throw new Error(`${entry.id}: unknown world ${entry.world}`);
    const checkpoint = world.checkpoints[entry.checkpoint];
    if (!checkpoint) throw new Error(`${entry.id}: unknown checkpoint ${entry.checkpoint}`);
    for (const key of entry.ask) if (!world.qualities[key]) throw new Error(`${entry.id}: unknown quality ${key}`);
    return {
      id: entry.id,
      source: 'hard',
      title: world.title,
      checkpoint: { id: entry.checkpoint, ...checkpoint },
      qualities: Object.fromEntries(entry.ask.map((key) => [key, world.qualities[key]])),
      ask: entry.ask,
      prior: entry.prior ?? {},
      transcript: entry.transcript,
      expected: entry.expected,
      evidence: entry.evidence ?? {},
      tension: entry.tension ?? null,
      tags: entry.tags ?? [],
      long: entry.transcript.length >= 8,
      story: buildMiniStory(world, entry.checkpoint, entry.ask),
    };
  });
}

export function transcriptState(extra: Record<string, unknown>, transcript: Message[]) {
  return { ...extra, transcript: transcript.map((message) => ({ id: msgId(message.index), speaker: message.speaker, text: message.text })) };
}

export const normalizeFinal = (quality: QualityDef, value: Primitive | undefined): Primitive | undefined => {
  if (quality.type === 'bool') return value === true;
  return value;
};

export function expectedFinal(quality: QualityDef, expected: Expected, prior: Primitive | undefined): Primitive[] | undefined {
  if (expected === null) {
    const base = normalizeFinal(quality, prior);
    return base === undefined ? undefined : [base];
  }
  if (typeof expected === 'object') return expected.anyOf;
  return [expected];
}

export function valueMatches(quality: QualityDef, predicted: Primitive | undefined, acceptable: Primitive[] | undefined): boolean {
  const normalized = normalizeFinal(quality, predicted);
  if (acceptable === undefined) return normalized === undefined || (quality.type === 'bool' && normalized === false);
  if (normalized === undefined) return false;
  return acceptable.some((value) => {
    if (typeof value === 'number' && typeof normalized === 'number') return Math.abs(value - normalized) <= (quality.type === 'float' ? 0.051 : 0);
    if (typeof value === 'string' && typeof normalized === 'string') return value.toLowerCase() === normalized.toLowerCase();
    return value === normalized;
  });
}
