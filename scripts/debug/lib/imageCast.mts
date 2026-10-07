import { join } from 'node:path';

export const CAST_FILE = 'test/fixtures/image-test-cast/cast.json';
export const DEFAULT_ART_DIR = 'test/sessions/evidence/image-test-cast-art';

export interface CastCard { field: string; quality: string; from: string; to: string }
export interface CastBox { x: number; y: number; width: number; height: number }
export interface CastMember { short: string; name: string; variety: string; description: string; personality: string; first_mes: string; card: CastCard; looks: string[] }
export interface Cast { marker: string; group: string; expressions: string[]; members: CastMember[] }

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown) => typeof value === 'string' && value.trim().length > 0;

export function validateCast(doc: unknown): string[] {
  if (!isRecord(doc)) return ['cast: expected an object'];
  const problems: string[] = [];
  const marker = doc.marker;
  if (!text(marker) || !/^[A-Z0-9]+$/.test(String(marker))) problems.push('cast.marker: expected one word of capitals and digits (no separator, or ST mention matching splits it)');
  if (!text(doc.group) || !String(doc.group).startsWith(String(marker))) problems.push('cast.group: expected a name that starts with the marker');
  if (!Array.isArray(doc.expressions) || !doc.expressions.length || doc.expressions.some((label) => !/^[a-z]+$/.test(String(label)))) problems.push('cast.expressions: expected lowercase expression labels');
  const members = Array.isArray(doc.members) ? doc.members : [];
  if (members.length < 3) problems.push(`cast.members: a multi-character row needs at least 3 characters (plan 32 R6), got ${members.length}`);
  const seen = new Set<string>();
  members.forEach((member, at) => {
    const where = `cast.members[${at}]`;
    if (!isRecord(member)) { problems.push(`${where}: expected an object`); return; }
    if (!text(member.name) || !String(member.name).startsWith(`${marker} `)) problems.push(`${where}.name: expected "${marker} <Name>"`);
    if (!/^[a-z]+$/.test(String(member.short ?? ''))) problems.push(`${where}.short: expected a lowercase word (art folder and roster id)`);
    if (seen.has(String(member.short))) problems.push(`${where}.short: duplicate "${member.short}"`);
    seen.add(String(member.short));
    for (const key of ['variety', 'description', 'personality']) if (!text(member[key])) problems.push(`${where}.${key}: expected a non-empty string`);
    if (typeof member.first_mes !== 'string') problems.push(`${where}.first_mes: expected a string (empty for every member but one, or the group greets N times)`);
    const card = member.card;
    if (!isRecord(card) || !['field', 'quality', 'from', 'to'].every((key) => text(card[key])) || card.from === card.to) problems.push(`${where}.card: expected {field, quality, from, to} with from != to`);
    if (!Array.isArray(member.looks) || member.looks.length !== 5 || member.looks.some((look) => !text(look))) problems.push(`${where}.looks: expected exactly five visible changes (S32-2: 5 looks x 4 expressions)`);
  });
  const varieties = new Set(members.filter(isRecord).map((member) => member.variety));
  if (members.length >= 3 && varieties.size < 3) problems.push('cast.members: the variety axes must differ (plan 32 R6: glasses, hair over the eyes, a non-human face)');
  if (members.filter((member) => isRecord(member) && text(member.first_mes)).length > 1) problems.push('cast.members: at most one member greets');
  return problems;
}

export function parseCast(doc: unknown): Cast {
  const problems = validateCast(doc);
  if (problems.length) throw new Error(problems.join('; '));
  return doc as Cast;
}

export function cardBody(member: CastMember, template: Record<string, unknown>, marker: string): Record<string, string> {
  const body: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...template, ch_name: member.name, description: member.description, personality: member.personality,
    scenario: 'Sitting for a portrait in a quiet studio.', first_mes: member.first_mes, mes_example: '', alternate_greetings: [],
    creator_notes: `Throwaway Story Orchestrator image test cast (${member.variety}). Remove with: node scripts/debug/so-assets.mts remove --marker ${marker}`,
    tags: ['so-test', 'so-image-cast'] })) {
    body[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return body;
}

export interface ArtFile { member: string; kind: 'card' | 'expression'; label: string | null; path: string }

export function artPlan(cast: Cast, artDir: string): ArtFile[] {
  return cast.members.flatMap((member) => [
    { member: member.name, kind: 'card' as const, label: null, path: join(artDir, member.short, 'card.png') },
    ...cast.expressions.map((label) => ({ member: member.name, kind: 'expression' as const, label, path: join(artDir, member.short, `${label}.png`) })),
  ]);
}

export function parseCastBox(doc: unknown): CastBox | null {
  if (!doc || typeof doc !== 'object') return null;
  const box = doc as Record<string, unknown>;
  const values = [box.x, box.y, box.width, box.height];
  return values.every((value) => Number.isInteger(value) && (value as number) >= 0) && (box.width as number) > 0 && (box.height as number) > 0
    ? { x: box.x as number, y: box.y as number, width: box.width as number, height: box.height as number } : null;
}

export const boxFile = (artDir: string, member: CastMember) => join(artDir, member.short, 'box.json');

export function missingArt(plan: ArtFile[], exists: (path: string) => boolean): ArtFile[] {
  return plan.filter((file) => !exists(file.path));
}

export function castStory(cast: Cast) {
  const id = (member: CastMember) => member.short;
  return {
    format: 2, id: `${cast.marker.toLowerCase()}-cast`, title: `${cast.marker} cast session`,
    description: 'A synthetic multi-character portrait session: one visible change per member, independent of any campaign.',
    roster: cast.members.map((member) => ({ id: id(member), name: member.name, role: 'Portrait subject',
      card: { fields: { [member.card.field]: { quality: member.card.quality, visual: true } } } })),
    qualities: cast.members.map((member) => ({ key: member.card.quality, type: 'enum', values: [member.card.from, member.card.to], source: 'extractor',
      rubric: `${member.name}'s current ${member.card.field}, only when a visible change is established.`, evidence_from: 'world' })),
    requirements: { members: cast.members.map((member) => member.name) },
    checkpoints: [
      { id: 'start', name: 'Portrait', player_name: 'Portrait', type: 'anchor', start: true, objective: 'Pose for expression previews.', illustrate: false,
        effects: { stage: { framing: 'full', cast: Object.fromEntries(cast.members.map((member) => [id(member), { face: 'neutral' }])) } } },
      { id: 'change', name: 'New look', player_name: 'New look', type: 'anchor', objective: 'Show every established change in the portrait.', illustrate: false,
        effects: { card: Object.fromEntries(cast.members.map((member) => [id(member), { [member.card.field]: member.card.to }])),
          stage: { framing: 'full', cast: Object.fromEntries(cast.members.map((member) => [id(member), { face: 'neutral' }])) } } },
    ],
    transitions: [],
  };
}

export function frameJobs(labels: string[], kinds: string[], looks: string[]) {
  return [...labels.flatMap((label) => kinds.map((kind) => ({ label, kind, value: null as string | null }))),
    ...looks.flatMap((value) => labels.map((label) => ({ label, kind: 'look', value })))];
}

export function firstSeedRate(rows: Array<{ ok: boolean }>) {
  return rows.length ? rows.filter((row) => row.ok).length / rows.length : 0;
}
