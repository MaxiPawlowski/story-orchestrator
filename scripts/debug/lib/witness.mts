import { readFile } from 'node:fs/promises';
import { loadEntry } from './bundleEntry.mts';

export const READS_FORMAT = 'so-witness-reads/1';

type Lookup = { state: string; heard: string; mixed: boolean; insideHeardSpan: boolean };
type Ratio = { hits: number; of: number; rate: number | null };
type Score = { verdict: 'pass' | 'fail' | 'insufficient'; messages: number; dropped: number; asideExactSet: Ratio; floors: Record<string, boolean | null> } & Record<string, unknown>;
type Member = { id: string; name: string; aliases?: string[] };
type Message = { messageId: number; speaker: string; text: string; swipeId?: number };
type Read = { readId: string; from: number; to: number; status: 'accepted' | 'no-read' | 'outage'; present?: string[]; response: string };
type Reads = { format: string; set: string; synthetic: boolean; members: Member[]; present?: string[]; messages: Message[]; reads: Read[] };
type Labels = { format: string; set: string; synthetic: boolean; members: string[]; labels: unknown[] };

interface WitnessModule {
  WITNESS_LABELS_FORMAT: string;
  WITNESS_FLOORS: Record<string, number>;
  revisionOf(message: Message): unknown;
  witnessLookup(state: unknown, member: string, messageId: number, span?: [number, number], live?: unknown): Lookup;
  scoreWitness(set: Labels, predict: (messageId: number, member: string, span?: [number, number]) => Lookup): Score;
  presencePredict(set: Labels): (messageId: number, member: string, span?: [number, number]) => Lookup;
  nullControlBeaten(score: Score, control: Score): boolean | null;
  replayWitnessReads(reads: Read[], messages: Message[], roster: Member[], present?: string[]): { state: { reads: Array<{ status: string; claims: unknown[] }> }; rejected: Array<{ readId: string; reason: string }> };
}

export const loadWitness = () => loadEntry<WitnessModule>('scripts/debug/lib/witnessEntry.ts');

const readJson = async (file: string) => JSON.parse(await readFile(file, 'utf-8'));

const STATUSES = ['accepted', 'no-read', 'outage'];

export function checkReads(raw: unknown): Reads {
  const reads = raw as Reads;
  if (!reads || reads.format !== READS_FORMAT) throw new Error(`reads file is not ${READS_FORMAT}`);
  if (typeof reads.synthetic !== 'boolean') throw new Error('reads file: synthetic must be true or false');
  if (!Array.isArray(reads.members) || !reads.members.every((member) => typeof member?.id === 'string' && typeof member.name === 'string')) throw new Error('reads file: members must be [{id, name}]');
  if (!Array.isArray(reads.messages) || !reads.messages.every((message) => Number.isSafeInteger(message?.messageId) && typeof message.text === 'string' && typeof message.speaker === 'string')) {
    throw new Error('reads file: messages must be [{messageId, speaker, text, swipeId?}]');
  }
  const bad = (reads.reads ?? []).find((read) => typeof read?.readId !== 'string' || !Number.isSafeInteger(read.from) || !Number.isSafeInteger(read.to) || !STATUSES.includes(read.status) || typeof read.response !== 'string');
  if (!Array.isArray(reads.reads) || bad) throw new Error(`reads file: invalid read ${bad ? JSON.stringify(bad.readId) : ''}`.trim());
  return reads;
}

const tally = (values: string[]) => values.reduce<Record<string, number>>((counts, value) => ({ ...counts, [value]: (counts[value] ?? 0) + 1 }), {});

export async function scoreReads(labelsFile: string, readsFile: string) {
  const witness = await loadWitness();
  const labels = (await readJson(labelsFile)) as Labels;
  if (labels?.format !== witness.WITNESS_LABELS_FORMAT) throw new Error(`labels file is not ${witness.WITNESS_LABELS_FORMAT}`);
  const reads = checkReads(await readJson(readsFile));
  const { state, rejected } = witness.replayWitnessReads(reads.reads, reads.messages, reads.members, reads.present);
  const live = new Map(reads.messages.map((message) => [message.messageId, witness.revisionOf(message)]));
  const predict = (messageId: number, member: string, span?: [number, number]) => witness.witnessLookup(state, member, messageId, span, live.get(messageId) ?? null);
  const score = witness.scoreWitness(labels, predict);
  const control = witness.scoreWitness(labels, witness.presencePredict(labels));
  const beaten = witness.nullControlBeaten(score, control);
  const verdict = score.verdict === 'insufficient' ? 'insufficient' : score.verdict === 'fail' || beaten === false ? 'fail' : 'pass';
  return {
    plan: 'v2.8 42 B',
    labels: labels.set,
    reads: reads.set,
    synthetic: labels.synthetic && reads.synthetic,
    floors: witness.WITNESS_FLOORS,
    counts: {
      labels: labels.labels.length, kept: score.messages, dropped: score.dropped, messages: reads.messages.length,
      reads: tally(reads.reads.map((read) => read.status)),
      claims: state.reads.reduce((sum, read) => sum + read.claims.length, 0),
      rejectedLines: rejected.length,
    },
    rejected: tally(rejected.map((entry) => entry.reason)),
    witness: score,
    nullControl: control,
    nullControlBeaten: beaten,
    verdict,
  };
}
