import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { derivedPredict, labSet, loadDeriveKit, O3_VARIANT, realSet, speakersOf, type DeriveSet } from './witnessDerive.mts';

type Lookup = { state: string; heard: string; mixed: boolean; insideHeardSpan: boolean };
type Predict = (messageId: number, member: string, span?: [number, number]) => Lookup;
type Label = { messageId: number; present: string[]; heard: string[] | 'unknown'; spans?: unknown[]; review?: { writer: string; checker: string; agreed: boolean; adjudicator?: string; adjudicated?: boolean } | null };
type Labels = { format: string; set: string; synthetic: boolean; members: string[]; labels: Label[] };
type Member = { id: string; name: string; aliases?: string[] };
type Message = { messageId: number; speaker: string; text: string };
type Read = { readId: string; from: number; to: number; response?: string };
type Audit = { window?: { from: number; to: number }; sceneBreak?: { at: number; reason: string } };
type PresenceRow = { set: string; messageId: number; members: Record<string, number> | null };
type Counts = Record<string, number>;

export const CANDIDATE_RULES = { back: 24, present: 0.7, absent: 0.3 } as const;
export const CANDIDATES = ['w2', 'd1-scene-reset', 'd2-judge-exceptions', 'd3-abstain', 'o3-reference', 'ceiling:d2+oracle-exceptions'] as const;
export type Candidate = (typeof CANDIDATES)[number];

const SCENE_BREAK = /^SCENE_BREAK\s+at=(\d+)\s+reason=(time_skip|location|divider|cast)\s*$/gim;

export const breaksFromResponse = (response: string): number[] => [...response.matchAll(SCENE_BREAK)].map((match) => Number(match[1]));

export const breaksFromAudits = (audits: readonly Audit[], readTo: number): number[] =>
  [...new Set(audits.filter((audit) => audit.sceneBreak && audit.window && audit.window.to <= readTo).map((audit) => (audit.sceneBreak as { at: number }).at))].sort((a, b) => a - b);

export const breaksFromReads = (reads: readonly Read[], readTo: number): number[] =>
  [...new Set(reads.filter((read) => read.to <= readTo).flatMap((read) => breaksFromResponse(read.response ?? '')))].sort((a, b) => a - b);

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function nameTokens(members: readonly Member[]): Map<string, string> {
  const owners = new Map<string, Set<string>>();
  const add = (token: string, id: string) => {
    const key = token.trim();
    if (key.length < 3 || !/^[A-Z]/.test(key)) return;
    if (!owners.has(key)) owners.set(key, new Set());
    (owners.get(key) as Set<string>).add(id);
  };
  members.forEach((member) => [member.name, ...(member.aliases ?? [])].forEach((name) => {
    add(name, member.id);
    name.split(/\s+/).forEach((part) => add(part, member.id));
  }));
  return new Map([...owners].filter(([, ids]) => ids.size === 1).map(([token, ids]) => [token, [...ids][0]]));
}

export function seenBy(messages: readonly Message[], members: readonly Member[]): Map<number, Set<string>> {
  const ids = new Set(members.map((member) => member.id));
  const tokens = [...nameTokens(members)].map(([token, id]) => [new RegExp(`\\b${escape(token)}\\b`), id] as const);
  return new Map(messages.map((message) => {
    const seen = new Set<string>(ids.has(message.speaker) ? [message.speaker] : []);
    tokens.forEach(([pattern, id]) => { if (pattern.test(message.text)) seen.add(id); });
    return [message.messageId, seen];
  }));
}

export interface StageWindow { from: number; to: number; breaks: readonly number[] }

export function codeStage(seen: ReadonlyMap<number, ReadonlySet<string>>, messageId: number, window: StageWindow, back: number = CANDIDATE_RULES.back): Set<string> {
  const before = window.breaks.filter((at) => at <= messageId).at(-1);
  const after = window.breaks.find((at) => at > messageId);
  const low = Math.max(window.from - back, before ?? -Infinity);
  const high = Math.min(window.to, after === undefined ? Infinity : after - 1);
  const stage = new Set<string>();
  seen.forEach((ids, id) => { if (id >= low && id <= high) ids.forEach((member) => stage.add(member)); });
  return stage;
}

export type Fused = { present: string[]; disagree: string[]; band: string[] };

export function fusePresence(members: readonly string[], code: ReadonlySet<string>, p: Readonly<Record<string, number>> | null, rules = CANDIDATE_RULES): Fused {
  const present: string[] = [];
  const disagree: string[] = [];
  const band: string[] = [];
  for (const member of members) {
    const value = p?.[member];
    const judged = value === undefined ? null : value >= rules.present ? true : value < rules.absent ? false : null;
    if (judged === null ? code.has(member) : judged) present.push(member);
    if (judged !== null && judged !== code.has(member)) disagree.push(member);
    if (value !== undefined && judged === null) band.push(member);
  }
  return { present, disagree, band };
}

export const abstaining = (predict: Predict, abstain: ReadonlySet<number>): Predict => (messageId, member, span) => {
  const lookup = predict(messageId, member, span);
  return abstain.has(messageId) && !lookup.mixed ? { state: 'unknown', heard: 'unknown', mixed: false, insideHeardSpan: false } : lookup;
};

export interface CandidateSource {
  set: DeriveSet;
  breaksAt: (readTo: number) => number[];
  p1: ReadonlyMap<number, Record<string, number>>;
}

export interface CandidateInputs {
  d1: Map<number, string[]>;
  d2: Map<number, string[]>;
  abstain: Set<number>;
  exceptions: Map<number, string[]>;
  w2Stage: Map<number, Set<string>>;
  d1Stage: Map<number, Set<string>>;
  listeners: Map<number, string[]>;
  readOf: Map<number, Read>;
}

export function candidateInputs(source: CandidateSource): CandidateInputs {
  const { reads, omniscient } = source.set;
  const seen = seenBy(reads.messages, reads.members);
  const ids = reads.members.map((member) => member.id);
  const speaker = new Map(reads.messages.map((message) => [message.messageId, message.speaker]));
  const out: CandidateInputs = { d1: new Map(), d2: new Map(), abstain: new Set(), exceptions: new Map(), w2Stage: new Map(), d1Stage: new Map(), listeners: new Map(), readOf: new Map() };
  for (const read of reads.reads) reads.messages.filter((message) => message.messageId >= read.from && message.messageId <= read.to).forEach((message) => out.readOf.set(message.messageId, read));
  out.readOf.forEach((read, messageId) => {
    const enabled = source.set.enabledAt(read.to);
    const listeners = ids.filter((id) => enabled.includes(id) && !omniscient.includes(id) && id !== speaker.get(messageId));
    const d1 = codeStage(seen, messageId, { from: read.from, to: read.to, breaks: source.breaksAt(read.to) });
    const fused = fusePresence(ids, d1, source.p1.get(messageId) ?? null);
    out.listeners.set(messageId, listeners);
    out.w2Stage.set(messageId, codeStage(seen, messageId, { from: read.from, to: read.to, breaks: [] }));
    out.d1Stage.set(messageId, d1);
    out.d1.set(messageId, [...d1]);
    out.d2.set(messageId, fused.present);
    if (fused.disagree.some((member) => listeners.includes(member))) out.abstain.add(messageId);
    out.exceptions.set(messageId, [...fused.disagree, ...fused.band].filter((member) => listeners.includes(member)));
  });
  return out;
}

const bump = (counts: Counts, key: string, by = 1) => { counts[key] = (counts[key] ?? 0) + by; };

const kept = (set: Labels, label: Label) => {
  const review = label.review;
  if (set.synthetic) return true;
  if (!review || review.writer === review.checker) return false;
  return review.agreed || (review.adjudicated === true && Boolean(review.adjudicator) && review.adjudicator !== review.writer && review.adjudicator !== review.checker);
};

const p1Class = (value: number | undefined): string => (value === undefined ? 'none' : value >= CANDIDATE_RULES.present ? 'present' : value < CANDIDATE_RULES.absent ? 'absent' : 'band');

export function census(labels: Labels, inputs: CandidateInputs, p1: ReadonlyMap<number, Record<string, number>>) {
  const cells: Counts = {};
  const sources: Record<string, Counts> = { w2: {}, d1: {}, p1: {}, d2: {} };
  const messages: Counts = {};
  for (const label of labels.labels) {
    if (!kept(labels, label) || label.spans?.length || label.heard === 'unknown') continue;
    const listeners = inputs.listeners.get(label.messageId);
    if (!listeners) {
      bump(messages, 'no-read');
      continue;
    }
    bump(messages, 'single');
    if (listeners.every((member) => label.present.includes(member))) bump(messages, 'enabled-equals-present');
    if (inputs.abstain.has(label.messageId)) bump(messages, 'd3-abstains');
    if (inputs.exceptions.get(label.messageId)?.length) bump(messages, 'with-exception');
    inputs.exceptions.get(label.messageId)?.forEach((member) => bump(messages, label.present.includes(member) ? 'exception-pairs-present' : 'exception-pairs-absent'));
    for (const member of listeners) {
      const truth = label.present.includes(member);
      const value = p1.get(label.messageId)?.[member];
      const w2 = inputs.w2Stage.get(label.messageId)?.has(member) ?? false;
      const d1 = inputs.d1Stage.get(label.messageId)?.has(member) ?? false;
      const d2 = inputs.d2.get(label.messageId)?.includes(member) ?? false;
      bump(cells, `${truth ? 'present' : 'absent'}|w2:${w2 ? 'on' : 'off'}|d1:${d1 ? 'on' : 'off'}|p1:${p1Class(value)}`);
      const tally = (counts: Counts, predicted: boolean) => bump(counts, `${truth ? 'present' : 'absent'}->${predicted ? 'on' : 'off'}`);
      tally(sources.w2, w2);
      tally(sources.d1, d1);
      tally(sources.p1, value !== undefined && value >= CANDIDATE_RULES.present);
      tally(sources.d2, d2);
    }
  }
  return { messages, sources, cells };
}

export const oracleExceptions = (inputs: CandidateInputs, labels: Labels): Map<number, string[]> => {
  const truth = new Map(labels.labels.map((label) => [label.messageId, label.present]));
  return new Map([...inputs.d2].map(([messageId, present]) => {
    const asked = inputs.exceptions.get(messageId) ?? [];
    const known = truth.get(messageId);
    return [messageId, known ? [...present.filter((member) => !asked.includes(member)), ...asked.filter((member) => known.includes(member))] : present];
  }));
};

const readJson = async <T,>(file: string): Promise<T> => JSON.parse(await readFile(file, 'utf-8')) as T;

async function sessionAudits(root: string, setKey: string): Promise<Audit[]> {
  const dir = join(root, setKey);
  const name = (await readdir(dir)).filter((entry) => /^runtime-.+\.json$/.test(entry)).sort().at(-1);
  if (!name) return [];
  const runtime = await readJson<{ stories?: Record<string, { extras?: { extraction?: { audits?: Audit[] } } }> }>(join(dir, name));
  return Object.values(runtime.stories ?? {})[0]?.extras?.extraction?.audits ?? [];
}

const counts = (score: Record<string, unknown>) => {
  const ratio = (key: string) => { const value = score[key] as { hits: number; of: number }; return `${value.hits}/${value.of}`; };
  const ambiguous = score.ambiguous as { pairs: number; predictedHeard: number };
  return { verdict: score.verdict, ...Object.fromEntries(['exactSet', 'falseInclusion', 'falseExclusion', 'coverage', 'mixedDetection', 'spanFalseInclusion', 'asideExactSet'].map((key) => [key, ratio(key)])), ambiguousHeard: `${ambiguous.predictedHeard}/${ambiguous.pairs}`, states: score.states };
};

const mergeCounts = (into: Counts, from: Counts) => Object.entries(from).forEach(([key, value]) => bump(into, key, value));

export async function candidatesAll(out: string, root: string, presenceFile: string, labStory?: string) {
  const kit = await loadDeriveKit();
  const rows = (await readJson<{ rows: PresenceRow[] }>(presenceFile)).rows;
  const dir = join(out, 'reads', 'files');
  const files = (await readdir(dir)).filter((name) => name.endsWith('.json')).sort();
  const scores: Record<'real' | 'lab', Record<Candidate, Array<ReturnType<typeof kit.scoreWitness>>>> = {
    real: Object.fromEntries(CANDIDATES.map((id) => [id, []])) as never, lab: Object.fromEntries(CANDIDATES.map((id) => [id, []])) as never,
  };
  const diagnosis = { real: { messages: {}, sources: { w2: {}, d1: {}, p1: {}, d2: {} }, cells: {} }, lab: { messages: {}, sources: { w2: {}, d1: {}, p1: {}, d2: {} }, cells: {} } } as Record<'real' | 'lab', ReturnType<typeof census>>;
  const breakSource: Record<'real' | 'lab', Counts> = { real: {}, lab: {} };
  for (const name of files) {
    const lab = name.startsWith('lab__');
    const labelFile = lab ? join(out, 'adjudicated', 'lab.json') : join(out, 'adjudicated', 'labels', basename(name));
    if (!existsSync(labelFile)) continue;
    const key = lab ? 'lab' : 'real';
    const labels = await readJson<Labels>(labelFile);
    const set = lab ? await labSet(join(dir, name), labStory) : await realSet(root, join(dir, name));
    const rawReads = (await readJson<{ reads: Read[] }>(join(dir, name))).reads;
    const audits = lab ? [] : await sessionAudits(root, set.reads.set);
    const breaksAt = (readTo: number) => (lab ? breaksFromReads(rawReads, readTo) : breaksFromAudits(audits, readTo));
    rawReads.forEach((read) => {
      const reach = lab ? rawReads.filter((entry) => entry.to <= read.to).length : audits.filter((audit) => audit.window && audit.window.to <= read.to && audit.window.to >= read.from - CANDIDATE_RULES.back).length;
      bump(breakSource[key], reach ? 'reads-with-break-source' : 'reads-without-break-source');
      bump(breakSource[key], 'breaks-seen', breaksAt(read.to).filter((at) => at >= read.from - CANDIDATE_RULES.back && at <= read.to).length);
    });
    const p1 = new Map(rows.filter((row) => row.set === set.reads.set && row.members).map((row) => [row.messageId, row.members as Record<string, number>]));
    const inputs = candidateInputs({ set, breaksAt, p1 });
    const found = census(labels, inputs, p1);
    mergeCounts(diagnosis[key].messages, found.messages);
    mergeCounts(diagnosis[key].cells, found.cells);
    Object.entries(found.sources).forEach(([source, value]) => mergeCounts(diagnosis[key].sources[source], value));
    const options = { ...kit.DERIVE_DEFAULTS };
    const rule = { speakers: speakersOf(set, labels) };
    const o3 = new Map([...p1].map(([messageId, p]) => [messageId, Object.entries(p).filter(([, value]) => value >= CANDIDATE_RULES.present).map(([member]) => member)]));
    const predictors: Record<Candidate, Predict> = {
      w2: derivedPredict(kit, set, options, 24),
      'd1-scene-reset': derivedPredict(kit, { ...set, presentAt: inputs.d1 }, options, 24),
      'd2-judge-exceptions': derivedPredict(kit, { ...set, presentAt: inputs.d2 }, options, 24),
      'd3-abstain': abstaining(derivedPredict(kit, { ...set, presentAt: inputs.d2 }, options, 24), inputs.abstain),
      'o3-reference': derivedPredict(kit, { ...set, presentAt: o3 }, options, O3_VARIANT.context),
      'ceiling:d2+oracle-exceptions': derivedPredict(kit, { ...set, presentAt: oracleExceptions(inputs, labels) }, options, 24),
    };
    CANDIDATES.forEach((id) => scores[key][id].push(kit.scoreWitness(labels as never, predictors[id], rule)));
  }
  const combined = (key: 'real' | 'lab') => Object.fromEntries(CANDIDATES.map((id) => [id, scores[key][id].length ? counts(kit.combineWitnessScores(`${key}:${id}`, scores[key][id]) as never) : null]));
  return { format: 'so-witness-candidates/1', speakerOwnHeard: true, rules: CANDIDATE_RULES, presence: presenceFile, breakSource, real: combined('real'), lab: combined('lab'), diagnosis };
}
