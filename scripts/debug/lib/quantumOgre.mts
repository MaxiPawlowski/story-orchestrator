export const QO_BOOK = 'SO-QO Lab';
export const QO_STORY_ID = 'so-qo-lab';
export const QO_GROUP = 'Group: Arin, DM Narrator';
export const QO_MEMBERS = ['Arin', 'Ponticius', 'Luke', 'DM Narrator'] as const;
export const QO_DIR = 'test/scenarios/probe';
export const QO_SESSIONS = 'test/sessions/qogre';
export const QO_SWIPES = 5;
export const QO_NARRATOR = 'DM Narrator';

export type QoKind = 'container' | 'knowledge' | 'trace';
export type QoTag = 'probe' | `ask-${number}` | 'filler-1' | 'filler-2' | 'filler-3' | 'reask-later' | 'leave' | 'return' | 'reask-revisit';

export interface QoTurn { line: string; speaker: string }

export interface QoCase {
  id: string;
  kind: QoKind;
  holder: string;
  place: string;
  keys: string[];
  lore: string;
  fact: string;
  unstated: string;
  needles: string[];
  probe: QoTurn;
  ask: string;
  fillers: [QoTurn, QoTurn, QoTurn];
  reask: string;
  reask2: string;
}

const away = 'We head over to the fish market to buy some lunch.';
const back = (place: string) => `Once we have eaten, we walk back to ${place}.`;

const fillers = (a: string, b: string): [QoTurn, QoTurn, QoTurn] => [
  { line: `Let's not stand here all day. ${a}, are you hungry yet?`, speaker: a },
  { line: `${b}, what is the guild paying for work this week?`, speaker: b },
  { line: 'I stretch and look up at the sky. It looks like rain later.', speaker: QO_NARRATOR },
];

export const QO_CASES: readonly QoCase[] = [
  {
    id: 'c1-strongbox', kind: 'container', holder: QO_NARRATOR, place: "the harbourmaster's office", keys: ['strongbox'],
    lore: "[Saltgate, the harbourmaster's office: the small iron strongbox on the desk holds exactly three things and nothing else: a brass compass, three silver coins, and a folded sea chart.]",
    fact: 'The strongbox holds exactly three things and nothing else: a brass compass, three silver coins, and a folded sea chart.',
    unstated: 'what is etched on the underside of the lid', needles: ['compass', 'coin', 'chart'],
    probe: { line: "I step into the harbourmaster's office and look around. A small iron strongbox sits on the desk, still shut. I don't touch it yet. What else is in the room?", speaker: QO_NARRATOR },
    ask: "I lift the strongbox's lid. What is inside? And what is etched on the underside of the lid?",
    fillers: fillers('Luke', 'Ponticius'),
    reask: 'I check the strongbox one more time. What exactly is in it?',
    reask2: 'I open the strongbox again. What is in it now?',
  },
  {
    id: 'c2-drawer', kind: 'container', holder: QO_NARRATOR, place: "the guild infirmary", keys: ['drawer'],
    lore: "[Saltgate guildhall, the infirmary: the locked drawer of the apothecary's cabinet holds exactly two things and nothing else: two glass vials of blue tincture and a ledger bound in red leather.]",
    fact: 'The locked drawer holds exactly two things and nothing else: two glass vials of blue tincture and a ledger bound in red leather.',
    unstated: 'what the drawer smells like', needles: ['vial', 'ledger'],
    probe: { line: "I walk into the guild infirmary. There's an apothecary's cabinet with a locked drawer. I leave the drawer alone for now. What does the room look like?", speaker: QO_NARRATOR },
    ask: 'I pick the lock and pull the drawer open. What is inside? And what does the drawer smell like?',
    fillers: fillers('Arin', 'Ponticius'),
    reask: 'I look into the drawer again. What exactly is in it?',
    reask2: 'I open the drawer once more. What is in it now?',
  },
  {
    id: 'c3-sea-chest', kind: 'container', holder: QO_NARRATOR, place: 'the guildhall cellar', keys: ['sea chest', 'chest'],
    lore: '[Saltgate guildhall, the cellar: the old sea chest under the stairs holds exactly three things and nothing else: a wool cloak, a coil of tarred rope, and a tin lantern.]',
    fact: 'The sea chest holds exactly three things and nothing else: a wool cloak, a coil of tarred rope, and a tin lantern.',
    unstated: 'what name is painted on the chest', needles: ['cloak', 'rope', 'lantern'],
    probe: { line: "I go down the steps into the guildhall cellar. An old sea chest sits under the stairs, lid closed. I don't open it yet. What else is down here?", speaker: QO_NARRATOR },
    ask: 'I open the sea chest. What is inside? And what name is painted on the chest?',
    fillers: fillers('Luke', 'Arin'),
    reask: 'I look in the sea chest again. What exactly is in it?',
    reask2: 'I open the sea chest once more. What is in it now?',
  },
  {
    id: 'c4-niche', kind: 'container', holder: QO_NARRATOR, place: 'the shrine of the Tide Mother', keys: ['niche', 'curtain'],
    lore: '[Saltgate, the shrine of the Tide Mother: the niche behind the shrine curtain holds exactly two things and nothing else: a bone flute and a dried white rose.]',
    fact: 'The niche behind the curtain holds exactly two things and nothing else: a bone flute and a dried white rose.',
    unstated: 'what the niche is lined with', needles: ['flute', 'rose'],
    probe: { line: "I enter the shrine of the Tide Mother. A heavy curtain hangs over a niche behind the altar. I don't draw it yet. What do I see in the shrine?", speaker: QO_NARRATOR },
    ask: 'I draw back the curtain and look into the niche. What is in it? And what is the niche lined with?',
    fillers: fillers('Arin', 'Ponticius'),
    reask: 'I look into the niche again. What exactly is in it?',
    reask2: 'I draw the curtain aside again. What is in the niche now?',
  },
  {
    id: 'k1-bell', kind: 'knowledge', holder: 'Arin', place: 'the bell tower square', keys: ['bell'],
    lore: '[Private knowledge for Arin only: last night Arin saw who rang the harbour bell at midnight. It was the night porter, Hessa Vane. If asked directly, Arin answers truthfully.]',
    fact: 'The harbour bell was rung at midnight by the night porter, Hessa Vane.',
    unstated: 'why the bell was rung', needles: ['hessa'],
    probe: { line: 'We reach the square under the bell tower. Luke, someone rang the harbour bell at midnight last night. Did you see who it was?', speaker: 'Luke' },
    ask: 'Arin, you were out last night. Who rang the harbour bell at midnight, and why do you think they rang it?',
    fillers: fillers('Luke', 'Ponticius'),
    reask: 'Arin, tell me again: who rang the bell at midnight?',
    reask2: 'Arin, one more time, who rang the harbour bell last night?',
  },
  {
    id: 'k2-seal', kind: 'knowledge', holder: 'Ponticius', place: "the guildmaster's study", keys: ['seal'],
    lore: "[Private knowledge for Ponticius only: Ponticius knows the guild's missing brass seal was pawned at the Lantern Pawnshop on Cobble Row. If asked directly, Ponticius answers truthfully.]",
    fact: "The guild's missing brass seal was pawned at the Lantern Pawnshop on Cobble Row.",
    unstated: 'how much money the seal fetched', needles: ['lantern'],
    probe: { line: "We step into the guildmaster's study. Arin, the guild's brass seal has gone missing. Do you know where it ended up?", speaker: 'Arin' },
    ask: "Ponticius, where did the guild's missing seal end up? And how much did it fetch?",
    fillers: fillers('Luke', 'Arin'),
    reask: 'Ponticius, say it once more: where is the missing seal?',
    reask2: 'Ponticius, remind me where the guild seal ended up.',
  },
  {
    id: 'k3-courier', kind: 'knowledge', holder: 'Arin', place: 'the courier post', keys: ['courier'],
    lore: "[Private knowledge for Arin only: Arin knows the courier Tamsin Orr left the city through the Weavers' Gate before dawn. If asked directly, Arin answers truthfully.]",
    fact: "The courier Tamsin Orr left the city through the Weavers' Gate before dawn.",
    unstated: 'what the courier was carrying', needles: ['weaver'],
    probe: { line: 'We stop at the courier post. Ponticius, the courier left the city this morning. Which gate did the courier use?', speaker: 'Ponticius' },
    ask: 'Arin, which gate did the courier leave the city by? And what was the courier carrying?',
    fillers: fillers('Luke', 'Ponticius'),
    reask: 'Arin, which gate was it again that the courier used?',
    reask2: 'Arin, remind me which gate the courier left by.',
  },
  {
    id: 't1-lock', kind: 'trace', holder: 'Ponticius', place: 'warehouse nine', keys: ['lock', 'warehouse'],
    lore: '[Private knowledge for Ponticius only: Ponticius knows who forced the lock on warehouse nine: the dockhand Brannoc Teale, using a bent iron hook. If asked directly, Ponticius answers truthfully.]',
    fact: 'The lock on warehouse nine was forced by the dockhand Brannoc Teale, using a bent iron hook.',
    unstated: 'at what time of night the lock was forced', needles: ['brannoc'],
    probe: { line: 'We reach warehouse nine. The lock on the door has been forced. Luke, any idea who did this?', speaker: 'Luke' },
    ask: 'Ponticius, who forced the lock on this warehouse? And at what time of night did it happen?',
    fillers: fillers('Luke', 'Arin'),
    reask: 'Ponticius, who was it again that forced the warehouse lock?',
    reask2: 'Ponticius, remind me who forced the lock on the warehouse.',
  },
  {
    id: 't2-crescent', kind: 'trace', holder: 'Arin', place: 'the old well yard', keys: ['crescent', 'well'],
    lore: "[Private knowledge for Arin only: Arin knows who carved the crescent mark into the old well's rim: the stonecutter Ilse Marrow. If asked directly, Arin answers truthfully.]",
    fact: "The crescent mark on the old well's rim was carved by the stonecutter Ilse Marrow.",
    unstated: 'what tool the mark was carved with', needles: ['ilse'],
    probe: { line: "We come into the old well yard. Someone has carved a crescent mark into the well's rim. Luke, do you know who carved it?", speaker: 'Luke' },
    ask: 'Arin, who carved the crescent mark on the well? And what tool did they use?',
    fillers: fillers('Luke', 'Ponticius'),
    reask: 'Arin, who was it that carved the crescent on the well?',
    reask2: 'Arin, remind me who carved the crescent mark on the well.',
  },
  {
    id: 't3-bootprints', kind: 'trace', holder: 'Ponticius', place: 'the guild archive', keys: ['bootprints', 'archive'],
    lore: '[Private knowledge for Ponticius only: Ponticius knows who left the muddy bootprints in the guild archive: the clerk Odo Penrick. If asked directly, Ponticius answers truthfully.]',
    fact: 'The muddy bootprints in the guild archive were left by the clerk Odo Penrick.',
    unstated: 'where the person had come from before', needles: ['odo', 'penrick'],
    probe: { line: 'We open the guild archive. Muddy bootprints cross the floor between the shelves. Arin, do you know whose bootprints these are?', speaker: 'Arin' },
    ask: 'Ponticius, whose muddy bootprints are these in the archive? And where had that person come from?',
    fillers: fillers('Luke', 'Arin'),
    reask: 'Ponticius, whose bootprints were they again?',
    reask2: 'Ponticius, remind me who left the bootprints in the archive.',
  },
];

export function labStory() {
  return {
    format: 2,
    id: QO_STORY_ID,
    title: 'SO-QO Lab',
    description: 'v2.8 62 stage 1 lab: a synthetic harbour town where each probe case hands one committed fact to its holder through a member-filtered lore entry (or a world entry for a closed container).',
    qualities: [{ key: 'location', type: 'enum', values: ['town', 'elsewhere'], source: 'extractor', rubric: 'Where is the party now?' }],
    checkpoints: [{ id: 'town', name: 'Saltgate', objective: 'Look into the small mysteries of Saltgate.', type: 'anchor', start: true }],
    transitions: [],
    roster: [
      { id: 'narrator', name: QO_NARRATOR },
      { id: 'arin', name: 'Arin' },
      { id: 'ponticius', name: 'Ponticius' },
      { id: 'luke', name: 'Luke' },
    ],
    requirements: { members: ['Arin', 'Ponticius', 'Luke', QO_NARRATOR], lorebooks: [QO_BOOK] },
  };
}

export function labBook() {
  const entries: Record<string, unknown> = {};
  QO_CASES.forEach((item, uid) => {
    entries[String(uid)] = {
      uid, key: item.keys, keysecondary: [], comment: `qo ${item.id}`, content: item.lore, constant: false, vectorized: false, selective: true, selectiveLogic: 0,
      addMemo: true, order: 100, position: 1, disable: false, excludeRecursion: true, preventRecursion: true, delayUntilRecursion: 0, probability: 100, useProbability: true,
      depth: 4, group: '', groupOverride: false, groupWeight: 100, scanDepth: null, caseSensitive: null, matchWholeWords: null, useGroupScoring: null, automationId: '', role: 0,
      sticky: null, cooldown: null, delay: null, displayIndex: uid,
      characterFilter: { isExclude: false, names: item.kind === 'container' ? [] : [item.holder], tags: [] },
    };
  });
  return { entries };
}

const js = (value: unknown) => JSON.stringify(value);

export function tagsOf(): QoTag[] {
  return ['probe', ...Array.from({ length: QO_SWIPES + 1 }, (_, index) => `ask-${index}` as QoTag), 'filler-1', 'filler-2', 'filler-3', 'reask-later', 'leave', 'return', 'reask-revisit'];
}

export function recordEval(caseId: string, tag: string): string {
  return `const ctx = SillyTavern.getContext(); const id = ctx.chat.length - 1; const m = ctx.chat[id]; if (!m || m.is_user || m.is_system) throw new Error(${js(`${caseId} ${tag}: the newest message is not a reply`)}); const text = String(m.mes ?? ''); if (!text.trim()) throw new Error(${js(`${caseId} ${tag}: empty reply`)}); const row = { case: ${js(caseId)}, tag: ${js(tag)}, speaker: String(m.name ?? ''), mesId: id, swipe: Number(m.swipe_id ?? 0), swipes: Array.isArray(m.swipes) ? m.swipes.length : 1, text }; globalThis.__qoRec.push(row); return { tag: row.tag, speaker: row.speaker, mesId: id, swipe: row.swipe, chars: text.length };`;
}

const trigger = (speaker: string) => ({ slash: `/trigger await=true ${js(speaker)}` });
const send = (line: string) => ({ send: line });
const idle = { wait: { idle: true, timeoutMs: 900000 } };

export function caseScenario(item: QoCase) {
  const turn = (line: string, speaker: string, tag: string) => [send(line), trigger(speaker), idle, { eval: recordEval(item.id, tag), log: 200 }];
  const preflight = `const ctx = SillyTavern.getContext(); const wi = await import('/scripts/world-info.js'); if (!ctx.groupId || !ctx.chatId) throw new Error('needs a group chat (run through so-qogre.mts, which opens a sandbox chat)'); if (!wi.world_names.includes(${js(QO_BOOK)})) throw new Error(${js(`the lab lorebook "${QO_BOOK}" is missing: so-qogre.mts run creates it before the cases`)}); globalThis.__qoRec = globalThis.__qoRec ?? []; globalThis.storyOrchestratorRuntime.setExtractionSettings({ enabled: false }); return { case: ${js(item.id)}, chat: ctx.chatId, recorded: globalThis.__qoRec.length };`;
  const ready = `const rt = globalThis.storyOrchestratorRuntime; const snap = rt.getSnapshot(); if (snap.storyId !== ${js(QO_STORY_ID)}) throw new Error('the lab story is not active: ' + snap.storyId); if (snap.requirements && snap.requirements.ready === false) throw new Error('lab requirements not ready: ' + JSON.stringify(snap.requirements)); return { story: snap.storyId, checkpoint: snap.activeCheckpointId };`;
  const swipes = Array.from({ length: QO_SWIPES }, (_, index) => [
    { swipe: { messageId: 'last', swipeId: 'new' } },
    idle,
    { eval: recordEval(item.id, `ask-${index + 1}`), log: 200 },
  ]).flat();
  const transcript = `const ctx = SillyTavern.getContext(); globalThis.__qoRec.push({ case: ${js(item.id)}, tag: 'transcript', rows: ctx.chat.map((m, i) => ({ i, name: String(m.name ?? ''), user: Boolean(m.is_user), system: Boolean(m.is_system), swipe: Number(m.swipe_id ?? 0), text: String(m.mes ?? '') })) }); return { rows: ctx.chat.length };`;
  return {
    _note: `v2.8 62 stage 1 probe case ${item.id} (${item.kind}, holder ${item.holder}). Generated by so-qogre.mts scenarios; run it through so-qogre.mts run, which opens a sandbox chat, creates the lab lorebook, serves replies (Sol relay on a no-model lane, or the lane's own model with --relay none) and rates the recorded replies.`,
    requires: { group: QO_GROUP, members: [...QO_MEMBERS], judge: 'off', briefingDraft: 'off', innerBeat: 'off' },
    steps: [
      { eval: preflight, log: 300 },
      { import_story: { file: './quantum-ogre-lab.story.json' } },
      { eval: ready, log: 200 },
      ...turn(item.probe.line, item.probe.speaker, 'probe'),
      ...turn(item.ask, item.holder, 'ask-0'),
      ...swipes,
      ...item.fillers.flatMap((filler, index) => turn(filler.line, filler.speaker, `filler-${index + 1}`)),
      ...turn(item.reask, item.holder, 'reask-later'),
      ...turn(away, QO_NARRATOR, 'leave'),
      ...turn(back(item.place), QO_NARRATOR, 'return'),
      ...turn(item.reask2, item.holder, 'reask-revisit'),
      { eval: transcript, log: 100 },
    ],
  };
}

export const ABA_TEXT = {
  a: 'Arin pushes at the vault door and it grinds open onto darkness.',
  b: 'Arin turns away and leads you back into the long hall, torches guttering.',
};

export function abaScenario() {
  const snap = "const rt = globalThis.storyOrchestratorRuntime; const s = rt.getEngineState(); const live = (row) => !row.supersededBy && (!row.provenance || row.provenance.validity === 'live'); return { engine: { active: s.activeCheckpointId, boundary: s.boundary, values: s.blackboard.values, versions: s.blackboard.versions, path: s.visitedPath, last: s.lastMessageId }, pending: (rt.engine?.pendingWrites ?? []).map((w) => ({ range: w.turnRange ?? null, deltas: (w.deltas ?? []).map((d) => d.q + '=' + JSON.stringify(d.v)) })), memory: [...new Set((rt.getSnapshot().memory?.entries ?? []).filter(live).map((r) => r.tier + '|' + (r.messageId ?? '-') + '|' + r.text))].sort() };";
  const mock = (q: string, evidence: string) => `DELTA q=location value="${q}" evidence="${evidence}"
MEMORY type=fact importance=2 expiration=permanent text="The party is at the ${q}." evidence="${evidence}"`;
  const setMock = (text: string) => `globalThis.storyOrchestratorDebugExtractionResponse = ${js(text)}; return { mock: ${js(text)} };`;
  const record = (swipe: number, want: string) => `const ctx = SillyTavern.getContext(); const rt = globalThis.storyOrchestratorRuntime; const id = ctx.chat.length - 1; const m = ctx.chat[id]; if (!m || m.is_user) throw new Error('the newest message is not a reply'); if ((m.swipe_id ?? 0) !== ${swipe}) throw new Error('expected swipe ${swipe}, at ' + m.swipe_id); if (rt.getEngineState().lastMessageId !== id) throw new Error('reply not committed'); globalThis.__qo3.id = id; globalThis.__qo3.records[${swipe}] = globalThis.__qo3.snap(); const rec = globalThis.__qo3.records[${swipe}]; const landed = (rec.engine.values.location === ${js(want)} || rec.pending.some((w) => w.deltas.includes('location=' + JSON.stringify(${js(want)})))) && rec.memory.some((row) => row.includes(${js(`at the ${want}`)})); if (!landed) throw new Error('swipe ${swipe}: the read did not land (values ' + JSON.stringify(rec.engine.values) + ', pending ' + JSON.stringify(rec.pending) + ', want ${want}); audits ' + JSON.stringify(rt.getExtractionAudits().slice(-2).map((a) => ({ reason: a.reason, accepted: a.accepted?.length, rejected: a.rejected })))); return { swipe: ${swipe}, values: rec.engine.values, pending: rec.pending, memory: rec.memory };`;
  const compare = (swipe: number, leg: number) => `const ctx = SillyTavern.getContext(); const s = globalThis.__qo3; const m = ctx.chat[s.id]; if (ctx.chat.length - 1 !== s.id) throw new Error('the chat grew during a swipe-back'); if ((m.swipe_id ?? 0) !== ${swipe}) throw new Error('swipe-back landed on ' + m.swipe_id); const now = s.snap(); const want = s.records[${swipe}]; const equal = JSON.stringify(now) === JSON.stringify(want); s.legs.push({ leg: ${leg}, swipe: ${swipe}, equal, now: equal ? null : now, want: equal ? null : want }); if (!equal) throw new Error('Q3 leg ${leg}: state differs from the first visit of swipe ${swipe}: ' + JSON.stringify({ now, want }).slice(0, 600)); return { leg: ${leg}, swipe: ${swipe}, equal };`;
  const init = `const ctx = SillyTavern.getContext(); if (!ctx.groupId || !ctx.chatId) throw new Error('needs a group chat (so-qogre.mts swipe-aba)'); globalThis.storyOrchestratorRuntime.setExtractionSettings({ enabled: true, cadence: 1, stabilityLag: 0 }); globalThis.__qo3 = { records: {}, legs: [], id: null, snap: new Function(${js(snap)}) }; return { extraction: globalThis.storyOrchestratorRuntime.getGlobalSettings().extraction };`;
  const settle = { wait: { schedulerIdle: true, quietMs: 6000, timeoutMs: 120000 } };
  return {
    _note: 'v2.8 62 Q3: swipe A -> B -> A in the browser on a no-model lane through ST\'s own swipe function (ctx.swipe.to), replies from the scripted relay (so-qogre.mts swipe-aba; plain so-scenario has no reply source), reads from per-swipe extraction mocks. A poison mock is set before every swipe-back, so a fresh read would move the state; the floor is that blackboard and live memory equal the first visit of each swipe (2 legs per run).',
    requires: { lane: 'no-model', group: QO_GROUP, members: ['Arin', QO_NARRATOR], judge: 'off', briefingDraft: 'off', innerBeat: 'off' },
    steps: [
      { eval: init, log: 300 },
      { import_story: { file: './quantum-ogre-aba.story.json' } },
      { eval: setMock(mock('vault', 'grinds open onto darkness')) },
      { send: 'I put my shoulder to the heavy door.' },
      trigger('Arin'),
      idle,
      settle,
      { eval: record(0, 'vault'), log: 300 },
      { eval: setMock(mock('hall', 'torches guttering')) },
      { swipe: { messageId: 'last', swipeId: 'new' } },
      idle,
      settle,
      { eval: record(1, 'hall'), log: 300 },
      { eval: setMock(mock('cellar', 'the cellar stair')) },
      { swipe: { messageId: 'last', swipeId: 0 } },
      idle,
      settle,
      { eval: compare(0, 1), log: 300 },
      { swipe: { messageId: 'last', swipeId: 1 } },
      idle,
      settle,
      { eval: compare(1, 2), log: 300 },
      { eval: 'delete globalThis.storyOrchestratorDebugExtractionResponse; return { legs: globalThis.__qo3.legs.map((leg) => ({ leg: leg.leg, swipe: leg.swipe, equal: leg.equal })) };', log: 300 },
    ],
  };
}

export function abaStory() {
  return {
    format: 2,
    id: 'so-qo-aba',
    title: 'SO-QO Swipe ABA',
    description: 'v2.8 62 Q3: one extractor quality that each swipe reads differently.',
    qualities: [{ key: 'location', type: 'enum', values: ['square', 'vault', 'hall', 'cellar'], source: 'extractor', rubric: 'Where is the party now?' }],
    checkpoints: [{ id: 'gate', name: 'The Gate', objective: 'Get through the vault.', type: 'anchor', start: true }, { id: 'square', name: 'The Square', objective: 'Back in the square.', type: 'anchor' }],
    transitions: [{ from: 'gate', to: 'square', priority: 1, gate: { q: 'location', op: '==', v: 'square' } }],
    roster: [{ id: 'narrator', name: QO_NARRATOR }, { id: 'arin', name: 'Arin' }],
    requirements: { members: ['Arin', QO_NARRATOR] },
  };
}

export function abaScript({ index }: { index: number }): string {
  return index === 0 ? ABA_TEXT.a : index === 1 ? ABA_TEXT.b : `Arin waits (${index}).`;
}

export function scenarioFiles(): Array<[string, unknown]> {
  return [
    [`${QO_DIR}/quantum-ogre-lab.story.json`, labStory()],
    [`${QO_DIR}/quantum-ogre-lab.book.json`, labBook()],
    [`${QO_DIR}/quantum-ogre-aba.story.json`, abaStory()],
    [`${QO_DIR}/quantum-ogre-swipe-aba.json`, abaScenario()],
    ...QO_CASES.map((item) => [`${QO_DIR}/quantum-ogre-${item.id}.json`, caseScenario(item)] as [string, unknown]),
  ];
}

export const caseFile = (item: QoCase) => `${QO_DIR}/quantum-ogre-${item.id}.json`;

export interface QoReply { case: string; tag: string; speaker: string; mesId: number; swipe: number; swipes: number; text: string }
export interface QoTranscript { case: string; tag: 'transcript'; rows: Array<{ i: number; name: string; user: boolean; system: boolean; swipe: number; text: string }> }

export interface QoRating {
  case: string;
  tag: string;
  speaker: string;
  statesFact: boolean;
  contradicts: boolean;
  conflicting: string[];
  detail: string | null;
  stringFact: boolean | null;
  needlesNamed: string[];
  error?: string;
}

export const RATER_SYSTEM = [
  'You check one roleplay reply against one fact a story committed to beforehand. You see only the fact, the player\'s line and the reply; you never see the rest of the story.',
  'Answer with exactly one JSON object and nothing else:',
  '{"states_fact": boolean, "contradicts": boolean, "conflicting": [string], "detail": string|null}.',
  'states_fact: the reply states or clearly implies the committed answer (for a closed container: names at least one of its items as being inside; for a person or place: names that person or place as the answer).',
  'contradicts: the reply asserts something that cannot be true if the fact holds. For a closed container, ANY item said to be inside that is not one of the listed items counts (an addition), as does a listed item said to be absent or different. For a person or place, naming a different person or place as the answer counts. Not knowing, refusing, deflecting, hinting, or adding colour that does not conflict (moods, sounds, descriptions of the room around it) does not count.',
  'conflicting: every conflicting item, person or place named, as short phrases (empty when contradicts is false).',
  'detail: the reply\'s answer to the extra question named as the unstated detail, in at most eight words, or null when the reply does not answer it.',
].join('\n');

export function raterPrompt(item: QoCase, reply: { text: string }, playerLine: string): string {
  return [
    `Kind: ${item.kind === 'container' ? 'closed container (its listed contents are complete)' : item.kind === 'knowledge' ? 'what a character knows' : 'who left a trace'}`,
    `Committed fact: ${item.fact}`,
    `Unstated detail (never fixed by the story): ${item.unstated}`,
    `Player's line before the reply: ${playerLine}`,
    'Reply:',
    reply.text,
  ].join('\n');
}

export function parseRating(raw: Record<string, unknown> | null): Omit<QoRating, 'case' | 'tag' | 'speaker' | 'stringFact' | 'needlesNamed'> | null {
  if (!raw || typeof raw.states_fact !== 'boolean' || typeof raw.contradicts !== 'boolean') return null;
  const conflicting = Array.isArray(raw.conflicting) ? raw.conflicting.filter((entry): entry is string => typeof entry === 'string') : [];
  const detail = typeof raw.detail === 'string' && raw.detail.trim() ? raw.detail.trim() : null;
  return { statesFact: raw.states_fact, contradicts: raw.contradicts, conflicting: raw.contradicts ? conflicting : [], detail };
}

export function stringPass(item: QoCase, text: string): { stringFact: boolean | null; needlesNamed: string[] } {
  const lower = text.toLowerCase();
  const needlesNamed = item.needles.filter((needle) => lower.includes(needle));
  return { stringFact: item.kind === 'container' ? null : needlesNamed.length > 0, needlesNamed };
}

export const AGREEMENT_SYSTEM = 'You compare short answers to the same question. Answer with exactly one JSON object: {"largest_group": integer, "groups": integer}. Two answers belong together when they give the same substance in different words. largest_group is the size of the biggest group of answers that agree; groups is how many distinct groups there are. Missing answers (null) never join a group.';

export function agreementPrompt(item: QoCase, details: Array<string | null>): string {
  return [`Question: ${item.unstated}`, ...details.map((detail, index) => `Answer ${index + 1}: ${detail ?? 'null'}`)].join('\n');
}

export function playerLineBefore(item: QoCase, tag: string): string {
  if (tag === 'probe') return item.probe.line;
  if (tag.startsWith('ask-')) return item.ask;
  if (tag.startsWith('filler-')) return item.fillers[Number(tag.slice(7)) - 1].line;
  if (tag === 'reask-later') return item.reask;
  if (tag === 'leave') return away;
  if (tag === 'return') return back(item.place);
  if (tag === 'reask-revisit') return item.reask2;
  return '';
}

export interface QoCaseScore {
  case: string;
  kind: QoKind;
  q1: { replies: number; contradictions: number; conflictingItems: number; statesFact: number };
  q2: { replies: number; contradictions: number; statesFact: number };
  q2d: { eligible: number; disclosures: number; tags: string[] };
  q2a: { answered: number; largestGroup: number | null; groups: number | null };
  stringAgreement: { compared: number; agree: number };
  errors: number;
}

const PERSISTENCE = new Set(['reask-later', 'reask-revisit']);
const isAsk = (tag: string) => /^ask-\d+$/.test(tag);

export function scoreCase(item: QoCase, ratings: readonly QoRating[], replies: readonly QoReply[], agreement: { largest_group: number; groups: number } | null, askLimit = QO_SWIPES + 1): QoCaseScore {
  const mine = ratings.filter((rating) => rating.case === item.id && !rating.error);
  const asks = mine.filter((rating) => isAsk(rating.tag) && Number(rating.tag.slice(4)) < askLimit);
  const persistence = mine.filter((rating) => PERSISTENCE.has(rating.tag));
  const visibleAsk = [...replies].filter((reply) => reply.case === item.id && isAsk(reply.tag)).sort((a, b) => b.swipe - a.swipe)[0] ?? null;
  const visibleRating = visibleAsk ? mine.find((rating) => rating.tag === visibleAsk.tag) ?? null : null;
  const publicAfterAsk = item.kind === 'container' ? true : Boolean(visibleRating?.statesFact);
  const order = ['probe', 'filler-1', 'filler-2', 'filler-3', 'reask-later', 'leave', 'return', 'reask-revisit'];
  const eligible = mine.filter((rating) => {
    if (rating.tag === 'probe') return true;
    if (item.kind === 'container' || publicAfterAsk) return false;
    return order.includes(rating.tag) && rating.speaker !== item.holder;
  });
  const disclosures = eligible.filter((rating) => rating.statesFact);
  const compared = mine.filter((rating) => rating.stringFact !== null);
  return {
    case: item.id,
    kind: item.kind,
    q1: { replies: asks.length, contradictions: asks.filter((rating) => rating.contradicts).length, conflictingItems: asks.reduce((sum, rating) => sum + rating.conflicting.length, 0), statesFact: asks.filter((rating) => rating.statesFact).length },
    q2: { replies: persistence.length, contradictions: persistence.filter((rating) => rating.contradicts).length, statesFact: persistence.filter((rating) => rating.statesFact).length },
    q2d: { eligible: eligible.length, disclosures: disclosures.length, tags: disclosures.map((rating) => rating.tag) },
    q2a: { answered: asks.filter((rating) => rating.detail).length, largestGroup: agreement?.largest_group ?? null, groups: agreement?.groups ?? null },
    stringAgreement: { compared: compared.length, agree: compared.filter((rating) => rating.stringFact === rating.statesFact).length },
    errors: ratings.filter((rating) => rating.case === item.id && rating.error).length,
  };
}

export const QO_FLOORS = {
  Q1: { denominator: 60, rule: 'recorded as a count of 60 (10 cases x 6 replies), every named item scored' },
  Q2: { denominator: 20, rule: 'recorded as a count of 20 (10 cases x 2 re-asks)' },
  Q2d: { expected: 0, rule: 'recorded (0 expected)' },
  Q2a: { rule: 'recorded only; never a gate' },
  Q3: { rule: '2/2 legs, x2 runs' },
} as const;

export function summarize(scores: readonly QoCaseScore[], q1Denominator: number = QO_FLOORS.Q1.denominator) {
  const sum = (pick: (score: QoCaseScore) => number) => scores.reduce((total, score) => total + pick(score), 0);
  const q1Replies = sum((score) => score.q1.replies);
  const q2Replies = sum((score) => score.q2.replies);
  return {
    cases: scores.length,
    Q1: { contradictions: sum((score) => score.q1.contradictions), of: q1Replies, denominator: q1Denominator, complete: q1Replies === q1Denominator, conflictingItems: sum((score) => score.q1.conflictingItems), statesFact: sum((score) => score.q1.statesFact) },
    Q2: { contradictions: sum((score) => score.q2.contradictions), of: q2Replies, denominator: QO_FLOORS.Q2.denominator, complete: q2Replies === QO_FLOORS.Q2.denominator, statesFact: sum((score) => score.q2.statesFact) },
    Q2d: { disclosures: sum((score) => score.q2d.disclosures), eligible: sum((score) => score.q2d.eligible), expected: 0 },
    Q2a: scores.map((score) => ({ case: score.case, largestGroup: score.q2a.largestGroup, of: score.q2a.answered })),
    byKind: (['container', 'knowledge', 'trace'] as QoKind[]).map((kind) => {
      const group = scores.filter((score) => score.kind === kind);
      return { kind, cases: group.length, q1: group.reduce((total, score) => total + score.q1.contradictions, 0), q2: group.reduce((total, score) => total + score.q2.contradictions, 0), q2d: group.reduce((total, score) => total + score.q2d.disclosures, 0) };
    }),
    stringAgreement: { compared: sum((score) => score.stringAgreement.compared), agree: sum((score) => score.stringAgreement.agree) },
    ratingErrors: sum((score) => score.errors),
  };
}
