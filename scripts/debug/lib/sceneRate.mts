import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { askClaude, type ModelReply } from './e0LabelRun.mts';
import { seededRandom } from './ratingPack.mts';
import { loadFrozen, OUTCOMES, readDrafts, writeJsonAtomic, type Asker, type Frontier, type Outcome } from './sceneReplay.mts';

export const PACK_FORMAT = 'so-scene-rate-pack/1';
export const KEY_FORMAT = 'so-scene-rate-key/1';
export const RATINGS_FORMAT = 'so-scene-ratings/1';
export const PACKS = ['honour', 'blind'] as const;
export type PackName = (typeof PACKS)[number];

export interface ItemContext { title: string; premise: string; tone: string | null; player: string; cast: string[]; canon: string; current: string; openThreads: string[] }
export interface BlindItem { id: string; context: ItemContext; expected: string; anchor: { name: string; objective: string } }
export interface HonourItem { id: string; context: ItemContext; expected: string; signal: string; anchor: { name: string; objective: string; changed?: string[]; advances?: string } }
export interface KeyRow { id: string; frontierId: string; outcome: Outcome }
export interface Rating { id: string; ok: boolean; answer: Record<string, unknown> | null; raw: string; rater: string | null; error?: string }

export function itemContext(frontier: Frontier): ItemContext {
  const story = frontier.story;
  const current = story.checkpoints.find((checkpoint: any) => checkpoint.id === frontier.frontierId);
  return {
    title: story.title, premise: story.living?.premise ?? story.description, tone: story.living?.tone ?? null, player: story.player?.role ?? 'the player',
    cast: story.roster.filter((member: any) => member.id !== 'narrator').map((member: any) => `${member.name} (${member.role})`),
    canon: frontier.inputs.canon, current: `"${current?.name ?? frontier.frontierId}" - ${current?.objective ?? ''}`, openThreads: frontier.inputs.openThreads,
  };
}

export const expectedContinuation = (record: { expected: { from: string; thread: string | null } }): string => (record.expected.thread
  ? `the next turning point continues the thread "${record.expected.thread}" on from "${record.expected.from}"`
  : `the next turning point continues on from "${record.expected.from}"`);

export const itemId = (seed: string, pack: PackName, frontierId: string, outcome: Outcome): string =>
  `${pack[0]}-${createHash('sha256').update(`${seed}\u0001${pack}\u0001${frontierId}\u0001${outcome}`).digest('hex').slice(0, 10)}`;

export function shuffled<T>(items: T[], seed: string): T[] {
  const random = seededRandom(seed);
  return items.map((item) => ({ item, order: random() })).sort((left, right) => left.order - right.order).map(({ item }) => item);
}

export function buildRatePacks(set: { frontiers: Frontier[] }, drafts: any[], seed: string) {
  const byId = new Map(set.frontiers.map((frontier) => [frontier.id, frontier]));
  const usable = drafts.filter((draft) => draft.delivered && byId.has(draft.frontierId));
  const missing = drafts.filter((draft) => !draft.delivered).map((draft) => ({ frontierId: draft.frontierId, outcome: draft.outcome, status: draft.status }));
  const blind = shuffled(usable.map((draft) => ({
    item: { id: itemId(seed, 'blind', draft.frontierId, draft.outcome), context: itemContext(byId.get(draft.frontierId) as Frontier), expected: expectedContinuation(draft.record), anchor: { name: draft.delivered.name, objective: draft.delivered.objective } } as BlindItem,
    key: { id: itemId(seed, 'blind', draft.frontierId, draft.outcome), frontierId: draft.frontierId, outcome: draft.outcome } as KeyRow,
  })), `blind:${seed}`);
  const honour = shuffled(usable.filter((draft) => draft.outcome !== 'expected' && draft.signal).map((draft) => ({
    item: {
      id: itemId(seed, 'honour', draft.frontierId, draft.outcome), context: itemContext(byId.get(draft.frontierId) as Frontier), expected: expectedContinuation(draft.record), signal: draft.signal,
      anchor: { name: draft.delivered.name, objective: draft.delivered.objective, ...(draft.delivered.changed ? { changed: draft.delivered.changed } : {}), ...(draft.delivered.advances ? { advances: draft.delivered.advances } : {}) },
    } as HonourItem,
    key: { id: itemId(seed, 'honour', draft.frontierId, draft.outcome), frontierId: draft.frontierId, outcome: draft.outcome } as KeyRow,
  })), `honour:${seed}`);
  return {
    blind: { pack: blind.map((entry) => entry.item), key: blind.map((entry) => entry.key) },
    honour: { pack: honour.map((entry) => entry.item), key: honour.map((entry) => entry.key) },
    missing,
  };
}

export function blindLeaks(items: BlindItem[], drafts: any[] = []): string[] {
  const leaks: string[] = [];
  const signals = drafts.map((draft) => draft.signal).filter(Boolean);
  for (const item of items) {
    if (JSON.stringify(Object.keys(item).sort()) !== JSON.stringify(['anchor', 'context', 'expected', 'id'])) leaks.push(`${item.id}: carries fields beyond id, context, expected and anchor`);
    if (JSON.stringify(Object.keys(item.anchor).sort()) !== JSON.stringify(['name', 'objective'])) leaks.push(`${item.id}: the anchor carries more than its name and objective`);
    const text = JSON.stringify(item);
    if (/Scene signal|"changed"|"advances"|\b(expected|altered|interrupt)-arm\b/i.test(text) || signals.some((signal) => text.includes(signal))) leaks.push(`${item.id}: names its arm or carries the signal`);
    if (OUTCOMES.some((outcome) => item.id.includes(outcome))) leaks.push(`${item.id}: the id names an arm`);
  }
  return leaks;
}

export function unblind<T extends { id: string }>(rows: T[], key: KeyRow[]): Array<T & { frontierId: string; outcome: Outcome }> {
  const byId = new Map(key.map((row) => [row.id, row]));
  const unknown = rows.filter((row) => !byId.has(row.id)).map((row) => row.id);
  if (unknown.length) throw new Error(`refused: ${unknown.length} rated id(s) are not in the key (${unknown.slice(0, 3).join(', ')})`);
  return rows.map((row) => ({ ...row, frontierId: (byId.get(row.id) as KeyRow).frontierId, outcome: (byId.get(row.id) as KeyRow).outcome }));
}

const contextText = (context: ItemContext) => [
  `Story: ${context.title}`,
  `Premise: ${context.premise}`,
  ...(context.tone ? [`Tone: ${context.tone}`] : []),
  `The player is: ${context.player}`,
  `Cast: ${context.cast.join('; ')}`,
  `Canon so far:\n${context.canon}`,
  `The current turning point: ${context.current}`,
  `Open threads the player is pursuing:\n${context.openThreads.map((thread) => `- ${thread}`).join('\n')}`,
].join('\n');

export function honourPrompt(item: HonourItem): string {
  return [
    'You rate one turning point written by a story director for an interactive story. The director was given a scene signal and had to follow it.',
    contextText(item.context),
    `Without a signal, ${item.expected}.`,
    `The signal the director was given:\n${item.signal}`,
    `The turning point it wrote:\nName: ${item.anchor.name}\nObjective: ${item.anchor.objective}`,
    ...(item.anchor.changed ? [`It declared "changed": ${JSON.stringify(item.anchor.changed)}`] : []),
    ...(item.anchor.advances ? [`It declared "advances": ${JSON.stringify(item.anchor.advances)}`] : []),
    'Judge two things. "honours": does the turning point actually do what the signal asks (an altered scene keeps the destination and the thread but really changes exactly one of place, who is present, timing or an obstacle; an interrupt has a world event first advance an existing open thread before the way to the destination resumes)? Judge the name and objective, not only the declared field. "world_side": is the change or the event caused by the world or the cast, never by the player\'s own act or decision?',
    'Return exact JSON only: {"honours": true|false, "world_side": true|false, "why": "<one sentence>"}',
  ].join('\n\n');
}

export function blindPrompt(item: BlindItem): string {
  return [
    'You rate one turning point written by a story director for an interactive story.',
    contextText(item.context),
    `The expected continuation: ${item.expected}.`,
    `The turning point:\nName: ${item.anchor.name}\nObjective: ${item.anchor.objective}`,
    'Judge three things. "agency_flag": true when the name or objective narrates, decides or assumes what the player says, chooses, feels or does (what the world and the cast do is fine). "surprising": true when it departs from the expected continuation in a way a reader would not simply predict. "coherent": true when it follows causally from the premise, the canon, the current turning point and the open threads, without contradiction.',
    'Return exact JSON only: {"agency_flag": true|false, "surprising": true|false, "coherent": true|false, "why": "<one sentence>"}',
  ].join('\n\n');
}

const FIELDS: Record<PackName, string[]> = { honour: ['honours', 'world_side'], blind: ['agency_flag', 'surprising', 'coherent'] };

export function parseRating(pack: PackName, id: string, reply: ModelReply): Rating {
  const text = reply.text;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  let answer: Record<string, unknown> | null = null;
  try {
    answer = start >= 0 && end > start ? JSON.parse(text.slice(start, end + 1)) : null;
  } catch {
    answer = null;
  }
  const missing = FIELDS[pack].filter((field) => typeof answer?.[field] !== 'boolean');
  return missing.length
    ? { id, ok: false, answer, raw: text, rater: reply.model, error: `missing boolean ${missing.join(', ')}` }
    : { id, ok: true, answer, raw: text, rater: reply.model };
}

export function plumbingRating(prompt: string): ModelReply {
  const coin = createHash('sha256').update(prompt).digest()[0] % 2 === 0;
  const text = prompt.includes('"honours"')
    ? JSON.stringify({ honours: true, world_side: true, why: 'plumbing' })
    : JSON.stringify({ agency_flag: false, surprising: coin, coherent: true, why: 'plumbing' });
  return { text, model: 'plumbing' };
}

export const plumbingRater: Asker = async (prompt) => plumbingRating(prompt);
export const claudeRater: Asker = (prompt, workDir) => askClaude(prompt, workDir);

const rateDir = (out: string, run: number) => join(out, `run${run}`, 'rate');
const readJson = async (file: string) => JSON.parse(await readFile(file, 'utf-8'));

export async function writeRatePacks({ out, run, seed, frontiersFile, lockFile }: { out: string; run: number; seed?: string; frontiersFile?: string; lockFile?: string }) {
  const { set, sha256 } = await loadFrozen(frontiersFile, lockFile);
  const drafts = await readDrafts(out, run);
  if (drafts.some((draft) => draft.frontiersSha256 !== sha256)) throw new Error('refused: some drafts were replayed on another frontier set');
  const usedSeed = seed ?? `v2.8-48-run${run}`;
  const packs = buildRatePacks(set, drafts, usedSeed);
  const leaks = blindLeaks(packs.blind.pack, drafts);
  if (leaks.length) throw new Error(`refused: the blind pack leaks its arm:\n${leaks.join('\n')}`);
  const dir = rateDir(out, run);
  await mkdir(dir, { recursive: true });
  const plumbing = drafts.some((draft) => draft.plumbing);
  for (const name of PACKS) {
    const file = join(dir, `${name}-pack.json`);
    const pack = { format: PACK_FORMAT, pack: name, run, blind: name === 'blind', plumbing, items: packs[name].pack };
    if (existsSync(file) && JSON.stringify((await readJson(file)).items) !== JSON.stringify(pack.items)) throw new Error(`refused: ${file} exists with other items; move it away to rebuild`);
    await writeJsonAtomic(file, pack);
    await writeJsonAtomic(join(dir, `${name}-key.json`), { format: KEY_FORMAT, pack: name, run, seed: usedSeed, rows: packs[name].key, missing: packs.missing });
  }
  return { run, seed: usedSeed, drafts: drafts.length, blind: packs.blind.pack.length, honour: packs.honour.pack.length, missing: packs.missing.length, plumbing };
}

export async function ratePacks({ out, run, plumbing, ask, log = console.log }: { out: string; run: number; plumbing: boolean; ask?: Asker; log?: (line: string) => void }) {
  const dir = rateDir(out, run);
  const rater = ask ?? (plumbing ? plumbingRater : claudeRater);
  const workDir = join(out, 'work');
  await mkdir(workDir, { recursive: true });
  const totals: Record<string, { rated: number; kept: number; failed: number }> = {};
  for (const name of PACKS) {
    const pack = await readJson(join(dir, `${name}-pack.json`));
    if (pack.plumbing && !plumbing) throw new Error(`refused: ${name} pack holds plumbing drafts; rate it with --plumbing`);
    const file = join(dir, `${name}-ratings.json`);
    const held = existsSync(file) ? await readJson(file) : { format: RATINGS_FORMAT, pack: name, run, plumbing, ratings: [] as Rating[] };
    if (held.plumbing !== plumbing) throw new Error(`refused: ${file} is ${held.plumbing ? 'plumbing' : 'a real rating'}; do not mix modes`);
    const done = new Map<string, Rating>(held.ratings.filter((rating: Rating) => rating.ok).map((rating: Rating) => [rating.id, rating]));
    totals[name] = { rated: 0, kept: done.size, failed: 0 };
    for (const item of pack.items) {
      if (done.has(item.id)) continue;
      const prompt = name === 'honour' ? honourPrompt(item) : blindPrompt(item);
      try {
        const rating = parseRating(name, item.id, await rater(prompt, workDir));
        if (rating.ok) {
          done.set(item.id, rating);
          totals[name].rated += 1;
        } else totals[name].failed += 1;
        log(`${name} ${item.id}: ${rating.ok ? 'rated' : rating.error}`);
      } catch (error) {
        totals[name].failed += 1;
        log(`${name} ${item.id}: failed (${error instanceof Error ? error.message : String(error)}); rerun to resume`);
      }
      await writeJsonAtomic(file, { ...held, ratings: [...done.values()] });
    }
    await writeJsonAtomic(file, { ...held, ratings: [...done.values()] });
  }
  return { run, plumbing, totals };
}
