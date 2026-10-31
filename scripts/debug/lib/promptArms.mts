import { join, resolve } from 'node:path';
import { seededRandom } from './ratingPack.mts';
import { buildBlind, ratio, type BlindKey, type BlindPack, type StoredLabel } from './blindRater.mts';
import { CAPTURE_GLOBAL, canonicalHash, castOf, clearStep, fill, lineStep, scenarioDoc, unsafeText, type Cast, type Step } from './replyCapture.mts';

export const ARMS_DIR = resolve(import.meta.dirname, '..', '..', '..', 'test', 'measurements', 'v3.0', 'prompt-arms');
export const ARMS_FREEZE = join(ARMS_DIR, 'freeze.json');
export const ARMS_FORMAT = 'so-v30-prompt-arms/1';
export const ARMS_CASE_COUNT = 25;
export const PROMPT_ARMS = ['on', 'off'] as const;
export type PromptArm = typeof PROMPT_ARMS[number];
export const PA_GLOBAL = '__soPa';
export const PA_CAPTURE = CAPTURE_GLOBAL;
export const PA_REAL_MS = 600_000;
export const PA_PLUMBING_MS = 20_000;

export const GATES = {
  outward: {
    plan: 'v3.0 31 S1', setting: 'memory.outwardNarration', file: 'outward.cases.json', speaker: 'narrator' as const,
    floor: 'Sol blind pairs on 25 narrator turns: no category below -0.2 (on minus off), flags on <= off + 2, thinking closure on >= off; interior-report sentences per 10 replies down >= 50% vs off (only when off has >= 10 positives, else counts); secret restatements on the on arm 0. Informational, never retuned.',
  },
  swipe: {
    plan: 'v3.0 31 S2', setting: 'talk.swipeContrast', file: 'swipe.cases.json', speaker: 'receiver' as const,
    floor: 'Sol blind pairs on 25 swipe points: "differs from the rejected reply" won by the on arm in >= 60% of pairs; no category below -0.2, flags on <= off + 2, thinking closure on >= off; an 8-word span copied from the rejected reply in <= 2 of 25 on-arm replies. Informational, never retuned.',
  },
  notes: {
    plan: 'v3.0 34 S1', setting: 'memory.historyNotes', file: 'notes.cases.json', speaker: 'narrator' as const,
    floor: 'Sol blind pairs on 25 turns after a scene break and a time step: no category below -0.2, flags on <= off + 2, thinking closure on >= off; echo (the raw reply opens with a bracketed note) <= 2 of 25 on-arm replies; place or day-part contradictions down >= 50% vs off (only when off has >= 10 positives, else counts). Informational, never retuned.',
  },
} as const;

export type ArmGate = keyof typeof GATES;
export const ARM_GATES = Object.keys(GATES) as ArmGate[];
export const CATEGORIES = ['character', 'scene', 'prose', 'agency'] as const;
export type Category = typeof CATEGORIES[number];
export const CATEGORY_TEXT: Record<Category, string> = {
  character: 'the characters act and speak like themselves',
  scene: 'the reply fits the scene, its place and its time',
  prose: 'clear, vivid, not repetitive',
  agency: 'leaves the player their own choices and never speaks or decides for them',
};

export interface ArmLine { speaker: 'player' | 'narrator' | 'receiver'; text: string; set?: Record<string, string | number> }
export interface ArmCase { id: string; transcript: ArmLine[]; motive?: string; motiveNeedles?: string[]; rejected?: string; truth?: { place: string; part: string } }
export interface ArmFixture { format: string; synthetic: true; gate: ArmGate; plan: string; cases: ArmCase[] }

export const PLACES = ['harbor', 'market', 'chapel', 'mill', 'archive'] as const;
export const PLACE_NAMES: Record<string, string> = { harbor: 'the harbor', market: 'the night market', chapel: 'the old chapel', mill: 'the river mill', archive: 'the city archive' };
export const TIMES = ['morning', 'afternoon', 'evening', 'night'] as const;

const MOTIVES: Array<[string, string[]]> = [
  ['hide that she sold the guild map to the smugglers', ['sold', 'map']],
  ['hide that she is afraid of the harbor master', ['afraid', 'harbor master']],
  ['keep the letter in her coat from being found', ['letter', 'coat']],
  ['hide that she already knows where the missing boy is', ['knows', 'boy']],
  ['steer the party away from the east road without saying why', ['east road']],
];

const OPENINGS = [
  'I step inside and shake the rain off my cloak.',
  'I set my pack down by the door and look around.',
  'I lean on the counter and wait for someone to notice me.',
  'I follow the noise toward the back of the room.',
  'I take a seat where I can see the door.',
];

const RECEIVER_LINES = [
  '{receiver} smiles a little too quickly. “You made good time. Sit, sit.”',
  '{receiver} folds her hands on the table. “I did not expect you before dark.”',
  '{receiver} glances at the door, then back. “Ask what you came to ask.”',
  '{receiver} pours two cups without asking. “Long road?”',
  '{receiver} keeps her shawl on though the room is warm. “Well. Here we are.”',
];

const PROMPTS = [
  'I watch her while she talks. What do I notice about the room and the people in it?',
  'I ask her straight out whether anything happened here today.',
  'I say nothing for a moment and look at her face.',
  'I ask her who else has been asking about the road.',
  'I tell her I am staying the night and see how she takes it.',
];

const REJECTED = [
  '{receiver} sighs and looks out of the window. “I told you already, there is nothing more to say about the road. The guards closed it two days ago and nobody has come through since. If you want to try your luck, go ahead, but do not say I did not warn you.”',
  '{receiver} laughs softly and shakes her head. “You always ask the same question, and you always get the same answer from me. The ferry leaves at dawn, the captain wants silver, not promises, and the river is high this week. That is all I know.”',
  '{receiver} sets her cup down with care. “There was a man here this morning, tall, with a grey hood. He paid in old coins and asked for a room facing the street. He left before noon and did not say where he was going. That is all.”',
  '{receiver} folds her arms. “The chapel bell rang twice last night, and nobody admits to ringing it. People are nervous. I would keep my voice down if I were you, and I would not go near the chapel after dark.”',
  '{receiver} leans closer and lowers her voice. “The archive keeper owes me a favour. If you need a record, I can ask him, but it will take a day, maybe two. He does not like strangers and he likes questions even less.”',
];

const SWIPE_ASKS = [
  'I ask her what she has heard about the closed road.',
  'I ask her how I can get across the river.',
  'I ask her whether anyone strange has stayed here.',
  'I ask her what happened at the chapel.',
  'I ask her who could help me find an old record.',
];

const NOTE_MOVES: Array<{ place: string; time: number }> = [
  { place: 'market', time: 2 }, { place: 'chapel', time: 3 }, { place: 'mill', time: 1 }, { place: 'archive', time: 2 }, { place: 'harbor', time: 3 },
];

const NOTE_LINES = [
  ['We walk until the streets change around us.', 'The crowd thins as the party goes on.'],
  ['I lead the way along the river path.', 'The light shifts while the party walks.'],
  ['We cross the square without stopping.', 'Bells somewhere mark the passing hours.'],
  ['I pull my hood up and keep moving.', 'The streets empty and fill again as time passes.'],
  ['We take the long way, past the gates.', 'By the time the party arrives, the hour has turned.'],
];

const NOTE_ASKS = [
  'I look around. Where are we now, and what is happening here?',
  'I stop and take in the place. What do I see?',
  'I ask {receiver} what she makes of this place at this hour.',
  'I find somewhere to sit and watch the people around us.',
  'I listen for a while. What do I hear?',
];

const pick = <T,>(list: readonly T[], at: number): T => list[at % list.length];

export function buildCases(gate: ArmGate): ArmFixture {
  const cases: ArmCase[] = Array.from({ length: ARMS_CASE_COUNT }, (_, index) => {
    const id = `${gate[0]}${String(index + 1).padStart(2, '0')}`;
    const major = Math.floor(index / 5);
    if (gate === 'outward') {
      const [motive, motiveNeedles] = pick(MOTIVES, index);
      return { id, motive, motiveNeedles, transcript: [
        { speaker: 'player', text: pick(OPENINGS, major) }, { speaker: 'receiver', text: pick(RECEIVER_LINES, index + major) }, { speaker: 'player', text: pick(PROMPTS, major + index) },
      ] };
    }
    if (gate === 'swipe') {
      return { id, rejected: pick(REJECTED, index), transcript: [
        { speaker: 'player', text: pick(OPENINGS, major) }, { speaker: 'receiver', text: pick(RECEIVER_LINES, index) }, { speaker: 'player', text: pick(SWIPE_ASKS, index) },
      ] };
    }
    const move = pick(NOTE_MOVES, index + major);
    const [walk, narration] = pick(NOTE_LINES, index);
    return { id, truth: { place: move.place, part: TIMES[move.time] }, transcript: [
      { speaker: 'player', text: pick(OPENINGS, major) }, { speaker: 'receiver', text: pick(RECEIVER_LINES, index) },
      { speaker: 'player', text: walk }, { speaker: 'narrator', text: narration, set: { location: move.place, story_time: move.time } },
      { speaker: 'receiver', text: '{receiver} keeps pace beside you and says nothing for a while.' }, { speaker: 'player', text: pick(NOTE_ASKS, index + major) },
    ] };
  });
  return { format: ARMS_FORMAT, synthetic: true, gate, plan: GATES[gate].plan, cases };
}

export function caseProblems(fixture: ArmFixture, cast: Cast = castOf()): string[] {
  const problems: string[] = [];
  const gate = fixture?.gate;
  if (fixture?.format !== ARMS_FORMAT) problems.push(`format is ${JSON.stringify(fixture?.format)}, expected ${ARMS_FORMAT}`);
  if (fixture?.synthetic !== true) problems.push('the fixture is not marked synthetic');
  if (!ARM_GATES.includes(gate)) return [...problems, `gate ${JSON.stringify(gate)}`];
  const cases = Array.isArray(fixture.cases) ? fixture.cases : [];
  if (cases.length !== ARMS_CASE_COUNT) problems.push(`${cases.length} case(s), the floor needs ${ARMS_CASE_COUNT}`);
  const ids = new Set<string>();
  for (const entry of cases) {
    const at = `case ${entry?.id ?? '?'}`;
    if (!/^[a-z0-9-]+$/.test(String(entry?.id ?? ''))) problems.push(`${at}: id is not a lowercase slug`);
    if (ids.has(entry.id)) problems.push(`${at}: duplicate id`);
    ids.add(entry.id);
    const lines = Array.isArray(entry.transcript) ? entry.transcript : [];
    if (lines.at(-1)?.speaker !== 'player') problems.push(`${at}: the last line is not the player's`);
    for (const line of lines) {
      if (!['player', 'narrator', 'receiver'].includes(line.speaker)) problems.push(`${at}: speaker ${JSON.stringify(line.speaker)}`);
      const unsafe = unsafeText(fill(line.text ?? '', cast));
      if (unsafe) problems.push(`${at}: a line ${unsafe}`);
      for (const [key, value] of Object.entries(line.set ?? {})) {
        if (key === 'location' && !PLACES.includes(String(value) as typeof PLACES[number])) problems.push(`${at}: location ${JSON.stringify(value)}`);
        if (key === 'story_time' && !(Number.isInteger(value) && Number(value) >= 0)) problems.push(`${at}: story_time ${JSON.stringify(value)}`);
        if (!['location', 'story_time'].includes(key)) problems.push(`${at}: set ${key}`);
      }
    }
    if (gate === 'outward' && !(entry.motive && entry.motiveNeedles?.length && entry.motiveNeedles.every((needle) => entry.motive!.toLowerCase().includes(needle.toLowerCase())))) problems.push(`${at}: the motive lacks its needles`);
    if (gate === 'outward' && lines.some((line) => entry.motiveNeedles?.some((needle) => fill(line.text, cast).toLowerCase().includes(needle.toLowerCase())))) problems.push(`${at}: the transcript says the motive, so the off arm could restate it from the chat`);
    if (gate === 'swipe' && (unsafeText(fill(entry.rejected ?? '', cast)) || (entry.rejected ?? '').split(/\s+/).length < 30)) problems.push(`${at}: the rejected reply is unsafe or shorter than 30 words`);
    if (gate === 'notes' && (!entry.truth || !lines.some((line) => line.set?.location === entry.truth?.place))) problems.push(`${at}: the truth place is never set`);
  }
  return problems;
}

export function armStory(gate: ArmGate, entry: ArmCase, cast: Cast) {
  return {
    id: `so-v30-arms-${gate}-${entry.id}`,
    title: `SO-V30 Arms ${gate} ${entry.id}`,
    description: `v3.0 prompt-arm case ${entry.id} (${GATES[gate].plan}).`,
    roster: [{ id: 'receiver', name: cast.receiver, role: 'innkeeper' }, { id: 'teller', name: cast.narrator, role: 'narrator', view: 'omniscient' }],
    qualities: [
      { key: 'location', type: 'enum', values: [...PLACES], player_labels: PLACE_NAMES, source: 'extractor', rubric: 'Where the party is now.' },
      { key: 'scene_over', type: 'bool', source: 'extractor', rubric: 'Has the party left town?' },
    ],
    clock: { times: [...TIMES], start_part: 'morning' },
    checkpoints: [
      { id: 'scene', name: 'The town', player_name: 'The town', objective: 'Talk and look around.', type: 'anchor', start: true, ...(entry.motive ? { motives: { receiver: entry.motive } } : {}) },
      { id: 'after', name: 'Away', player_name: 'Away', objective: 'Move on.', type: 'anchor' },
    ],
    transitions: [{ from: 'scene', to: 'after', priority: 0, gate: { q: 'scene_over', op: '==', v: true } }],
  };
}

export const ARM_SETTING_KEYS = { outward: ['memory', 'outwardNarration'], swipe: ['talk', 'swipeContrast'], notes: ['memory', 'historyNotes'] } as const;

export function armSettingStep(gate: ArmGate, arm: PromptArm): Step {
  const [section, key] = ARM_SETTING_KEYS[gate];
  const on = arm === 'on';
  const write = section === 'memory'
    ? `h.rt.setMemorySettings({ ${key}: ${on} });`
    : `const root = SillyTavern.getContext().extensionSettings['story-orchestrator']; root.settings ??= {}; root.settings.${section} ??= {}; if (${on}) root.settings.${section}.${key} = true; else delete root.settings.${section}.${key};`;
  return { eval: `const h = globalThis.${PA_GLOBAL}; ${write} const now = h.rt.getEffectiveSettings().${section}.${key} === true; if (now !== ${on}) throw new Error('${section}.${key} did not read back ${on}'); return { arm: '${arm}', ${key}: now };` };
}

export function armResetEval(): string {
  return `const root = SillyTavern.getContext().extensionSettings['story-orchestrator']; const rt = globalThis.storyOrchestratorRuntime; rt?.setMemorySettings?.({ outwardNarration: true, historyNotes: true }); if (root?.settings?.talk) delete root.settings.talk.swipeContrast; return { reset: true };`;
}

export function armHelpersStep(): Step {
  return {
    eval: `const rt = globalThis.storyOrchestratorRuntime; const NL = String.fromCharCode(10); const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)); const until = async (test, ms, what) => { const end = Date.now() + ms; for (;;) { const value = await test(); if (value) return value; if (Date.now() > end) throw new Error('timed out after ' + ms + ' ms: ' + what); await pause(250); } }; const chid = (name) => SillyTavern.getContext().characters.findIndex((character) => character.name === name); const shown = (el) => Boolean(el) && getComputedStyle(el).display !== 'none'; const busy = () => shown(document.querySelector('#mes_stop')) || document.body.dataset.generating === 'true'; const textOf = (body) => typeof body?.prompt === 'string' ? body.prompt : Array.isArray(body?.messages) ? body.messages.map((m) => (typeof m?.content === 'string' ? m.content : JSON.stringify(m?.content ?? ''))).join(NL) : JSON.stringify(body ?? null); const stub = async (reply) => { const tg = await import('/scripts/textgen-settings.js'); const host = await import('/script.js'); const status = host.online_status; host.setOnlineStatus('SO stub'); const streaming = tg.textgenerationwebui_settings.streaming; tg.textgenerationwebui_settings.streaming = false; const original = globalThis.fetch; globalThis.fetch = async (input, init) => { const url = String(typeof input === 'string' ? input : input?.url ?? ''); if (url.includes('/api/backends/') && url.endsWith('/generate')) return new Response(JSON.stringify({ choices: [{ text: reply, message: { content: reply } }], results: [{ text: reply }], content: reply }), { status: 200, headers: { 'Content-Type': 'application/json' } }); return original(input, init); }; return () => { globalThis.fetch = original; tg.textgenerationwebui_settings.streaming = streaming; host.setOnlineStatus(status); }; }; const run = async (start, canned, ms, swiping) => { const ctx = SillyTavern.getContext(); const requests = []; let raw = null; const listener = (data, dryRun) => { if (!dryRun) requests.push(textOf(data)); }; const first = (id) => { const row = SillyTavern.getContext().chat[Number(id)]; if (row && !row.is_user) raw = String(row.mes ?? ''); }; ctx.eventSource.on(ctx.eventTypes.GENERATE_AFTER_DATA, listener); ctx.eventSource.makeFirst(ctx.eventTypes.MESSAGE_RECEIVED, first); const restore = canned === null ? null : await stub(canned); const before = ctx.chat.length; const swipes = ctx.chat.at(-1)?.swipes?.length ?? 0; let error = null; try { await start(); await until(() => (swiping ? (SillyTavern.getContext().chat.at(-1)?.swipes?.length ?? 0) > swipes : SillyTavern.getContext().chat.length > before) && !busy(), ms, 'the reply'); await pause(1500); await until(() => !busy(), ms, 'generation to settle'); } catch (e) { error = String(e?.message ?? e); } finally { ctx.eventSource.removeListener(ctx.eventTypes.GENERATE_AFTER_DATA, listener); ctx.eventSource.removeListener(ctx.eventTypes.MESSAGE_RECEIVED, first); if (restore) restore(); } const last = SillyTavern.getContext().chat.at(-1); const replied = last && !last.is_user; return { requests, reply: replied ? String(last.mes ?? '') : '', raw: raw ?? (replied ? String(last.mes ?? '') : ''), reasoning: replied ? String(last.extra?.reasoning ?? '').length : 0, replyName: replied ? String(last.name ?? '') : null, error }; }; const generate = (name, canned, ms) => run(() => SillyTavern.getContext().generate('normal', { force_chid: chid(name) }), canned, ms, false); const swipe = (canned, ms) => run(() => SillyTavern.getContext().swipe.right(null, { source: 'so-prompt-arms', message: SillyTavern.getContext().chat.at(-1) }), canned, ms, true); const saved = async () => { for (let i = 0; i < 100 && rt.getSnapshot().saveHealth?.pendingBoundary != null; i += 1) await pause(100); }; globalThis.${PA_GLOBAL} = { rt, pause, until, chid, busy, generate, swipe, saved }; if (rt.turnBlocksHeld?.()) rt.clearPrivateInjection?.(); return { ready: true, mainApi: SillyTavern.getContext().mainApi };`,
  };
}

const captureStep = (call: string, extra: Record<string, unknown>): Step => ({
  log: 400,
  eval: `const h = globalThis.${PA_GLOBAL}; const out = await ${call}; await h.saved(); globalThis.${PA_CAPTURE} = { ...out, extra: ${JSON.stringify(extra)} }; if (out.error) throw new Error('generation failed: ' + out.error); if (!out.requests.length) throw new Error('no drafted request was seen'); return { requests: out.requests.length, replyLength: out.reply.length, replyName: out.replyName };`,
});

export const cannedReply = (gate: ArmGate, entry: ArmCase, arm: PromptArm) =>
  (gate === 'swipe' ? (arm === 'on' ? 'She shrugs. "Ask someone at the gate, then."' : String(entry.rejected ?? '')) : arm === 'on' ? 'The room is quiet; she keeps her hands still.' : 'She is hiding something and you can tell.');

const setStep = (set: Record<string, string | number>): Step => ({
  eval: `const h = globalThis.${PA_GLOBAL}; const out = {}; for (const [key, value] of ${JSON.stringify(Object.entries(set))}) { if (!(await h.rt.setQuality(key, String(value)))) throw new Error('could not set ' + key); out[key] = h.rt.getEngineState()?.blackboard.values[key]; } return out;`,
});

export function armScenario(gate: ArmGate, entry: ArmCase, arm: PromptArm, cast: Cast, plumbing: boolean) {
  const ms = plumbing ? PA_PLUMBING_MS : PA_REAL_MS;
  const canned = plumbing ? cannedReply(gate, entry, arm) : null;
  const speakerName = GATES[gate].speaker === 'narrator' ? cast.narrator : cast.receiver;
  const lines = entry.transcript.flatMap((line) => [lineStep(line, cast), ...(line.set ? [setStep(line.set)] : [])]);
  const extra = { caseId: entry.id, arm, gate };
  const finish: Step[] = gate === 'swipe'
    ? [lineStep({ speaker: 'receiver', text: entry.rejected ?? '' }, cast), armSettingStep(gate, arm), captureStep(`h.swipe(${JSON.stringify(canned)}, ${ms})`, extra)]
    : [armSettingStep(gate, arm), captureStep(`h.generate(${JSON.stringify(speakerName)}, ${JSON.stringify(canned)}, ${ms})`, extra)];
  const steps: Step[] = [
    clearStep({ storyOrchestratorDebugExtractionResponse: 'SCENE_NONE' }),
    { import_story: armStory(gate, entry, cast) },
    armHelpersStep(),
    ...lines,
    ...finish,
    { eval: armResetEval() },
  ];
  return scenarioDoc(
    `${GATES[gate].plan} case ${entry.id}, arm ${arm}${plumbing ? ' (plumbing: canned reply, never a measurement)' : ''}. Generated by so-prompt-arms.mts record.`,
    plumbing, cast, steps,
    `the ${GATES[gate].speaker}'s reply is the measured output; extraction is pinned to SCENE_NONE in both arms and only ${GATES[gate].setting} differs; judge off keeps the request the shipped reply path`,
  );
}

export const armKey = (id: string, arm: PromptArm) => `${id}-${arm}`;

export function armJobs(fixture: ArmFixture, arms: readonly PromptArm[], cast: Cast, plumbing: boolean, only: string[] | null = null) {
  return fixture.cases.filter((entry) => !only || only.includes(entry.id)).flatMap((entry) => arms.map((arm) => ({
    key: armKey(entry.id, arm),
    doc: armScenario(fixture.gate, entry, arm, cast, plumbing),
    meta: { format: 'so-v30-prompt-arms-record/1', gate: fixture.gate, caseId: entry.id, arm, plumbing, cast },
  })));
}

export interface ArmCapture { requests: string[]; reply: string; raw: string; reasoning: number; replyName: string | null; error: string | null; plumbing?: boolean }
export interface ArmRecord { key: string; gate: ArmGate; caseId: string; arm: PromptArm; plumbing: boolean; cast: Cast; capture: ArmCapture }

export const OUTWARD_MARKER = 'Narrate only what the player could see or hear';
export const SWIPE_MARKER = 'was rejected by the player; write a different reply';
const NOTE_IN_REQUEST = /\[Day \d+, (?:morning|afternoon|evening|night)/;
const NOTE_AT_START = /^\s*\[(?:Day \d+|[^\]\n]{0,40}(?:morning|afternoon|evening|night))[^\]\n]*\]/i;

export function armMarkerSeen(gate: ArmGate, request: string): boolean {
  if (gate === 'outward') return request.includes(OUTWARD_MARKER);
  if (gate === 'swipe') return request.includes(SWIPE_MARKER);
  return NOTE_IN_REQUEST.test(request);
}

const words = (text: string) => text.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);

export function copiedSpan(reply: string, rejected: string, size = 8): boolean {
  const spans = new Set<string>();
  const source = words(rejected);
  for (let at = 0; at + size <= source.length; at += 1) spans.add(source.slice(at, at + size).join(' '));
  const target = words(reply);
  for (let at = 0; at + size <= target.length; at += 1) if (spans.has(target.slice(at, at + size).join(' '))) return true;
  return false;
}

export const echoed = (raw: string) => NOTE_AT_START.test(raw);
export const closed = (capture: ArmCapture) => capture.reply.trim().length > 0;

export type Side = 'A' | 'B';
export interface ArmPayload { gate: ArmGate; speaker: string; scene: Array<{ who: string; text: string }>; rejected?: string; state?: string; replyA: string; replyB: string }
export interface ArmSecret { gate: ArmGate; caseId: string; A: PromptArm; plumbing: boolean }
export interface ReplyLabel { scores: Record<Category, number>; flag: boolean; interior: number; restates: boolean; contradicts: boolean; differs: number }
export interface ArmLabel { A: ReplyLabel; B: ReplyLabel; prefer: Side | 'tie'; differs: Side | 'tie' | null; note: string }

const whoOf = (line: ArmLine, cast: Cast) => (line.speaker === 'player' ? 'Player' : line.speaker === 'narrator' ? 'Narration' : cast.receiver);

const stateLine = (entry: ArmCase) => {
  if (!entry.truth) return undefined;
  const moved = entry.transcript.flatMap((line) => (line.set ? [line.set] : [])).at(-1);
  const day = 1 + Math.floor(Number(moved?.story_time ?? 0) / TIMES.length);
  return `Day ${day}, ${entry.truth.part}, ${PLACE_NAMES[entry.truth.place] ?? entry.truth.place}`;
};

export function armPack(fixture: ArmFixture, records: ArmRecord[], seed: string): { pack: BlindPack<ArmPayload>; key: BlindKey<ArmSecret> } {
  const byCase = new Map<string, Partial<Record<PromptArm, ArmRecord>>>();
  for (const record of records.filter((row) => row.gate === fixture.gate)) byCase.set(record.caseId, { ...(byCase.get(record.caseId) ?? {}), [record.arm]: record });
  const entries = fixture.cases.flatMap((entry) => {
    const pair = byCase.get(entry.id);
    if (!pair?.on || !pair.off) return [];
    const onFirst = seededRandom(`${seed}:${fixture.gate}:${entry.id}:sides`)() < 0.5;
    const [a, b] = onFirst ? [pair.on, pair.off] : [pair.off, pair.on];
    const cast = pair.on.cast;
    return [{
      source: `${fixture.gate}:${entry.id}`,
      payload: {
        gate: fixture.gate,
        speaker: GATES[fixture.gate].speaker === 'narrator' ? 'the narrator' : cast.receiver,
        scene: entry.transcript.map((line) => ({ who: whoOf(line, cast), text: fill(line.text, cast) })),
        ...(fixture.gate === 'swipe' ? { rejected: fill(entry.rejected ?? '', cast) } : {}),
        ...(fixture.gate === 'notes' ? { state: stateLine(entry) } : {}),
        replyA: a.capture.reply,
        replyB: b.capture.reply,
      },
      secret: { gate: fixture.gate, caseId: entry.id, A: onFirst ? 'on' as const : 'off' as const, plumbing: pair.on.plumbing || pair.off.plumbing },
    }];
  });
  return buildBlind(`so-v30-arms-${fixture.gate}`, entries, seed);
}

export function armPrompt(item: { id: string } & ArmPayload): string {
  const gateAsk = item.gate === 'outward'
    ? '- interior: how many sentences of the reply state another character\'s thoughts, motives or feelings as fact rather than showing them through speech or action (0 if none).\n- restates: true if the reply states outright a private aim or secret of a character that the scene has not revealed.'
    : item.gate === 'notes'
      ? `- contradicts: true if the reply places the scene somewhere other than ${item.state ?? 'the stated place'}, or at another time of day.`
      : '- differs: 1 to 5, how different this reply is from the rejected reply (5 = a genuinely different reply, 1 = a near copy).';
  return [
    'You compare two replies, A and B, written for the same moment of a roleplay. You do not know how either was produced. Judge only the replies.',
    '',
    'Scene, oldest first:',
    ...item.scene.map((line) => `${line.who}: ${line.text}`),
    ...(item.state ? ['', `Where and when the scene now is: ${item.state}.`] : []),
    ...(item.rejected ? ['', 'The player rejected this earlier reply and asked for another:', '<<<', item.rejected, '>>>'] : []),
    '',
    `Both replies are written by ${item.speaker}.`,
    'Reply A:', '<<<', item.replyA, '>>>',
    'Reply B:', '<<<', item.replyB, '>>>',
    '',
    'Answer with exactly one JSON object: {"A": <scores>, "B": <scores>, "prefer": "A" | "B" | "tie", "differs": "A" | "B" | "tie" | null, "note": "<one short reason>"}',
    `where <scores> is {${CATEGORIES.map((category) => `"${category}": 1-5`).join(', ')}, "flag": true | false, "interior": number, "restates": true | false, "contradicts": true | false, "differs": 1-5}.`,
    ...CATEGORIES.map((category) => `- ${category}: ${CATEGORY_TEXT[category]} (1 bad, 5 excellent).`),
    '- flag: true if the reply has a defect a player would object to (broken text, speaks or acts for the player, out of character, a meta comment).',
    gateAsk,
    item.gate === 'swipe' ? '- differs (top level): which reply differs more from the rejected reply.' : '- differs (top level): null.',
    'Fill every field; use 0, false or 3 for a field that does not apply to this comparison.',
  ].join('\n');
}

const score = (value: unknown) => (typeof value === 'number' && value >= 1 && value <= 5 ? value : null);

const readReply = (raw: unknown): ReplyLabel | null => {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const scores = Object.fromEntries(CATEGORIES.map((category) => [category, score(row[category])])) as Record<Category, number | null>;
  if (Object.values(scores).some((value) => value === null) || typeof row.flag !== 'boolean') return null;
  return {
    scores: scores as Record<Category, number>, flag: row.flag, interior: typeof row.interior === 'number' && row.interior >= 0 ? row.interior : 0,
    restates: row.restates === true, contradicts: row.contradicts === true, differs: score(row.differs) ?? 3,
  };
};

export function parseArmLabel(raw: Record<string, unknown> | null): ArmLabel | null {
  if (!raw) return null;
  const A = readReply(raw.A);
  const B = readReply(raw.B);
  const prefer = String(raw.prefer ?? '');
  const differs = raw.differs === null || raw.differs === undefined ? null : String(raw.differs);
  if (!A || !B || !['A', 'B', 'tie'].includes(prefer) || (differs !== null && !['A', 'B', 'tie'].includes(differs))) return null;
  return { A, B, prefer: prefer as ArmLabel['prefer'], differs: differs as ArmLabel['differs'], note: typeof raw.note === 'string' ? raw.note : '' };
}

export function plumbingArmLabel(key: BlindKey<ArmSecret>) {
  return (item: { id: string } & ArmPayload): ArmLabel => {
    const on: Side = key.items[item.id].A === 'on' ? 'A' : 'B';
    const reply = (side: Side): ReplyLabel => ({ scores: { character: 3, scene: 3, prose: 3, agency: 3 }, flag: false, interior: side === on ? 0 : 1, restates: false, contradicts: false, differs: side === on ? 4 : 2 });
    return { A: reply('A'), B: reply('B'), prefer: 'tie', differs: item.gate === 'swipe' ? on : null, note: 'plumbing' };
  };
}

export interface ArmScoreInput {
  fixture: ArmFixture;
  fixtureHash: string;
  frozenHash: string | null;
  records: ArmRecord[];
  key: BlindKey<ArmSecret>;
  labels: Map<string, StoredLabel<ArmLabel>>;
}

const mean = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);

export function scoreArms({ fixture, fixtureHash, frozenHash, records, key, labels }: ArmScoreInput) {
  const gate = fixture.gate;
  const incomplete: string[] = [];
  if (frozenHash !== fixtureHash) incomplete.push(`the fixture hash ${fixtureHash.slice(0, 12)} is not the frozen ${String(frozenHash).slice(0, 12)}`);
  const recordOf = new Map(records.filter((record) => record.gate === gate).map((record) => [record.key, record]));
  const byCase = new Map(fixture.cases.map((entry) => [entry.id, entry]));
  for (const entry of fixture.cases) for (const arm of PROMPT_ARMS) if (!recordOf.has(armKey(entry.id, arm))) incomplete.push(`${armKey(entry.id, arm)}: no record`);
  const rows: Array<{ id: string; caseId: string; on: ReplyLabel; off: ReplyLabel; prefer: PromptArm | 'tie'; differs: PromptArm | 'tie' | null; rater: string | null }> = [];
  for (const [id, secret] of Object.entries(key.items)) {
    const on = recordOf.get(armKey(secret.caseId, 'on'));
    const off = recordOf.get(armKey(secret.caseId, 'off'));
    if (!on || !off) continue;
    if (!armMarkerSeen(gate, on.capture.requests.at(-1) ?? '')) incomplete.push(`${on.key}: the on arm's request lacks its block`);
    if (armMarkerSeen(gate, off.capture.requests.at(-1) ?? '')) incomplete.push(`${off.key}: the off arm's request carries the block`);
    for (const record of [on, off]) if (!record.capture.reply.trim()) incomplete.push(`${record.key}: empty reply`);
    const stored = labels.get(id);
    const label = stored?.label ?? null;
    if (!label) { incomplete.push(`${id}: no valid label`); continue; }
    const sideOf = (arm: PromptArm): Side => ((secret.A === arm) ? 'A' : 'B');
    const armOf = (side: Side | 'tie' | null): PromptArm | 'tie' | null => {
      if (side === null) return null;
      if (side === 'tie') return 'tie';
      if (side === 'A') return secret.A;
      return secret.A === 'on' ? 'off' : 'on';
    };
    rows.push({ id, caseId: secret.caseId, on: label[sideOf('on')], off: label[sideOf('off')], prefer: armOf(label.prefer) as PromptArm | 'tie', differs: armOf(label.differs), rater: stored?.rater ?? null });
  }
  const categories = Object.fromEntries(CATEGORIES.map((category) => {
    const delta = mean(rows.map((row) => row.on.scores[category] - row.off.scores[category]));
    return [category, { onMinusOff: delta, ok: delta !== null && delta >= -0.2 }];
  }));
  const flags = { on: rows.filter((row) => row.on.flag).length, off: rows.filter((row) => row.off.flag).length };
  const armRecords = (arm: PromptArm) => [...recordOf.values()].filter((record) => record.arm === arm);
  const closure = { on: armRecords('on').filter((record) => closed(record.capture)).length, off: armRecords('off').filter((record) => closed(record.capture)).length };
  const checks: Record<string, unknown> = {
    categories, flags: { ...flags, ok: flags.on <= flags.off + 2 }, thinkingClosure: { ...closure, ok: closure.on >= closure.off },
  };
  const percentDown = (onCount: number, offCount: number) => (offCount >= 10 ? { down: 1 - onCount / offCount, min: 0.5, ok: 1 - onCount / offCount >= 0.5 } : { down: null, note: `off has ${offCount} positives (< 10): counts only, no percentage floor`, ok: true });
  if (gate === 'outward') {
    const interior = { on: rows.reduce((sum, row) => sum + row.on.interior, 0), off: rows.reduce((sum, row) => sum + row.off.interior, 0) };
    const restated = rows.filter((row) => row.on.restates).length;
    const needles = armRecords('on').filter((record) => byCase.get(record.caseId)?.motiveNeedles?.every((needle) => record.capture.reply.toLowerCase().includes(needle.toLowerCase()))).length;
    checks.interior = { ...interior, perTenOn: rows.length ? (interior.on / rows.length) * 10 : null, perTenOff: rows.length ? (interior.off / rows.length) * 10 : null, ...percentDown(interior.on, interior.off) };
    checks.secretRestatement = { solOn: restated, needleOn: needles, ok: restated === 0 };
  }
  if (gate === 'swipe') {
    const decided = rows.filter((row) => row.differs === 'on' || row.differs === 'off');
    const copied = armRecords('on').filter((record) => copiedSpan(record.capture.reply, fill(byCase.get(record.caseId)?.rejected ?? '', record.cast))).length;
    const won = ratio(decided.filter((row) => row.differs === 'on').length, rows.length);
    checks.differs = { onWins: decided.filter((row) => row.differs === 'on').length, of: rows.length, share: won, min: 0.6, ok: won !== null && won >= 0.6 };
    checks.copiedSpan = { on: copied, off: armRecords('off').filter((record) => copiedSpan(record.capture.reply, fill(byCase.get(record.caseId)?.rejected ?? '', record.cast))).length, max: 2, ok: copied <= 2 };
  }
  if (gate === 'notes') {
    const echoes = armRecords('on').filter((record) => echoed(record.capture.raw)).length;
    const contradicts = { on: rows.filter((row) => row.on.contradicts).length, off: rows.filter((row) => row.off.contradicts).length };
    checks.echo = { on: echoes, max: 2, ok: echoes <= 2 };
    checks.contradictions = { ...contradicts, ...percentDown(contradicts.on, contradicts.off) };
  }
  const plumbing = records.some((record) => record.plumbing || record.capture?.plumbing) || rows.some((row) => row.rater === 'plumbing');
  const allOk = Object.values(checks).every((check) => {
    const value = check as Record<string, unknown>;
    return typeof value.ok === 'boolean' ? value.ok : Object.values(value).every((inner) => (inner as { ok?: boolean }).ok !== false);
  });
  const verdict = plumbing ? 'PLUMBING' : incomplete.length ? 'INCOMPLETE' : allOk ? 'PASS' : 'FAIL';
  return {
    plan: GATES[gate].plan, gate, setting: GATES[gate].setting, floor: GATES[gate].floor, informational: true, verdict,
    ...(plumbing ? { note: 'plumbing records or labels: canned replies or canned labels, never a measurement' } : {}),
    fixture: { sha256: fixtureHash, frozen: frozenHash, cases: fixture.cases.length, synthetic: fixture.synthetic },
    preference: { on: rows.filter((row) => row.prefer === 'on').length, off: rows.filter((row) => row.prefer === 'off').length, tie: rows.filter((row) => row.prefer === 'tie').length },
    checks, incomplete, pairs: rows.length, raters: [...new Set(rows.map((row) => row.rater ?? 'none'))].sort(),
  };
}

export const fixtureHashOf = (fixture: unknown) => canonicalHash(fixture);
