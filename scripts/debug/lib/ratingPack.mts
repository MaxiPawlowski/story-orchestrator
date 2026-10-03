import { createHash } from 'node:crypto';
import type { BlindGate } from './sessionCharters.mts';

export interface GateSpec { plan: string; title: string; pairsNeeded: number; arms: [string, string]; question: string; unit: 'reply' | 'story' }

export const GATE_SPECS: Record<BlindGate, GateSpec> = {
  C3: { plan: '06', title: 'inner voice quality', pairsNeeded: 30, arms: ['beat', 'plain'], question: 'Which reply plays its character better at this moment?', unit: 'reply' },
  R4: { plan: '05', title: 'checkpoint reasoning at climaxes', pairsNeeded: 20, arms: ['reasoning', 'plain'], question: 'Which climax reply is the better scene?', unit: 'reply' },
  'Q-M': { plan: '07', title: 'chapter memory', pairsNeeded: 20, arms: ['chaptered', 'plain'], question: 'Which reply remembers the earlier chapter correctly?', unit: 'reply' },
  W6: { plan: '11', title: 'agentic wizard vs staged wizard', pairsNeeded: 10, arms: ['agent', 'staged'], question: 'Which story would you rather play?', unit: 'story' },
};

export interface ContextLine { name: string; text: string }
export interface Candidate { gate: BlindGate; arm: string; key: string; context: ContextLine[]; text: string; source: string }
export interface PackPair { id: string; context: ContextLine[]; left: { text: string }; right: { text: string } }
export interface PackKey { id: string; left: string; right: string; sources: { left: string; right: string } }
export interface Verdict { id: string; preferred: 'left' | 'right' | 'tie' | null; rater: string | null; note: string }

const tail = (lines: ContextLine[], before = 6) => lines.slice(-before);

const ARMED_ROW = (value: any) => value?.kind === 'turn' || (value?.kind === 'mutation' && (value.verb === 'swipe-new' || value.verb === 'regen'));

export const sessionArmOf = (session: any): string | null => (typeof session?.arm === 'string' && session.arm ? session.arm : null);

export function rowArm(value: any, sessionArm: string | null = null): string | null {
  if (!ARMED_ROW(value)) return null;
  if (sessionArm) return sessionArm;
  return typeof value.arm === 'string' && value.arm ? value.arm : null;
}

const swipeTarget = (replies: any[]): { id: any; text: string } => {
  const last = replies[replies.length - 1];
  return { id: last?.messageId, text: String(last?.text ?? '') };
};

const swipedMessage = (value: any): { id: any; text: string } => {
  const replies = [...(value.tail ?? [])].filter((message: any) => !message.isUser);
  const id = value.did?.messageId ?? replies[replies.length - 1]?.messageId;
  const swiped = replies.find((message: any) => message.messageId === id);
  return { id, text: String(swiped?.text ?? '') };
};

export function candidatesFromTurns(gate: BlindGate, rows: Array<{ line: number; value: any }>, sessionDir: string, sessionArm: string | null = null): Candidate[] {
  const out: Candidate[] = [];
  for (const { line, value } of rows) {
    const arm = rowArm(value, sessionArm);
    if (!value || value.ok === false || !arm) continue;
    if (!sessionArm && (value.gate ?? gate) !== gate) continue;
    const chatId = value.chatId ?? value.observe?.chatId ?? null;
    const reply = value.kind === 'turn' ? swipeTarget(value.replies ?? []) : swipedMessage(value);
    if (!chatId || !Number.isInteger(reply.id) || !reply.text.trim()) continue;
    const context = tail(((value.observe?.context ?? []) as any[]).filter((message) => Number(message.id) < reply.id).map((message) => ({ name: String(message.name ?? ''), text: String(message.text ?? '') })));
    out.push({ gate, arm, key: `${chatId}:${reply.id}`, context, text: reply.text, source: `${sessionDir}/turns.jsonl:${line}` });
  }
  return out;
}

export function storyCandidate(gate: BlindGate, arm: string, key: string, story: any, source: string): Candidate | null {
  if (!story || !Array.isArray(story.checkpoints)) return null;
  const lines = [
    `Title: ${String(story.title ?? '')}`,
    String(story.description ?? ''),
    ...story.checkpoints.map((checkpoint: any, at: number) => `${at + 1}. ${String(checkpoint.name ?? checkpoint.id)}: ${String(checkpoint.objective ?? '')}`),
    `Cast: ${(story.roster ?? []).map((member: any) => member.name ?? member.id).join(', ')}`,
  ];
  return { gate, arm, key, context: [], text: lines.filter(Boolean).join('\n'), source };
}

export const premiseKey = (session: any): string => String(session?.story?.premiseId ?? session?.premise?.id ?? session?.charter ?? '');

export interface SessionCandidateInput { session: any; turns: Array<{ line: number; value: any }>; drafts: any; sessionDir: string }

export function sessionCandidates(gate: BlindGate, input: SessionCandidateInput): Candidate[] {
  const spec = GATE_SPECS[gate];
  const arm = sessionArmOf(input.session);
  const found = spec.unit === 'story'
    ? (arm ? [storyCandidate(gate, arm, premiseKey(input.session), input.drafts?.openDraft ?? null, `${input.sessionDir}/wizard-drafts.json`)].filter((item): item is Candidate => Boolean(item)) : [])
    : candidatesFromTurns(gate, input.turns, input.sessionDir, arm);
  return found.filter((candidate) => spec.arms.includes(candidate.arm));
}

export const PACK_SESSION_RULE = 'only VALID sessions count; per gate, arm and key (a premise for W6, a chat message for replies) the latest valid session wins';

export interface PackSession { dir: string; session: any; candidates: Candidate[] }

const sessionStamp = (entry: PackSession): string => String(entry.session?.stoppedAt ?? entry.session?.startedAt ?? '');

export function packCandidates(entries: PackSession[]): { candidates: Candidate[]; skippedInvalid: string[]; superseded: string[] } {
  const valid = entries.filter((entry) => entry.session?.valid === true);
  const skippedInvalid = entries.filter((entry) => entry.session?.valid !== true).map((entry) => entry.dir);
  const latest = new Map<string, { candidate: Candidate; stamp: string }>();
  const superseded: string[] = [];
  for (const entry of valid) {
    const stamp = sessionStamp(entry);
    for (const candidate of entry.candidates) {
      const slot = `${candidate.gate}|${candidate.arm}|${candidate.key}`;
      const held = latest.get(slot);
      if (held && held.stamp >= stamp) { superseded.push(candidate.source); continue; }
      if (held) superseded.push(held.candidate.source);
      latest.set(slot, { candidate, stamp });
    }
  }
  return { candidates: [...latest.values()].map((held) => held.candidate), skippedInvalid, superseded };
}

export function armRefusal(gates: readonly BlindGate[], arm: string | null | undefined): string | null {
  if (!arm) return null;
  if (!gates.length) return `--arm ${arm}: this card feeds no blind gate`;
  const known = [...new Set(gates.flatMap((gate) => GATE_SPECS[gate].arms))];
  return known.includes(arm) ? null : `--arm ${arm} is not an arm of ${gates.join(', ')} (${known.join(', ')})`;
}

export function seededRandom(seed: string) {
  let state = createHash('sha256').update(seed).digest().readUInt32LE(0) || 1;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0x100000000;
  };
}

const pairId = (gate: string, texts: string[]) => `${gate}-${createHash('sha256').update(texts.slice().sort().join('\u0001')).digest('hex').slice(0, 10)}`;

export function buildPack(gate: BlindGate, candidates: Candidate[], seed: string, previous: Verdict[] = []) {
  const spec = GATE_SPECS[gate];
  const random = seededRandom(`${gate}:${seed}`);
  const byKey = new Map<string, Candidate[]>();
  for (const candidate of candidates.filter((item) => item.gate === gate)) byKey.set(candidate.key, [...(byKey.get(candidate.key) ?? []), candidate]);
  const matched: Array<[Candidate, Candidate]> = [];
  for (const group of byKey.values()) {
    const first = group.find((item) => item.arm === spec.arms[0]);
    const second = group.find((item) => item.arm === spec.arms[1]);
    if (first && second && first.text.trim() !== second.text.trim()) matched.push([first, second]);
  }
  const shuffled = matched.map((pair) => ({ pair, order: random() })).sort((a, b) => a.order - b.order).map(({ pair }) => pair);
  const pairs: PackPair[] = [];
  const key: PackKey[] = [];
  for (const [a, b] of shuffled) {
    const [left, right] = random() < 0.5 ? [a, b] : [b, a];
    const id = pairId(gate, [a.text, b.text]);
    pairs.push({ id, context: a.context.length >= b.context.length ? a.context : b.context, left: { text: left.text }, right: { text: right.text } });
    key.push({ id, left: left.arm, right: right.arm, sources: { left: left.source, right: right.source } });
  }
  const kept = new Map(previous.map((verdict) => [verdict.id, verdict]));
  const verdicts: Verdict[] = pairs.map((pair) => kept.get(pair.id) ?? { id: pair.id, preferred: null, rater: null, note: '' });
  const unmatched = [...byKey.values()].filter((group) => !(group.some((item) => item.arm === spec.arms[0]) && group.some((item) => item.arm === spec.arms[1]))).length;
  return { pairs, key, verdicts, unmatched, status: gateStatus(gate, verdicts) };
}

export function gateStatus(gate: BlindGate, verdicts: Verdict[]) {
  const spec = GATE_SPECS[gate];
  const rated = verdicts.filter((verdict) => verdict.preferred !== null && verdict.rater).length;
  const reason = verdicts.length < spec.pairsNeeded
    ? `${verdicts.length} of the ${spec.pairsNeeded} pairs plan ${spec.plan} needs exist`
    : rated < verdicts.length ? `${verdicts.length - rated} pair(s) await the human verdict` : 'every pair is rated: scoring and the judge leg are the review\'s, not the tooling\'s';
  return { gate, status: 'pending' as const, pairs: verdicts.length, needed: spec.pairsNeeded, rated, reason };
}

export function packLeaks(pairs: PackPair[]): string[] {
  const leaks: string[] = [];
  for (const pair of pairs) {
    if (JSON.stringify(Object.keys(pair).sort()) !== JSON.stringify(['context', 'id', 'left', 'right'])) leaks.push(`${pair.id}: carries fields beyond id, context, left and right`);
    for (const side of [pair.left, pair.right]) if (JSON.stringify(Object.keys(side)) !== JSON.stringify(['text'])) leaks.push(`${pair.id}: a side carries more than its text`);
    if (/turns\.jsonl|test\/sessions|\.jsonl:\d/.test(JSON.stringify(pair))) leaks.push(`${pair.id}: names a session file`);
  }
  return leaks;
}
