import { existsSync } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { evaluateStop, interleave, stopRecord, withOneRetry, type StopDeclaration, type StopFloor, type StopItem, type StopRecord, type Trial } from './stopRule.mts';
import { fileOf, loadWitreal, readDir, readJson, selectRealSessions, writeJson, type ChatRow } from './witreal.mts';

export type WitnessArm = 'on' | 'off';
export type StChatRow = { name: string; mes: string; is_user?: boolean; is_system?: boolean };
export type RecordSpec = { story: unknown; chat: StChatRow[]; from: number; to: number; state: unknown | null; activeCheckpointId?: string; present: string[] | null; debugResponse?: string };
export type RecordResult = {
  prompt: string; rawResponse: string; inputTokens: number; outputTokens: number;
  calls: Array<{ finish: string; ms: number; maxTokens: number | null; model: string | null }>;
  window: { from: number; to: number }; scope: number; rejected: number; witness: { status?: string } | null;
};
export type Runner = (spec: RecordSpec) => Promise<RecordResult>;

export type PlannedRead = { readId: string; from: number; to: number; presentIds: string[]; presentNames: string[]; state: unknown | null; activeCheckpointId?: string };
export type PlannedSet = {
  key: string; story: unknown; chat: StChatRow[]; members: Array<{ id: string; name: string; aliases: string[] }>;
  messages: Array<{ messageId: number; speaker: string; text: string }>; reads: PlannedRead[];
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export const READS_PER_WINDOW = [[0, 7], [4, 11]] as const;
export const LAB_READ_SIZE = 8;

export function stChat(rows: readonly ChatRow[]): StChatRow[] {
  const last = Math.max(-1, ...rows.map((row) => row.id));
  const chat: StChatRow[] = Array.from({ length: last + 1 }, () => ({ name: '', mes: '', is_system: true }));
  rows.forEach((row) => { chat[row.id] = { name: row.name, mes: row.text, is_user: row.isUser, is_system: row.isSystem === true }; });
  return chat;
}

type Roster = Array<{ id: string; name: string; aliases: string[] }>;

export function rosterOf(story: unknown): Roster {
  const rows = isObject(story) && Array.isArray(story.roster) ? story.roster.filter(isObject) : [];
  return rows.filter((row) => typeof row.id === 'string').map((row) => ({
    id: row.id as string, name: typeof row.name === 'string' ? row.name : row.id as string,
    aliases: Array.isArray(row.aliases) ? row.aliases.filter((alias): alias is string => typeof alias === 'string') : [],
  }));
}

export function membersFor(names: readonly string[], roster: Roster) {
  return names.map((name) => {
    const entry = roster.find((row) => row.name.toLowerCase() === name.toLowerCase());
    return { id: name, name, aliases: entry ? [entry.id, ...entry.aliases].filter((alias) => alias.toLowerCase() !== name.toLowerCase()) : [], rosterId: entry?.id ?? null };
  });
}

export function stateAt(runtime: unknown, messageId: number): unknown | null {
  const stories = isObject(runtime) && isObject(runtime.stories) ? Object.values(runtime.stories).filter(isObject) : [];
  const logOf = (story: Record<string, unknown>) => (isObject(story.engineHistory) && Array.isArray(story.engineHistory.log) ? story.engineHistory.log.filter(isObject) : []);
  const story = [...stories].sort((left, right) => logOf(right).length - logOf(left).length)[0];
  if (!story) return null;
  const at = (entry: Record<string, unknown>) => (isObject(entry.context) && typeof entry.context.lastMessageId === 'number' ? entry.context.lastMessageId : -1);
  const log = logOf(story).filter((entry) => at(entry) >= 0).sort((left, right) => at(left) - at(right));
  const last = log.filter((entry) => at(entry) <= messageId).at(-1);
  return (last?.after ?? log[0]?.before ?? null) as unknown | null;
}

export function pinnedStoryOf(runtime: unknown): unknown | null {
  const stories = isObject(runtime) && isObject(runtime.stories) ? Object.values(runtime.stories).filter(isObject) : [];
  const logOf = (story: Record<string, unknown>) => (isObject(story.engineHistory) && Array.isArray(story.engineHistory.log) ? story.engineHistory.log.length : 0);
  return [...stories].sort((left, right) => logOf(right) - logOf(left))[0]?.pinnedStory ?? null;
}

async function runtimeOf(root: string, session: string): Promise<unknown> {
  const dir = join(root, session);
  const names = (await readdir(dir)).filter((name) => /^runtime-.+\.json$/.test(name)).sort();
  if (!names.length) throw new Error(`${session}: no runtime file`);
  return readJson(join(dir, names.at(-1) as string));
}

export async function planReal(root: string): Promise<PlannedSet[]> {
  const kit = await loadWitreal() as unknown as { witnessWindow(rows: ChatRow[]): number[] };
  const { sessions } = await selectRealSessions(root);
  const sets: PlannedSet[] = [];
  for (const { session, rows, context } of sessions) {
    const runtime = await runtimeOf(root, session);
    const story = pinnedStoryOf(runtime);
    const members = membersFor(context.members, rosterOf(story));
    const window = kit.witnessWindow(rows);
    const presentIds = members.flatMap((member) => (member.rosterId ? [member.rosterId] : []));
    const reads = READS_PER_WINDOW.map(([first, last], index) => ({
      readId: `${session}#r${index + 1}`, from: window[first], to: window[Math.min(last, window.length - 1)], presentIds, presentNames: context.members, state: stateAt(runtime, window[Math.min(last, window.length - 1)]),
    }));
    sets.push({
      key: session, story, chat: stChat(rows), members: members.map(({ id, name, aliases }) => ({ id, name, aliases })),
      messages: rows.filter((row) => !row.isSystem).map((row) => ({ messageId: row.id, speaker: row.isUser ? context.player : row.name, text: row.text })), reads,
    });
  }
  return sets;
}

type LabRow = { index: number; scene: string; speaker: string; text: string; presence: string[] };

export async function planLab(labRowsFile: string, labStoryFile: string): Promise<PlannedSet> {
  const raw = await readJson<{ members: string[]; rows: LabRow[] }>(labRowsFile);
  const story = await readJson(labStoryFile);
  const roster = rosterOf(story);
  const members = membersFor(raw.members, roster);
  const rows: ChatRow[] = raw.rows.map((row) => ({ id: row.index, name: row.speaker === 'player' ? 'Player' : row.speaker, isUser: row.speaker === 'player', text: row.text }));
  const reads: PlannedRead[] = [];
  for (let start = 0; start < raw.rows.length; start += LAB_READ_SIZE) {
    const slice = raw.rows.slice(start, start + LAB_READ_SIZE);
    const last = slice[slice.length - 1];
    const names = last.presence.filter((name) => raw.members.includes(name));
    reads.push({
      readId: `lab#r${reads.length + 1}`, from: slice[0].index, to: last.index, presentNames: names,
      presentIds: names.flatMap((name) => members.find((member) => member.name === name)?.rosterId ?? []), state: null, activeCheckpointId: last.scene,
    });
  }
  return {
    key: 'lab/witness-f4', story, chat: stChat(rows), members: members.map(({ id, name, aliases }) => ({ id, name, aliases })),
    messages: rows.map((row) => ({ messageId: row.id, speaker: row.name, text: row.text })), reads,
  };
}

export type ReadRecord = { plumbing?: boolean; readId: string; arm: WitnessArm; from: number; to: number; present: string[] | null; status: string; inputTokens: number; outputTokens: number; calls: RecordResult['calls']; response: string; scope: number; rejected: number };

function specFor(set: PlannedSet, read: PlannedRead, arm: WitnessArm, plumbing?: (read: PlannedRead) => string): RecordSpec {
  return {
    story: set.story, chat: set.chat, from: read.from, to: read.to, state: read.state, present: arm === 'on' ? read.presentIds : null,
    ...(read.activeCheckpointId ? { activeCheckpointId: read.activeCheckpointId } : {}),
    ...(plumbing ? { debugResponse: plumbing(read) } : {}),
  };
}

function recordOf(read: PlannedRead, arm: WitnessArm, result: RecordResult, plumbing: boolean): ReadRecord {
  return {
    ...(plumbing ? { plumbing: true } : {}),
    readId: read.readId, arm, from: read.from, to: read.to, present: arm === 'on' ? read.presentNames : null, status: result.witness?.status ?? (arm === 'off' ? 'off' : 'outage'),
    inputTokens: result.inputTokens, outputTokens: result.outputTokens, calls: result.calls, response: result.rawResponse, scope: result.scope, rejected: result.rejected,
  };
}

const armFile = (out: string, arm: WitnessArm, key: string) => join(out, 'reads', arm, fileOf(key));

async function loadRecords(out: string, arm: WitnessArm, key: string): Promise<ReadRecord[]> {
  const file = armFile(out, arm, key);
  return existsSync(file) ? (await readJson<{ records: ReadRecord[] }>(file)).records : [];
}

export async function recordSet(set: PlannedSet, arm: WitnessArm, run: Runner, out: string, log: (line: string) => void = console.log, plumbing?: (read: PlannedRead) => string) {
  await mkdir(join(out, 'reads', arm), { recursive: true });
  const records = await loadRecords(out, arm, set.key);
  for (const read of set.reads) {
    if (records.some((entry) => entry.readId === read.readId)) continue;
    const result = await run(specFor(set, read, arm, plumbing));
    records.push(recordOf(read, arm, result, Boolean(plumbing)));
    await writeJson(armFile(out, arm, set.key), { key: set.key, arm, records });
    log(`record ${arm} ${read.readId}: ${result.calls.map((call) => call.finish).join(',')}`);
  }
  return records;
}

export const WITNESS_STOP_FLOORS: readonly StopFloor[] = [
  { id: 'exactSet', rate: 0.9, direction: 'atLeast' },
  { id: 'falseInclusion', rate: 0.02, direction: 'atMost' },
  { id: 'falseExclusion', rate: 0.1, direction: 'atMost' },
  { id: 'coverage', rate: 0.85, direction: 'atLeast' },
];

export const witnessDeclaration = (N: number): StopDeclaration => ({ N, floors: [...WITNESS_STOP_FLOORS], zeroFloors: ['asideKeptOut'], needsAll: true });

export type ReadScorer = (set: PlannedSet, record: ReadRecord) => Promise<Record<string, Trial>>;
export type RecordAllResult = { sets: number; planned: number; records: Record<string, number>; stopped: StopRecord | null; noStop: boolean };

export const stopFile = (out: string) => join(out, 'reads', 'stop.json');

export async function recordAll(sets: readonly PlannedSet[], arms: readonly WitnessArm[], run: Runner, out: string, options: { log?: (line: string) => void; plumbing?: (read: PlannedRead) => string; score?: ReadScorer; noStop?: boolean } = {}): Promise<RecordAllResult> {
  const log = options.log ?? console.log;
  const noStop = options.noStop === true;
  if (!noStop && existsSync(stopFile(out))) {
    const prior = await readJson<StopRecord>(stopFile(out));
    throw new Error(`refused: this run stopped ${prior.stopped} at ${prior.at} (${prior.reason}); a stopped run is never resumed to change a result (a full run is --no-stop into a fresh --out)`);
  }
  const units = sets.flatMap((set) => set.reads.map((read) => ({ set, read })));
  const declaration = witnessDeclaration(units.length);
  const store = new Map<string, ReadRecord[]>();
  for (const set of sets) for (const arm of arms) store.set(`${arm}:${set.key}`, await loadRecords(out, arm, set.key));
  for (const arm of arms) await mkdir(join(out, 'reads', arm), { recursive: true });
  const items: StopItem[] = [];
  const counts: Record<string, number> = Object.fromEntries(arms.map((arm) => [arm, 0]));
  let stopped: StopRecord | null = null;
  let pair: Partial<Record<WitnessArm, ReadRecord>> = {};
  let broken: string | null = null;
  for (const slot of interleave(units, arms)) {
    const { set, read } = slot.unit;
    const records = store.get(`${slot.arm}:${set.key}`) as ReadRecord[];
    const done = records.find((entry) => entry.readId === read.readId);
    if (done) pair[slot.arm] = done;
    else if (!broken) {
      const attempt = await withOneRetry(() => run(specFor(set, read, slot.arm, options.plumbing)));
      if (attempt.ok === true) {
        const record = recordOf(read, slot.arm, attempt.value, Boolean(options.plumbing));
        records.push(record);
        pair[slot.arm] = record;
        await writeJson(armFile(out, slot.arm, set.key), { key: set.key, arm: slot.arm, records });
        log(`record ${slot.arm} ${read.readId}: ${attempt.value.calls.map((call) => call.finish).join(',')}${attempt.retried ? ' (after one retry)' : ''}`);
      } else {
        broken = `${slot.arm} ${read.readId}: ${attempt.error}`;
        log(`record ${slot.arm} ${read.readId}: harness error after one retry: ${attempt.error}`);
      }
    }
    if (pair[slot.arm]) counts[slot.arm] += 1;
    if (!slot.last) continue;
    const on = pair.on;
    items.push(broken ? { plumbing: true, retried: true, error: broken } : { metrics: on && !on.plumbing && options.score ? await options.score(set, on) : {} });
    pair = {};
    const decision = evaluateStop(declaration, items);
    if (broken || (!noStop && decision.stop)) {
      stopped = stopRecord(decision);
      if (stopped) {
        await writeJson(stopFile(out), stopped);
        log(`stopped ${stopped.stopped} at ${stopped.at}: ${stopped.reason}`);
      }
      break;
    }
  }
  return { sets: sets.length, planned: units.length, records: counts, stopped, noStop };
}

type Ratio = { hits: number; of: number; rate: number | null };
type LabelSet = { format: string; set: string; synthetic: boolean; members: string[]; labels: Array<{ messageId: number }> };
export type WitnessScoreKit = {
  replayWitnessReads(reads: unknown[], messages: unknown[], roster: unknown[], present?: string[]): { state: unknown };
  revisionOf(message: unknown): unknown;
  witnessLookup(state: unknown, member: string, messageId: number, span?: [number, number], live?: unknown): unknown;
  scoreWitness(set: unknown, predict: (messageId: number, member: string, span?: [number, number]) => unknown): {
    exactSet: Ratio; falseInclusion: Ratio; falseExclusion: Ratio; coverage: Ratio; asideKeptOutIncluded: number;
  };
};

export function scoreOneRead(kit: WitnessScoreKit, labels: LabelSet, set: PlannedSet, record: ReadRecord): Record<string, Trial> {
  const window = { ...labels, labels: labels.labels.filter((label) => label.messageId >= record.from && label.messageId <= record.to) };
  if (!window.labels.length) return {};
  const { state } = kit.replayWitnessReads(readsFile(set, [record]).reads, set.messages, set.members);
  const live = new Map(set.messages.map((message) => [message.messageId, kit.revisionOf(message)]));
  const score = kit.scoreWitness(window, (messageId, member, span) => kit.witnessLookup(state, member, messageId, span, live.get(messageId) ?? null));
  const trial = (ratio: Ratio) => ({ hits: ratio.hits, of: ratio.of });
  return {
    exactSet: trial(score.exactSet), falseInclusion: trial(score.falseInclusion), falseExclusion: trial(score.falseExclusion), coverage: trial(score.coverage),
    asideKeptOut: score.asideKeptOutIncluded,
  };
}

export async function witnessReadScorer(labelFiles: readonly string[]): Promise<ReadScorer> {
  const kit = (await (await import('./witness.mts')).loadWitness()) as unknown as WitnessScoreKit;
  const sets = new Map<string, LabelSet>();
  for (const file of labelFiles) {
    const labels = await readJson<LabelSet>(file);
    sets.set(labels.set, labels);
  }
  return async (set, record) => {
    const labels = sets.get(set.key);
    return labels ? scoreOneRead(kit, labels, set, record) : {};
  };
}

export function readsFile(set: PlannedSet, records: readonly ReadRecord[]) {
  return {
    format: 'so-witness-reads/1', set: set.key, synthetic: false, ...(records.some((record) => record.plumbing) ? { plumbing: true } : {}), members: set.members, messages: set.messages,
    reads: records.filter((record) => record.arm === 'on').map((record) => ({
      readId: record.readId, from: record.from, to: record.to, status: record.status === 'accepted' || record.status === 'no-read' ? record.status : 'outage', present: record.present ?? undefined, response: record.response,
    })),
  };
}

const p95 = (values: readonly number[]): number | null => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)] : null;
};

export const WC_FLOORS = { addedInputP95: 120, addedOutputP95: 160, lengthRateSlack: 0.01, latencyRatio: 1.15 } as const;

export function wcFrom(on: readonly ReadRecord[], off: readonly ReadRecord[]) {
  const pairs = on.flatMap((read) => {
    const base = off.find((entry) => entry.readId === read.readId);
    return base ? [{ read, base }] : [];
  });
  const latency = (record: ReadRecord) => record.calls.reduce((sum, call) => sum + call.ms, 0);
  const lengthRate = (records: readonly ReadRecord[]) => {
    const calls = records.flatMap((record) => record.calls);
    const hits = calls.filter((call) => call.finish === 'length').length;
    return { hits, of: calls.length, rate: calls.length ? hits / calls.length : null };
  };
  const addedInput = p95(pairs.map(({ read, base }) => read.inputTokens - base.inputTokens));
  const addedOutput = p95(pairs.map(({ read, base }) => read.outputTokens - base.outputTokens));
  const onLength = lengthRate(pairs.map(({ read }) => read));
  const offLength = lengthRate(pairs.map(({ base }) => base));
  const onRate = onLength.rate;
  const offRate = offLength.rate;
  const onLatency = p95(pairs.map(({ read }) => latency(read)));
  const offLatency = p95(pairs.map(({ base }) => latency(base)));
  const floors = {
    addedInputP95: addedInput === null ? null : addedInput <= WC_FLOORS.addedInputP95,
    addedOutputP95: addedOutput === null ? null : addedOutput <= WC_FLOORS.addedOutputP95,
    lengthRate: onRate === null || offRate === null ? null : onRate <= offRate + WC_FLOORS.lengthRateSlack + 1e-9,
    latencyP95: onLatency === null || offLatency === null ? null : onLatency <= offLatency * WC_FLOORS.latencyRatio + 1e-9,
  };
  return { pairs: pairs.length, addedInputP95: addedInput, addedOutputP95: addedOutput, lengthRate: { on: onLength, off: offLength }, latencyP95: { on: onLatency, off: offLatency, pairs: pairs.length }, floors, liveSuite: 'owed (separate so-live-suite run)' };
}

export async function readAll(out: string, arm: WitnessArm): Promise<Map<string, { key: string; records: ReadRecord[] }>> {
  return readDir<{ records: ReadRecord[] }>(join(out, 'reads', arm)) as Promise<Map<string, { key: string; records: ReadRecord[] }>>;
}

export async function planAll(root: string, labRows?: string, labStory?: string): Promise<PlannedSet[]> {
  return [...await planReal(root), ...(labRows && labStory ? [await planLab(labRows, labStory)] : [])];
}

export async function writeReadsFiles(sets: readonly PlannedSet[], out: string, allowPlumbing = false) {
  const on = await readAll(out, 'on');
  const planted = [...on.values()].filter((entry) => entry.records.some((record) => record.plumbing)).map((entry) => entry.key);
  if (planted.length && !allowPlumbing) throw new Error(`refused: plumbing records in ${planted.join(', ')}; pass --plumbing to write them (never scored)`);
  const dir = join(out, 'reads', 'files');
  await mkdir(dir, { recursive: true });
  let written = 0;
  for (const set of sets) {
    const records = on.get(set.key)?.records ?? [];
    if (!records.length) continue;
    await writeJson(join(dir, fileOf(set.key)), readsFile(set, records));
    written += 1;
  }
  return { written };
}

export async function wcAll(out: string) {
  const on = [...(await readAll(out, 'on')).values()].flatMap((entry) => entry.records);
  if (on.some((record) => record.plumbing)) throw new Error('refused: plumbing records are never a Wc measurement');
  const off = [...(await readAll(out, 'off')).values()].flatMap((entry) => entry.records);
  return wcFrom(on, off);
}

export const plumbingReply = (read: PlannedRead): string =>
  ['NO_DELTA', ...Array.from({ length: read.to - read.from + 1 }, (_, index) => `WITNESS m=${read.from + index} heard=all-present`)].join('\n');
