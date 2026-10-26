import { seededRandom } from './ratingPack.mts';

export const PILOT_ARMS = ['sdxl-directed', 'qwen-refs', 'composite'] as const;
export type PilotArm = typeof PILOT_ARMS[number];
export const ARM_ROUTE: Record<PilotArm, 'sdxl' | 'qwen' | null> = { 'sdxl-directed': 'sdxl', 'qwen-refs': 'qwen', composite: null };
export const COMPOSITE_SKIPPED = 'composite arm skipped: the extension has no sprite-on-plate compositing route yet (plan 20 stage 5), so it cannot be rendered without new code';
export const DEFAULT_SEEDS = [101, 202];
export const DUPLICATE_SHARE = 0.1;

export interface PilotCase {
  id: string; members: string[]; view: string; light: string; lines: Array<[string, string]>; moment: string; set?: Record<string, string>;
}
export interface PilotCases { frozen: string; looks: Record<string, Record<string, string>>; cases: PilotCase[] }
export interface PilotJob { case: string; seed: number; arm: PilotArm }
export interface PilotRow extends PilotJob {
  file: string | null; error: string | null; ms: number; members: string[]; looks: Record<string, string>; moment: string; record: Record<string, unknown> | null;
}
export interface RefImage { member: string; look: string; file: string }

const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

export function parsePilotCases(value: unknown): PilotCases {
  const raw = value as Partial<PilotCases> | null;
  if (!raw || !isText(raw.frozen) || !Array.isArray(raw.cases) || typeof raw.looks !== 'object' || !raw.looks) throw new Error('pilot cases: expected {frozen, looks, cases[]}');
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const row of raw.cases) {
    const at = isText(row?.id) ? row.id : `#${raw.cases.indexOf(row)}`;
    if (!isText(row?.id) || ids.has(row.id)) problems.push(`${at}: missing or duplicate id`);
    ids.add(row?.id);
    if (!Array.isArray(row?.members) || row.members.length < 1 || row.members.length > 2 || !row.members.every(isText)) problems.push(`${at}: members must be one or two roster ids`);
    if (!Array.isArray(row?.lines) || !row.lines.length || !row.lines.every((line) => Array.isArray(line) && line.length === 2 && line.every(isText))) problems.push(`${at}: lines must be [speaker, text] pairs`);
    else if (row.lines[row.lines.length - 1][0] === 'player' || !row.members.includes(row.lines[row.lines.length - 1][0])) problems.push(`${at}: the last line must be a reply by a member of the case`);
    if (!isText(row?.moment) || !isText(row?.view) || !isText(row?.light)) problems.push(`${at}: moment, view and light are required`);
  }
  if (raw.cases.length !== 12) problems.push(`expected 12 frozen cases, found ${raw.cases.length}`);
  if (problems.length) throw new Error(`pilot cases: ${problems.join('; ')}`);
  return raw as PilotCases;
}

export function pilotJobs(cases: PilotCase[], seeds: number[], arms: PilotArm[]): { jobs: PilotJob[]; skipped: string[] } {
  const rendered = arms.filter((arm) => ARM_ROUTE[arm]);
  const jobs = cases.flatMap((row) => seeds.flatMap((seed) => rendered.map((arm) => ({ case: row.id, seed, arm }))));
  return { jobs, skipped: arms.includes('composite') ? [COMPOSITE_SKIPPED] : [] };
}

export const lookFor = (row: PilotCase, member: string, looks: PilotCases['looks']): string => {
  const set = Object.entries(row.set ?? {}).find(([key]) => key.startsWith(`${member}_`))?.[1];
  return set ? Object.entries(looks[member] ?? {}).find(([, value]) => value === set)?.[0] ?? set : 'default';
};

export const imageFileName = (job: PilotJob) => `${job.case}-s${job.seed}-${job.arm}.png`;

export function shuffled<T>(items: readonly T[], seed: string): T[] {
  const random = seededRandom(seed);
  return items.map((item) => ({ item, order: random() })).sort((left, right) => left.order - right.order).map(({ item }) => item);
}

const letter = (index: number) => String.fromCharCode(65 + index);

export interface BlindItem { label: string; file: string; row: PilotRow; duplicateOf: string | null }
export interface BlindPack {
  items: BlindItem[]; refs: Array<RefImage & { label: string }>; missing: PilotRow[]; itemsTxt: string; brief: string;
  key: { seed: string; frozen: string; skipped: string[]; items: Array<Record<string, unknown>>; refs: Array<Record<string, unknown>>; missing: Array<Record<string, unknown>> };
}

const describe = (label: string, row: PilotRow, refLabel: (member: string, look: string) => string) => {
  const chars = row.members.map((member) => refLabel(member, 'default')).join(', ');
  const outfits = row.members.map((member) => `${refLabel(member, 'default')}: ${row.looks[member] === 'default' ? `as in ${refLabel(member, 'default')}`
    : `as in ${refLabel(member, row.looks[member])} (changed look)`}`).join('; ');
  return `- ${label}: characters expected: ${chars}; outfit: ${outfits}; intended moment: ${row.moment}`;
};

export function buildBlindPack(input: { rows: PilotRow[]; refs: RefImage[]; seed: string; frozen: string; skipped: string[]; names: Record<string, string> }): BlindPack {
  const done = input.rows.filter((row) => row.file && !row.error);
  const missing = input.rows.filter((row) => !row.file || row.error);
  const duplicates = shuffled(done, `dup:${input.seed}`).slice(0, Math.round(done.length * DUPLICATE_SHARE));
  const entries = shuffled([...done.map((row) => ({ row, duplicate: false })), ...duplicates.map((row) => ({ row, duplicate: true }))], `order:${input.seed}`);
  const width = String(entries.length).length < 2 ? 2 : String(entries.length).length;
  const labelled = entries.map((entry, index) => ({ ...entry, label: `img-${String(index + 1).padStart(width, '0')}.png` }));
  const originals = new Map(labelled.filter((entry) => !entry.duplicate).map((entry) => [entry.row, entry.label]));
  const items: BlindItem[] = labelled.map((entry) => ({ label: entry.label, file: entry.row.file as string, row: entry.row,
    duplicateOf: entry.duplicate ? originals.get(entry.row) ?? null : null }));
  const refs = input.refs.map((ref, index) => ({ ...ref, label: `ref-${letter(index)}.png` }));
  const refLabel = (member: string, look: string) => (refs.find((ref) => ref.member === member && ref.look === look) ?? refs.find((ref) => ref.member === member))?.label.replace(/\.png$/, '') ?? member;
  const itemsTxt = `${items.map((item) => describe(item.label, item.row, refLabel)).join('\n')}\n`;
  const refLines = refs.map((ref) => `- \`${ref.label}\` = ${input.names[ref.member] ?? ref.member}${ref.look === 'default' ? '' : ` in a changed look (${ref.look})`}: an accepted on-screen sprite, the identity authority.`);
  const brief = pilotBrief(refLines, items.length);
  return {
    items, refs, missing, itemsTxt, brief,
    key: {
      seed: input.seed, frozen: input.frozen, skipped: input.skipped,
      items: items.map((item) => ({ label: item.label, case: item.row.case, seed: item.row.seed, arm: item.row.arm, src: item.file, duplicateOf: item.duplicateOf,
        route: (item.row.record?.route as unknown) ?? null, record: item.row.record })),
      refs: refs.map((ref) => ({ label: ref.label, member: ref.member, look: ref.look, src: ref.file })),
      missing: missing.map((row) => ({ case: row.case, seed: row.seed, arm: row.arm, error: row.error })),
    },
  };
}

export function pilotBrief(refLines: string[], count: number): string {
  return [
    '# Blind rating brief: story illustrations vs character sprites',
    '',
    'Do not open `..\\key.json`, or any file outside this folder. It holds the answer key.',
    '',
    '## Material (this folder only)',
    '',
    ...refLines,
    `- \`img-01.png\` … \`img-${String(count).padStart(String(count).length < 2 ? 2 : String(count).length, '0')}.png\`: story illustrations, shuffled. They come from more than one method, and the method is hidden.`,
    '- `items.txt`: for each image, which characters should appear, which outfit each should wear (by reference) and the intended moment.',
    '',
    'All images are synthetic test characters (an anime-style lighthouse story). Open every image yourself; do not guess from file names.',
    '',
    '## Scale',
    '',
    'Score 1–5 for every dimension: 1 = wrong or absent, 2 = mostly wrong, 3 = partly right, 4 = right with small slips, 5 = right.',
    '',
    '## Per image, per expected character',
    '',
    '1. **Face match to the sprite.** Face shape, eye colour, eye style, skin tone.',
    '2. **Hair match.** Colour, length, cut.',
    '3. **Body proportions and build.** Age read, height, build.',
    '4. **Outfit match** to the outfit named in `items.txt`.',
    '5. **Overall "same person as the sprite"**: yes / no / unsure.',
    '',
    'If an expected character is missing, score them 1 and note "absent". If an unexpected extra person appears, note it.',
    '',
    '## Per image',
    '',
    '6. **Action fidelity** to the intended moment.',
    '7. **Cast-count fidelity.** The right number of people, and no merged or swapped identities.',
    '8. **Background/setting fidelity.** A storm-bound lighthouse interior unless the moment says otherwise.',
    '9. **Pose and composition.** Does the pose fit the action, rather than a stiff standing reference pose?',
    '10. **Style match to the sprites.** Line, shading, palette.',
    '11. **Anatomy and artifacts.** Hands, limbs, stray text, extra people, cut-offs. 5 = clean.',
    '12. **Worth interrupting the story for.** Would a player be glad this picture appeared at that moment? 1–5.',
    '13. One line of the main defect, or "none".',
    '',
    '## Across images',
    '',
    '14. For each character, group the images showing them and score **cross-picture consistency** (1–5).',
    '15. Name the 3 best and the 3 worst images, with one reason each.',
    '',
    '## Output',
    '',
    'Write `ratings.json`: one object per image with the fields above, keyed by label, plus a `consistency` object and a `best_worst` object.',
    'Also write a short `ratings.md` summary. Keep the method hidden: do not speculate about which tool made which image.',
    '',
  ].join('\n');
}
