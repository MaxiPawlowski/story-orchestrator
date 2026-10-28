import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { derivedPredict, labSet, loadDeriveKit, realSet, speakersOf, type DeriveSet } from './witnessDerive.mts';

type Lookup = { state: string; heard: string; mixed: boolean; insideHeardSpan: boolean };
type Predict = (messageId: number, member: string, span?: [number, number]) => Lookup;
type Label = { messageId: number; present: string[]; heard: string[] | 'unknown'; spans?: Array<{ span: [number, number]; heard: string[] | 'unknown' }>; review?: { writer: string; checker: string; agreed: boolean; adjudicator?: string; adjudicated?: boolean } | null };
type Labels = { format: string; set: string; synthetic: boolean; members: string[]; labels: Label[] };
type Counts = Record<string, number>;

export interface DiagnoseContext {
  speaker: (messageId: number) => string | null;
  enabled: (messageId: number) => readonly string[];
  omniscient: readonly string[];
  speakerOwn?: boolean;
}

export interface Diagnosis {
  messages: Counts;
  exact: Counts;
  falseInclusion: Counts;
  falseExclusion: Counts;
  noAnswer: Counts;
  ambiguous: Counts;
  mixed: Counts;
  spanFalseInclusion: Counts;
}

const bump = (counts: Counts, key: string, by = 1) => { counts[key] = (counts[key] ?? 0) + by; };

const kept = (set: Labels, label: Label) => {
  const review = label.review;
  if (set.synthetic) return true;
  if (!review || review.writer === review.checker) return false;
  return review.agreed || (review.adjudicated === true && Boolean(review.adjudicator) && review.adjudicator !== review.writer && review.adjudicator !== review.checker);
};

export function inclusionClass(member: string, label: Label, context: DiagnoseContext): string {
  if (!context.enabled(label.messageId).includes(member)) return 'disabled';
  if (context.omniscient.includes(member)) return 'omniscient';
  if (!label.present.includes(member)) return 'offstage';
  return 'aside';
}

export function diagnoseWitness(set: Labels, predict: Predict, context: DiagnoseContext): Diagnosis {
  const out: Diagnosis = { messages: {}, exact: {}, falseInclusion: {}, falseExclusion: {}, noAnswer: {}, ambiguous: {}, mixed: {}, spanFalseInclusion: {} };
  for (const label of set.labels) {
    if (!kept(set, label)) {
      bump(out.messages, 'dropped');
      continue;
    }
    const speaker = context.speaker(label.messageId);
    const lookups = new Map(set.members.map((member) => [member, predict(label.messageId, member)] as const));
    const first = lookups.get(set.members[0]) as Lookup;
    if (label.spans?.length) {
      bump(out.messages, 'mixed');
      bump(out.mixed, first.mixed ? 'flagged' : `missed:${first.state === 'classified' ? 'single-set' : first.state}`);
      for (const span of label.spans) {
        if (span.heard === 'unknown') continue;
        const heard = span.heard;
        for (const member of set.members.filter((entry) => !heard.includes(entry))) {
          const lookup = predict(label.messageId, member, span.span);
          if (lookup.state === 'classified' && lookup.heard === 'yes') bump(out.spanFalseInclusion, inclusionClass(member, { ...label, present: label.present }, context));
        }
      }
      continue;
    }
    if (label.heard === 'unknown') {
      bump(out.messages, 'unknown');
      for (const member of set.members) {
        const lookup = lookups.get(member) as Lookup;
        if (lookup.state !== 'classified' || lookup.heard !== 'yes') continue;
        if (member === speaker) bump(out.ambiguous, context.speakerOwn ? 'speaker (not counted)' : 'speaker');
        else bump(out.ambiguous, inclusionClass(member, label, context));
      }
      continue;
    }
    bump(out.messages, 'single');
    const heard = label.heard;
    const causes = new Set<string>();
    for (const member of set.members) {
      const lookup = lookups.get(member) as Lookup;
      const value = lookup.state === 'classified' ? lookup.heard : 'unknown';
      if (value === 'unknown') {
        bump(out.noAnswer, lookup.state === 'classified' ? (lookup.mixed ? 'flagged-mixed' : 'heard-unknown') : lookup.state);
        causes.add('no-answer');
      } else if (value === 'yes' && !heard.includes(member)) {
        const kind = inclusionClass(member, label, context);
        bump(out.falseInclusion, kind);
        causes.add(`fi:${kind}`);
      } else if (value === 'no' && heard.includes(member)) {
        const kind = member === speaker ? 'speaker' : 'present';
        bump(out.falseExclusion, kind);
        causes.add(`fe:${kind}`);
      }
    }
    if (!causes.size) bump(out.exact, 'hit');
    else if (causes.has('no-answer')) bump(out.exact, 'uncovered');
    else bump(out.exact, `miss:${[...causes].sort().join('+')}`);
  }
  return out;
}

const merge = (left: Diagnosis, right: Diagnosis): Diagnosis =>
  Object.fromEntries(Object.keys(left).map((key) => {
    const total: Counts = { ...left[key as keyof Diagnosis] };
    Object.entries(right[key as keyof Diagnosis]).forEach(([name, value]) => bump(total, name, value));
    return [key, total];
  })) as unknown as Diagnosis;

const readJson = async <T,>(file: string): Promise<T> => JSON.parse(await readFile(file, 'utf-8')) as T;

type RawRead = { readId: string; from: number; to: number; status: string; present?: string[]; response: string };
type RawReads = { members: Array<{ id: string; name: string; aliases?: string[] }>; present?: string[]; messages: Array<{ messageId: number; speaker: string; text: string; swipeId?: number }>; reads: RawRead[] };

interface ReplayKit {
  replayWitnessReads(reads: RawRead[], messages: RawReads['messages'], roster: RawReads['members'], present?: string[]): { state: unknown; rejected: Array<{ reason: string }> };
  witnessLookup(state: unknown, member: string, messageId: number, span?: [number, number], live?: unknown): Lookup;
  revisionOf(message: RawReads['messages'][number]): unknown;
  presencePredict(set: Labels): Predict;
  DERIVE_DEFAULTS: Record<string, unknown>;
}

async function modelPredict(file: string): Promise<{ predict: Predict; rejected: Counts; lines: Counts }> {
  const kit = (await loadDeriveKit()) as unknown as ReplayKit;
  const raw = await readJson<RawReads>(file);
  const { state, rejected } = kit.replayWitnessReads(raw.reads, raw.messages, raw.members, raw.present);
  const live = new Map(raw.messages.map((message) => [message.messageId, kit.revisionOf(message)]));
  const lines: Counts = {};
  raw.reads.forEach((read) => read.response.split(/\r?\n/).map((line) => line.trim()).forEach((line) => {
    if (line.startsWith('SPAN')) bump(lines, 'span');
    else if (!line.includes('WITNESS')) return;
    else if (/\bmixed\b/.test(line)) bump(lines, 'mixed');
    else bump(lines, /heard=all-present/.test(line) ? 'all-present' : /heard=unknown/.test(line) ? 'unknown' : 'member-list');
  }));
  const reasons: Counts = {};
  rejected.forEach((entry) => bump(reasons, entry.reason));
  return { predict: (messageId, member, span) => kit.witnessLookup(state, member, messageId, span, live.get(messageId) ?? null), rejected: reasons, lines };
}

const contextOf = (set: DeriveSet, labels: Labels, speakerOwn: boolean): DiagnoseContext => {
  const speakers = speakersOf(set, labels);
  return { speaker: (messageId) => speakers.get(messageId) ?? null, enabled: set.enabledAt, omniscient: set.omniscient, speakerOwn };
};

export async function diagnoseAll(out: string, root: string, labStory?: string) {
  const kit = (await loadDeriveKit()) as unknown as ReplayKit & Parameters<typeof derivedPredict>[0];
  const dir = join(out, 'reads', 'files');
  const files = (await readdir(dir)).filter((name) => name.endsWith('.json')).sort();
  const designs = ['w4-model-read', 'w2-shipped', 'presence-control'] as const;
  const totals: Record<'real' | 'lab', Record<string, Diagnosis | null>> = { real: {}, lab: {} };
  const lines: Record<'real' | 'lab', Counts> = { real: {}, lab: {} };
  const rejected: Record<'real' | 'lab', Counts> = { real: {}, lab: {} };
  for (const name of files) {
    const lab = name.startsWith('lab__');
    const labelFile = lab ? join(out, 'adjudicated', 'lab.json') : join(out, 'adjudicated', 'labels', basename(name));
    if (!existsSync(labelFile)) continue;
    const labels = await readJson<Labels>(labelFile);
    const set = lab ? await labSet(join(dir, name), labStory) : await realSet(root, join(dir, name));
    const context = contextOf(set, labels, false);
    const model = await modelPredict(join(dir, name));
    const key = lab ? 'lab' : 'real';
    Object.entries(model.lines).forEach(([line, value]) => bump(lines[key], line, value));
    Object.entries(model.rejected).forEach(([reason, value]) => bump(rejected[key], reason, value));
    const predictors: Record<(typeof designs)[number], Predict> = {
      'w4-model-read': model.predict,
      'w2-shipped': derivedPredict(kit, set, { ...kit.DERIVE_DEFAULTS } as never, 24),
      'presence-control': kit.presencePredict(labels),
    };
    for (const design of designs) {
      const diagnosis = diagnoseWitness(labels, predictors[design], context);
      const current = totals[key][design];
      totals[key][design] = current ? merge(current, diagnosis) : diagnosis;
    }
  }
  return { format: 'so-witness-diagnose/1', scoredUnder: 'recorded rule (unknown-label speaker counts)', w4Lines: lines, w4Rejected: rejected, designs: totals };
}
