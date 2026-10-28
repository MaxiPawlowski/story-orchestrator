import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { loadEntry } from './bundleEntry.mts';

type Lookup = { state: string; heard: string; mixed: boolean; insideHeardSpan: boolean };
type Ratio = { hits: number; of: number; rate: number | null };
type Score = { verdict: string; messages: number; ambiguous: { pairs: number; predictedHeard: number }; exactSet: Ratio; falseInclusion: Ratio; falseExclusion: Ratio; coverage: Ratio; mixedDetection: Ratio; spanFalseInclusion: Ratio; asideExactSet: Ratio } & Record<string, unknown>;
type Labels = { format: string; set: string; synthetic: boolean; members: string[]; labels: unknown[] };
type Member = { id: string; name: string; aliases?: string[] };
type Message = { messageId: number; speaker: string; text: string; swipeId?: number };
type Read = { readId: string; from: number; to: number; present?: string[] };
type Reads = { set: string; members: Member[]; messages: Message[]; reads: Read[] };
export type DeriveOptions = { stage: 'enabled' | 'appeared'; omniscient: 'speaker-only' | 'always'; mention: boolean; lookahead: boolean; asides: boolean };
export type Context = 'window' | 'session' | number;
export type CastEntry = { effect: string; at: string; status?: string; target?: { member?: string }; before?: { disabled?: boolean }; after?: { disabled?: boolean } };
export type DeriveSet = { reads: Reads; omniscient: string[]; enabledAt: (messageId: number) => string[]; presentAt?: ReadonlyMap<number, string[]> };

interface DeriveKit {
  DERIVE_DEFAULTS: DeriveOptions;
  deriveWitnessAudit(input: unknown, options: DeriveOptions): unknown;
  acceptWitnessRead(state: unknown, readId: string, audit: unknown): unknown;
  createWitness(): unknown;
  witnessLookup(state: unknown, member: string, messageId: number, span?: [number, number], live?: unknown): Lookup;
  revisionOf(message: Message): unknown;
  scoreWitness(set: Labels, predict: (messageId: number, member: string, span?: [number, number]) => Lookup, options?: { speakers?: ReadonlyMap<number, string> }): Score;
  combineWitnessScores(set: string, scores: Score[]): Score;
  presencePredict(set: Labels): (messageId: number, member: string, span?: [number, number]) => Lookup;
}

export const loadDeriveKit = () => loadEntry<DeriveKit>('scripts/debug/lib/witnessEntry.ts');

const readJson = async <T,>(file: string): Promise<T> => JSON.parse(await readFile(file, 'utf-8')) as T;

const cardName = (member: string | undefined) => (member ?? '').replace(/\.[a-z0-9]+$/i, '');

export function castEnabled(ledger: readonly CastEntry[], members: readonly string[], sentAt: (messageId: number) => string | null): (messageId: number) => string[] {
  const cast = ledger.filter((entry) => entry.effect === 'cast' && entry.target?.member).sort((left, right) => left.at.localeCompare(right.at));
  const initial = new Map<string, boolean>();
  cast.forEach((entry) => { if (!initial.has(cardName(entry.target?.member))) initial.set(cardName(entry.target?.member), entry.before?.disabled === true); });
  return (messageId) => {
    const at = sentAt(messageId);
    const disabled = new Map(initial);
    if (at) cast.filter((entry) => entry.at <= at).forEach((entry) => disabled.set(cardName(entry.target?.member), entry.after?.disabled === true));
    return members.filter((member) => disabled.get(member) !== true);
  };
}

export function derivedPredict(kit: DeriveKit, set: DeriveSet, options: DeriveOptions, context: Context) {
  const ids = new Set(set.reads.members.map((member) => member.id));
  const members = set.reads.members.map((member) => ({ id: member.id, names: [member.name, ...(member.aliases ?? [])], omniscient: set.omniscient.includes(member.id) }));
  const messages = set.reads.messages.map((message) => ({ messageId: message.messageId, text: message.text, swipeId: message.swipeId, speaker: ids.has(message.speaker) ? message.speaker : null, ...(set.presentAt?.has(message.messageId) ? { present: set.presentAt.get(message.messageId) } : {}) }));
  let state = kit.createWitness();
  for (const read of set.reads.reads) {
    const rows = messages.filter((message) => message.messageId <= read.to && (context === 'session' || message.messageId >= read.from - (typeof context === 'number' ? context : 0)));
    const audit = kit.deriveWitnessAudit({ from: read.from, to: read.to, messages: rows, members, enabled: set.enabledAt(read.to) }, options);
    state = kit.acceptWitnessRead(state, `derive:${read.readId}`, audit);
  }
  const live = new Map(set.reads.messages.map((message) => [message.messageId, kit.revisionOf(message)]));
  return (messageId: number, member: string, span?: [number, number]) => kit.witnessLookup(state, member, messageId, span, live.get(messageId) ?? null);
}

const counts = (score: Score) => ({
  ...Object.fromEntries((['exactSet', 'falseInclusion', 'falseExclusion', 'coverage', 'mixedDetection', 'spanFalseInclusion', 'asideExactSet'] as const)
    .map((key) => [key, `${score[key].hits}/${score[key].of}`])),
  ambiguousHeard: `${score.ambiguous.predictedHeard}/${score.ambiguous.pairs}`,
});

export const VARIANTS: Array<{ id: string; options: Partial<DeriveOptions>; context: Context; oracle?: boolean }> = [
  { id: 'enabled', options: { stage: 'enabled', asides: false }, context: 'window' },
  { id: 'enabled+asides', options: { stage: 'enabled' }, context: 'window' },
  { id: 'stage-window', options: { asides: false }, context: 'window' },
  { id: 'stage-window+asides', options: {}, context: 'window' },
  { id: 'stage-session', options: { asides: false }, context: 'session' },
  { id: 'stage-session+asides', options: {}, context: 'session' },
  { id: 'stage-back24+asides', options: {}, context: 24 },
  { id: 'stage-back40+asides', options: {}, context: 40 },
  { id: 'stage-back40', options: { asides: false }, context: 40 },
  { id: 'stage-session-spoke', options: { mention: false }, context: 'session' },
  { id: 'stage-session-noahead', options: { lookahead: false }, context: 'session' },
  { id: 'diagnostic:labelled-presence', options: { asides: false }, context: 'window', oracle: true },
  { id: 'diagnostic:labelled-presence+asides', options: {}, context: 'window', oracle: true },
];

export const labelledPresence = (labels: Labels): Map<number, string[]> =>
  new Map((labels.labels as Array<{ messageId: number; present: string[] }>).map((label) => [label.messageId, label.present]));

export async function realSet(root: string, readsFile: string): Promise<DeriveSet> {
  const reads = await readJson<Reads>(readsFile);
  const dir = join(root, reads.set);
  const runtimeName = (await readdir(dir)).filter((name) => /^runtime-.+\.json$/.test(name)).sort().at(-1);
  const chatName = (await readdir(dir)).find((name) => /^chat-full-.+\.json$/.test(name));
  const runtime = runtimeName ? await readJson<{ stories?: Record<string, { pinnedStory?: { roster?: Array<{ name?: string; view?: string }> }; extras?: { effects?: { ledger?: CastEntry[] } } }> }>(join(dir, runtimeName)) : {};
  const story = Object.values(runtime.stories ?? {})[0];
  const chat = chatName ? await readJson<Array<{ id: number; sendDate?: string }>>(join(dir, chatName)) : [];
  const sent = new Map(chat.map((row) => [row.id, row.sendDate ?? null]));
  const omniscient = (story?.pinnedStory?.roster ?? []).filter((row) => row.view === 'omniscient' && row.name).map((row) => row.name as string);
  return { reads, omniscient, enabledAt: castEnabled(story?.extras?.effects?.ledger ?? [], reads.members.map((member) => member.id), (id) => sent.get(id) ?? null) };
}

export async function labSet(readsFile: string, labStory?: string): Promise<DeriveSet> {
  const reads = await readJson<Reads>(readsFile);
  const roster = labStory && existsSync(labStory) ? (await readJson<{ roster?: Array<{ name?: string; view?: string }> }>(labStory)).roster ?? [] : [];
  const omniscient = roster.filter((row) => row.view === 'omniscient' && row.name).map((row) => row.name as string);
  const byEnd = new Map(reads.reads.map((read) => [read.to, read.present ?? reads.members.map((member) => member.id)]));
  return { reads, omniscient, enabledAt: (messageId) => byEnd.get(messageId) ?? reads.members.map((member) => member.id) };
}

export const speakersOf = (set: DeriveSet, labels: Labels): Map<number, string> =>
  new Map(set.reads.messages.filter((message) => labels.members.includes(message.speaker)).map((message) => [message.messageId, message.speaker]));

export async function deriveScoreAll(out: string, root: string, labStory?: string, speakerOwn = false) {
  const kit = await loadDeriveKit();
  const dir = join(out, 'reads', 'files');
  const labelDir = join(out, 'adjudicated', 'labels');
  const files = (await readdir(dir)).filter((name) => name.endsWith('.json')).sort();
  const real: Array<{ labels: Labels; set: DeriveSet }> = [];
  let lab: { labels: Labels; set: DeriveSet } | null = null;
  for (const name of files) {
    if (name.startsWith('lab__')) {
      lab = { labels: await readJson<Labels>(join(out, 'adjudicated', 'lab.json')), set: await labSet(join(dir, name), labStory) };
      continue;
    }
    const labelFile = join(labelDir, basename(name));
    if (existsSync(labelFile)) real.push({ labels: await readJson<Labels>(labelFile), set: await realSet(root, join(dir, name)) });
  }
  const rule = (labels: Labels, set: DeriveSet) => (speakerOwn ? { speakers: speakersOf(set, labels) } : {});
  const variants = [];
  for (const variant of VARIANTS) {
    for (const omniscient of ['speaker-only', 'always'] as const) {
      const options = { ...kit.DERIVE_DEFAULTS, ...variant.options, omniscient };
      const withOracle = (labels: Labels, set: DeriveSet): DeriveSet => (variant.oracle ? { ...set, presentAt: labelledPresence(labels) } : set);
      const realScore = kit.combineWitnessScores('real-sessions', real.map(({ labels, set }) => kit.scoreWitness(labels, derivedPredict(kit, withOracle(labels, set), options, variant.context), rule(labels, set))));
      const labScore = lab ? kit.scoreWitness(lab.labels, derivedPredict(kit, withOracle(lab.labels, lab.set), options, variant.context), rule(lab.labels, lab.set)) : null;
      variants.push({ id: variant.id, omniscient, context: variant.context, options, real: { verdict: realScore.verdict, ...counts(realScore) }, lab: labScore ? { verdict: labScore.verdict, ...counts(labScore) } : null });
    }
  }
  const control = kit.combineWitnessScores('real-sessions-presence', real.map(({ labels, set }) => kit.scoreWitness(labels, kit.presencePredict(labels), rule(labels, set))));
  const labControl = lab ? kit.scoreWitness(lab.labels, kit.presencePredict(lab.labels), rule(lab.labels, lab.set)) : null;
  return {
    format: 'so-witness-derive-score/1', speakerOwnHeard: speakerOwn, sets: { real: real.length, lab: Boolean(lab) }, variants,
    presence: { real: counts(control), lab: labControl ? counts(labControl) : null },
  };
}
