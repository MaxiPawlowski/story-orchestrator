import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { seededRandom } from './ratingPack.mts';
import { buildBlind, ratio, type BlindKey, type BlindPack, type StoredLabel } from './blindRater.mts';
import {
  canonicalHash, castOf, clearStep, fill, generateStep, helpersStep, lastRequest, lineStep, memberBlock, readJson, scenarioDoc, unsafeText,
  type Capture, type Cast, type Line, type RecordJob, type Step,
} from './replyCapture.mts';

export const VOICING_DIR = resolve(import.meta.dirname, '..', '..', '..', 'test', 'measurements', 'v2.8', '44-voicing');
export const VOICING_CASES = join(VOICING_DIR, 'cases.json');
export const VOICING_G14 = join(VOICING_DIR, 'g14-fixture.json');
export const VOICING_FREEZE = join(VOICING_DIR, 'freeze.json');
export const VOICING_FORMAT = 'so-v44-voicing/1';
export const VOICING_CASE_COUNT = 20;
export const VOICING_FLOORS = { g7ReceivedUsedMin: 0.7, g7LiftMin: 0.3, g8HeardMin: 0.8 } as const;
export const VOICING_FLOOR_TEXT = 'G7: received version used >= 0.7 on the on arm and on minus off >= +0.3; G8: received claim presented as heard >= 0.8; off baseline reported beside each. Informational, never retuned (plan 44 §6).';
export const ARMS = ['on', 'off'] as const;
export type Arm = typeof ARMS[number];
const TRUTHS = ['true', 'false', 'unknown'];
const HEARD = /\b(heard|hear tell|they say|people say|folk say|word is|told me|someone said|someone says|rumou?rs?|gossip|so they say|i'm told|i am told|supposedly|apparently)\b/i;

export interface VoicingCase {
  id: string;
  subject: string;
  truth: string;
  origin: string;
  originNeedles: string[];
  received: string;
  receivedNeedles: string[];
  transcript: Line[];
}

export interface VoicingFixture { format: string; synthetic: boolean; plan: string; cases: VoicingCase[] }

const lower = (text: string) => text.toLowerCase();
export const hasAll = (text: string, needles: string[]) => needles.length > 0 && needles.every((needle) => lower(text).includes(lower(needle)));
const hasAny = (text: string, needles: string[]) => needles.some((needle) => lower(text).includes(lower(needle)));

export function voicingProblems(fixture: VoicingFixture, cast: Cast = castOf()): string[] {
  const problems: string[] = [];
  if (fixture?.format !== VOICING_FORMAT) problems.push(`format is ${JSON.stringify(fixture?.format)}, expected ${VOICING_FORMAT}`);
  if (fixture?.synthetic !== true) problems.push('the fixture is not marked synthetic');
  const cases = Array.isArray(fixture?.cases) ? fixture.cases : [];
  if (cases.length !== VOICING_CASE_COUNT) problems.push(`${cases.length} case(s), plan 44 G7 needs ${VOICING_CASE_COUNT}`);
  const ids = new Set<string>();
  for (const entry of cases) {
    const at = `case ${entry?.id ?? '?'}`;
    if (!/^[a-z0-9-]+$/.test(String(entry?.id ?? ''))) problems.push(`${at}: id is not a lowercase slug`);
    if (ids.has(entry.id)) problems.push(`${at}: duplicate id`);
    ids.add(entry.id);
    if (!TRUTHS.includes(entry.truth)) problems.push(`${at}: truth ${JSON.stringify(entry.truth)}`);
    if (!hasAll(entry.origin ?? '', entry.originNeedles ?? [])) problems.push(`${at}: the origin version lacks its needles`);
    if (!hasAll(entry.received ?? '', entry.receivedNeedles ?? [])) problems.push(`${at}: the received version lacks its needles`);
    if (hasAny(entry.received ?? '', entry.originNeedles ?? [])) problems.push(`${at}: the received version carries an origin needle`);
    if (hasAny(entry.origin ?? '', entry.receivedNeedles ?? [])) problems.push(`${at}: the origin version carries a received needle`);
    const lines = Array.isArray(entry.transcript) ? entry.transcript : [];
    const said = lines.map((line) => fill(line.text, cast)).join('\n');
    if (!lower(said).includes(lower(entry.origin ?? ''))) problems.push(`${at}: the transcript never says the origin version`);
    if (hasAny(said, entry.receivedNeedles ?? [])) problems.push(`${at}: the transcript carries a received needle, so the off arm could use it`);
    if (lines.at(-1)?.speaker !== 'player') problems.push(`${at}: the last line (the invite) is not the player's`);
    if (lines.slice(0, -1).filter((line) => line.speaker !== 'player').length < 2) problems.push(`${at}: fewer than two character lines before the invite, so the hop cannot land`);
    for (const line of lines) {
      if (!['player', 'narrator', 'receiver'].includes(line.speaker)) problems.push(`${at}: speaker ${JSON.stringify(line.speaker)}`);
      const unsafe = unsafeText(fill(line.text ?? '', cast));
      if (unsafe) problems.push(`${at}: a line ${unsafe}`);
    }
    for (const text of [entry.origin, entry.received]) if (/["|{}\\]/.test(text ?? '')) problems.push(`${at}: a version holds a character the hearsay line or a prompt cannot carry`);
  }
  return problems;
}

export function voicingStory(entry: VoicingCase, cast: Cast) {
  return {
    format: 2,
    id: `so-v44-voice-${entry.id}`,
    title: `SO-V44 Voice ${entry.id}`,
    description: `v2.8 plan 44 G7/G8 case ${entry.id}: one rumor about ${entry.subject} reaches the receiver as hearsay a turn after it starts.`,
    roster: [
      { id: 'receiver', name: cast.receiver },
      { id: 'teller', name: cast.narrator, role: 'narrator', view: 'omniscient', gossip: { talks_to: ['receiver'], contact: 'any', delay: { boundaries: [1, 1] } } },
    ],
    rumors: [{ id: entry.id, from: 'teller', claim: entry.origin, versions: [{ text: entry.received, truth: entry.truth, weight: 1 }] }],
    qualities: [{ key: 'scene_over', type: 'bool', source: 'extractor', rubric: 'Has the party left this place?' }],
    checkpoints: [
      { id: 'scene', name: 'The scene', player_name: 'The scene', objective: 'Talk and listen.', type: 'anchor', start: true },
      { id: 'after', name: 'Later', player_name: 'Later', objective: 'Move on.', type: 'anchor' },
    ],
    transitions: [{ from: 'scene', to: 'after', priority: 0, gate: { q: 'scene_over', op: '==', v: true } }],
  };
}

export const hearsayMarker = (entry: VoicingCase) => `told you: ${entry.received}`;
export const cannedReply = (entry: VoicingCase, arm: Arm) => (arm === 'on' ? `Word is that ${entry.received}, though I would not swear to it.` : `They say ${entry.origin}.`);

export function voicingScenario(entry: VoicingCase, arm: Arm, cast: Cast, plumbing: boolean) {
  const marker = hearsayMarker(entry);
  const armStep: Step = {
    eval: arm === 'off'
      ? `const h = globalThis.__soRc; if (!h.rt.setFeatureOverride('rumors', 'off')) throw new Error('the rumors override did not take'); if (h.rt.getEffectiveSettings().memory.rumors !== false) throw new Error('rumors are still on for this chat'); return { arm: 'off' };`
      : `const h = globalThis.__soRc; if (h.rt.getEffectiveSettings().memory.rumors === false) throw new Error('rumors are switched off'); return { arm: 'on' };`,
  };
  const landed: Step = {
    log: 400,
    eval: arm === 'on'
      ? `const h = globalThis.__soRc; const text = await h.until(() => { const block = h.line(${JSON.stringify(cast.receiver)}); return block.includes(${JSON.stringify(marker)}) ? block : null; }, 20000, 'the hearsay line in the private block of the receiver'); return { hearsay: true, rows: h.rt.rumors.state().hearsay.length };`
      : `const h = globalThis.__soRc; await h.pause(1500); const block = h.line(${JSON.stringify(cast.receiver)}); if (block.includes('told you:')) throw new Error('a hearsay line reached the off arm'); return { hearsay: false, rows: h.rt.rumors.state().hearsay.length };`,
  };
  const lines = entry.transcript;
  const steps: Step[] = [
    clearStep({ storyOrchestratorDebugExtractionResponse: 'SCENE_NONE' }),
    { import_story: voicingStory(entry, cast) },
    helpersStep(),
    armStep,
    ...lines.slice(0, -1).map((line) => lineStep(line, cast)),
    landed,
    lineStep(lines[lines.length - 1], cast),
    generateStep(cast.receiver, plumbing ? cannedReply(entry, arm) : null, { receiverBlock: memberBlock(cast.receiver) }, { caseId: entry.id, arm }),
  ];
  return scenarioDoc(
    `v2.8 plan 44 G7/G8 case ${entry.id}, arm ${arm}${plumbing ? ' (plumbing: canned reply, never a measurement)' : ''}. Generated by so-rumor-voicing.mts record.`,
    plumbing, cast, steps,
    'the receiver\'s reply is the measured output; extraction is pinned to SCENE_NONE in both arms so only the hearsay line differs; judge off keeps the request the shipped reply path',
  );
}

export const voicingKey = (id: string, arm: Arm) => `${id}-${arm}`;

export function voicingJobs(fixture: VoicingFixture, arms: readonly Arm[], cast: Cast, plumbing: boolean, only: string[] | null = null): RecordJob[] {
  return fixture.cases.filter((entry) => !only || only.includes(entry.id)).flatMap((entry) => arms.map((arm) => ({
    key: voicingKey(entry.id, arm),
    doc: voicingScenario(entry, arm, cast, plumbing),
    meta: { format: 'so-v44-voicing-record/1', caseId: entry.id, arm, plumbing, cast },
  })));
}

export interface VoicingRecord { key: string; caseId: string; arm: Arm; plumbing: boolean; cast: Cast; capture: Capture }

export function analyseRecord(entry: VoicingCase, record: VoicingRecord) {
  const request = lastRequest(record.capture);
  return {
    hearsayInRequest: request.includes(hearsayMarker(entry)),
    originInRequest: lower(request).includes(lower(entry.origin)),
    hearsayInBlock: String(record.capture.blocks?.receiverBlock ?? '').includes(hearsayMarker(entry)),
    replyEmpty: !record.capture.reply.trim(),
  };
}

export async function readRecords<T>(out: string): Promise<Map<string, T>> {
  const dir = join(out, 'records');
  const found = new Map<string, T>();
  if (!existsSync(dir)) return found;
  for (const name of (await readdir(dir)).filter((file) => file.endsWith('.json')).sort()) {
    const value = await readJson<{ key: string } & T>(join(dir, name));
    found.set(value.key, value);
  }
  return found;
}

export type Letter = 'A' | 'B';
export interface VoicingPayload { speaker: string; scene: Array<{ who: string; text: string }>; versionA: string; versionB: string; reply: string }
export interface VoicingSecret { caseId: string; arm: Arm; A: 'origin' | 'received'; plumbing: boolean }
export interface VoicingLabel { uses: 'A' | 'B' | 'both' | 'neither'; framing: 'heard' | 'fact' | 'none'; quote: string }

const who = (line: Line, cast: Cast) => (line.speaker === 'player' ? 'Player' : line.speaker === 'narrator' ? 'Narration' : cast.receiver);

export function voicingPack(fixture: VoicingFixture, records: VoicingRecord[], seed: string): { pack: BlindPack<VoicingPayload>; key: BlindKey<VoicingSecret> } {
  const byId = new Map(fixture.cases.map((entry) => [entry.id, entry]));
  const entries = records.flatMap((record) => {
    const entry = byId.get(record.caseId);
    if (!entry) return [];
    const originFirst = seededRandom(`${seed}:${record.caseId}:${record.arm}:letters`)() < 0.5;
    return [{
      source: record.key,
      payload: {
        speaker: record.cast.receiver,
        scene: entry.transcript.map((line) => ({ who: who(line, record.cast), text: fill(line.text, record.cast) })),
        versionA: originFirst ? entry.origin : entry.received,
        versionB: originFirst ? entry.received : entry.origin,
        reply: record.capture.reply,
      },
      secret: { caseId: record.caseId, arm: record.arm, A: originFirst ? 'origin' as const : 'received' as const, plumbing: record.plumbing },
    }];
  });
  return buildBlind('so-v44-voicing', entries, seed);
}

export function voicingPrompt(item: { id: string } & VoicingPayload): string {
  return [
    'You are labelling one reply from a roleplay. Read the scene, two versions of one piece of news, and the reply. Judge only what the reply itself says.',
    '',
    'Scene, oldest first:',
    ...item.scene.map((line) => `${line.who}: ${line.text}`),
    '',
    `The reply is spoken by ${item.speaker}.`,
    `Version A of the news: ${item.versionA}`,
    `Version B of the news: ${item.versionB}`,
    '',
    'Reply:',
    '<<<',
    item.reply,
    '>>>',
    '',
    'Answer with exactly one JSON object: {"uses": "A" | "B" | "both" | "neither", "framing": "heard" | "fact" | "none", "quote": "<the words of the reply your answer rests on, or an empty string>"}',
    '- uses: which version\'s own specific content the reply states, repeats or clearly paraphrases. Content both versions share does not count; "both" only when the reply carries the specific content of each; "neither" when it carries neither.',
    '- framing: when the reply speaks of the news at all, "heard" if it presents the news as something heard, reported or rumored (I heard, they say, word is, someone told me, it may be wrong), "fact" if it states it as plain fact; "none" when the reply does not speak of the news.',
  ].join('\n');
}

export function parseVoicingLabel(raw: Record<string, unknown> | null): VoicingLabel | null {
  if (!raw) return null;
  const uses = String(raw.uses ?? '');
  const framing = String(raw.framing ?? '');
  if (!['A', 'B', 'both', 'neither'].includes(uses) || !['heard', 'fact', 'none'].includes(framing)) return null;
  return { uses: uses as VoicingLabel['uses'], framing: framing as VoicingLabel['framing'], quote: typeof raw.quote === 'string' ? raw.quote : '' };
}

export function plumbingVoicingLabel(fixture: VoicingFixture, key: BlindKey<VoicingSecret>) {
  const byId = new Map(fixture.cases.map((entry) => [entry.id, entry]));
  return (item: { id: string } & VoicingPayload): VoicingLabel => {
    const secret = key.items[item.id];
    const entry = byId.get(secret.caseId) as VoicingCase;
    const origin = hasAll(item.reply, entry.originNeedles);
    const received = hasAll(item.reply, entry.receivedNeedles);
    const letter = (version: 'origin' | 'received'): Letter => (secret.A === version ? 'A' : 'B');
    const uses = origin && received ? 'both' : received ? letter('received') : origin ? letter('origin') : 'neither';
    return { uses, framing: uses === 'neither' ? 'none' : HEARD.test(item.reply) ? 'heard' : 'fact', quote: '' };
  };
}

const usesReceived = (label: VoicingLabel, secret: VoicingSecret) => label.uses === 'both' || (label.uses !== 'neither' && (label.uses === 'A') === (secret.A === 'received'));
const mentions = (label: VoicingLabel) => label.uses !== 'neither' || label.framing !== 'none';

export interface VoicingScoreInput {
  fixture: VoicingFixture;
  fixtureHash: string;
  frozenHash: string | null;
  records: VoicingRecord[];
  key: BlindKey<VoicingSecret>;
  labels: Map<string, StoredLabel<VoicingLabel>>;
}

export function scoreVoicing({ fixture, fixtureHash, frozenHash, records, key, labels }: VoicingScoreInput) {
  const byCase = new Map(fixture.cases.map((entry) => [entry.id, entry]));
  const incomplete: string[] = [];
  if (frozenHash !== fixtureHash) incomplete.push(`the fixture hash ${fixtureHash.slice(0, 12)} is not the frozen ${String(frozenHash).slice(0, 12)}`);
  const recordByKey = new Map(records.map((record) => [record.key, record]));
  for (const entry of fixture.cases) for (const arm of ARMS) if (!recordByKey.has(voicingKey(entry.id, arm))) incomplete.push(`${voicingKey(entry.id, arm)}: no record`);
  const rows: Array<{ id: string; caseId: string; arm: Arm; received: boolean | null; heard: boolean | null; mentioned: boolean | null; rater: string | null }> = [];
  const requestProblems: string[] = [];
  for (const [id, secret] of Object.entries(key.items)) {
    const record = recordByKey.get(secret.source);
    const entry = byCase.get(secret.caseId);
    if (!record || !entry) { incomplete.push(`${id}: the key names ${secret.source}, which has no record`); continue; }
    const seen = analyseRecord(entry, record);
    if (secret.arm === 'on' && !seen.hearsayInRequest) requestProblems.push(`${secret.source}: the on arm's request lacks the hearsay line`);
    if (secret.arm === 'off' && seen.hearsayInRequest) requestProblems.push(`${secret.source}: the off arm's request carries the hearsay line`);
    if (!seen.originInRequest) requestProblems.push(`${secret.source}: the request lacks the origin's version`);
    if (seen.replyEmpty) requestProblems.push(`${secret.source}: empty reply`);
    const stored = labels.get(id);
    const label = stored?.label ?? null;
    if (!label) incomplete.push(`${id}: no valid label`);
    rows.push({
      id, caseId: secret.caseId, arm: secret.arm, rater: stored?.rater ?? null,
      received: label ? usesReceived(label, secret) : null, heard: label ? label.framing === 'heard' : null, mentioned: label ? mentions(label) : null,
    });
  }
  incomplete.push(...requestProblems);
  const arm = (name: Arm) => rows.filter((row) => row.arm === name && row.received !== null);
  const on = arm('on');
  const off = arm('off');
  const onUsed = on.filter((row) => row.received);
  const offUsed = off.filter((row) => row.received);
  const offMentioned = off.filter((row) => row.mentioned);
  const g7On = ratio(onUsed.length, on.length);
  const g7Off = ratio(offUsed.length, off.length);
  const lift = g7On !== null && g7Off !== null ? g7On - g7Off : null;
  const g8On = ratio(onUsed.filter((row) => row.heard).length, onUsed.length);
  const g8Off = ratio(offMentioned.filter((row) => row.heard).length, offMentioned.length);
  const plumbing = records.some((record) => record.plumbing || record.capture?.plumbing) || rows.some((row) => row.rater === 'plumbing');
  const checks = {
    g7: { on: g7On, onCounts: `${onUsed.length}/${on.length}`, off: g7Off, offCounts: `${offUsed.length}/${off.length}`, min: VOICING_FLOORS.g7ReceivedUsedMin, ok: g7On !== null && g7On >= VOICING_FLOORS.g7ReceivedUsedMin },
    g7Lift: { value: lift, min: VOICING_FLOORS.g7LiftMin, ok: lift !== null && lift >= VOICING_FLOORS.g7LiftMin - 1e-12 },
    g8: { on: g8On, onCounts: `${onUsed.filter((row) => row.heard).length}/${onUsed.length} on-arm replies that used the received version`, off: g8Off, offCounts: `${offMentioned.filter((row) => row.heard).length}/${offMentioned.length} off-arm replies that spoke of the news`, min: VOICING_FLOORS.g8HeardMin, ok: g8On !== null && g8On >= VOICING_FLOORS.g8HeardMin },
  };
  const verdict = plumbing ? 'PLUMBING' : incomplete.length ? 'INCOMPLETE' : Object.values(checks).every((check) => check.ok) ? 'PASS' : 'FAIL';
  return {
    plan: 'v2.8 44 G7/G8', floor: VOICING_FLOOR_TEXT, informational: true, verdict,
    ...(plumbing ? { note: 'plumbing records or labels: canned replies or canned labels, never a measurement' } : {}),
    fixture: { sha256: fixtureHash, frozen: frozenHash, cases: fixture.cases.length },
    checks, incomplete, rows,
    raters: [...new Set(rows.map((row) => row.rater ?? 'none'))].sort(),
  };
}

export const fixtureHashOf = (fixture: unknown) => canonicalHash(fixture);
