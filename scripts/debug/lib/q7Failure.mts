import { join, resolve } from 'node:path';
import { buildBlind, ratio, type BlindKey, type BlindPack, type StoredLabel } from './blindRater.mts';
import {
  canonicalHash, clearStep, extensionBlock, fill, generateStep, helpersStep, lastRequest, lineStep, memberBlock, scenarioDoc, unsafeText,
  type Capture, type Cast, type RecordJob, type Step,
} from './replyCapture.mts';

export const S8_DIR = resolve(import.meta.dirname, '..', '..', '..', 'test', 'measurements', 'v2.8', '18-s8');
export const S8_CASES = join(S8_DIR, 'cases.json');
export const S8_FREEZE = join(S8_DIR, 'freeze.json');
export const S8_FORMAT = 'so-v18-s8/1';
export const S8_CASE_COUNT = 10;
export const S8_CLAUSE = 'Narrate only the outcomes and consequences listed. A failure means the attempt did not succeed; do not add costs the list does not name.';
export const S8_OUTCOME_KEY = 'story_orchestrator_check_outcome';
export const JUST_HAPPENED = 'Just happened, already decided';
export const S8_FLOOR_TEXT = 'S8: on 10 scripted failure outcomes the narrated reply adds no unlisted consequence (second-model rater). Floor: recorded (plan 18 §Phase Q7), informational, never retuned.';
const SLUG = /^[a-z][a-z0-9-]*$/;

export interface S8Case { id: string; check: { id: string; label: string }; quest?: { id: string; title: string }; place: string; scene: string; attempt: string }
export interface S8Fixture { format: string; synthetic: boolean; plan: string; cases: S8Case[] }

export const okKey = (entry: S8Case) => `${entry.check.id.replace(/-/g, '_')}_ok`;

export function s8Problems(fixture: S8Fixture, cast: Cast): string[] {
  const problems: string[] = [];
  if (fixture?.format !== S8_FORMAT) problems.push(`format is ${JSON.stringify(fixture?.format)}, expected ${S8_FORMAT}`);
  if (fixture?.synthetic !== true) problems.push('the fixture is not marked synthetic');
  const cases = Array.isArray(fixture?.cases) ? fixture.cases : [];
  if (cases.length !== S8_CASE_COUNT) problems.push(`${cases.length} case(s), S8 needs ${S8_CASE_COUNT}`);
  const ids = new Set<string>();
  for (const entry of cases) {
    const at = `case ${entry?.id ?? '?'}`;
    if (!SLUG.test(String(entry?.id ?? '')) || ids.has(entry.id)) problems.push(`${at}: id missing, not a slug or repeated`);
    ids.add(entry.id);
    if (!SLUG.test(String(entry.check?.id ?? '')) || !entry.check?.label) problems.push(`${at}: the check needs a slug id and a label`);
    if (entry.quest && (!SLUG.test(entry.quest.id) || !entry.quest.title)) problems.push(`${at}: the quest needs a slug id and a title`);
    for (const text of [entry.scene, entry.attempt]) {
      const unsafe = unsafeText(fill(text ?? '', cast));
      if (unsafe) problems.push(`${at}: a line ${unsafe}`);
    }
    if (/["|{}\\]/.test(`${entry.check?.label}${entry.quest?.title ?? ''}${entry.place}`)) problems.push(`${at}: a label holds a character a prompt line cannot carry`);
  }
  if (cases.filter((entry) => entry.quest).length !== S8_CASE_COUNT / 2) problems.push('half the cases list a quest failure, so the rater sees both a bare outcome and a listed consequence');
  return problems;
}

export function s8Story(entry: S8Case, cast: Cast) {
  const ok = okKey(entry);
  const tried = { q: 'tried', op: '==', v: true };
  return {
    id: `so-v18-s8-${entry.id}`,
    title: `SO-V18 S8 ${entry.id}`,
    description: `v2.8 plan 18 Q7 S8 case ${entry.id}: a public check that cannot succeed, attempted once${entry.quest ? ', failing a quest on the same boundary' : ''}.`,
    roster: [
      { id: 'companion', name: cast.receiver },
      { id: 'narrator', name: cast.narrator, role: 'narrator', view: 'omniscient' },
    ],
    qualities: [
      { key: 'tried', type: 'bool', source: 'extractor', rubric: `Has the player attempted this: ${entry.check.label}?` },
      { key: ok, type: 'bool', source: 'code', rubric: `Did this succeed: ${entry.check.label}?` },
      { key: 'lantern', type: 'bool', source: 'extractor', rubric: 'Does the player carry a lit lantern?', display: { public: true, label: 'Lantern', as: 'item' } },
      { key: 'moved_on', type: 'bool', source: 'extractor', rubric: 'Has the party moved on from here?' },
    ],
    checkpoints: [
      {
        id: 'scene', name: entry.place, player_name: entry.place, objective: `${entry.check.label}.`, type: 'anchor', start: true,
        checks: [{ id: entry.check.id, label: entry.check.label, quality: ok, roll: { sides: 20, target: 21 }, when: tried, narrate: 'public' }],
      },
      { id: 'beyond', name: 'Beyond', player_name: 'Beyond', objective: 'Go on.', type: 'anchor' },
    ],
    transitions: [{ from: 'scene', to: 'beyond', priority: 0, gate: { q: 'moved_on', op: '==', v: true } }],
    ...(entry.quest ? { quests: [{ id: entry.quest.id, title: entry.quest.title, kind: 'side', done_when: { q: ok, op: '==', v: true }, failed_when: { all: [tried, { q: ok, op: '==', v: false }] }, steps: [] }] } : {}),
  };
}

export const s8Canned = (entry: S8Case) => `The attempt to ${entry.check.label.toLowerCase()} does not succeed, and the moment passes.`;

export function s8Scenario(entry: S8Case, cast: Cast, plumbing: boolean) {
  const fails = `${entry.check.label}: fails.`;
  const ready: Step = {
    log: 600,
    eval: `const h = globalThis.__soRc; const outcome = await h.until(() => { const text = String(SillyTavern.getContext().extensionPrompts[${JSON.stringify(S8_OUTCOME_KEY)}]?.value ?? ''); return text.includes(${JSON.stringify(fails)}) ? text : null; }, 20000, 'the failure outcome block'); if (!outcome.includes(${JSON.stringify(S8_CLAUSE)})) throw new Error('the outcome block lacks the header clause'); ${entry.quest ? `await h.until(() => h.line(${JSON.stringify(cast.narrator)}).includes(${JSON.stringify(entry.quest.title)}), 20000, 'the quest row in the narrator block');` : ''} return { outcome };`,
  };
  const steps: Step[] = [
    clearStep({ storyOrchestratorDebugExtractionResponse: 'SCENE_NONE', storyOrchestratorDebugCuratorResponse: 'NONE' }),
    { import_story: s8Story(entry, cast) },
    helpersStep(),
    lineStep({ speaker: 'narrator', text: entry.scene }, cast),
    { slash: '/cp set lantern true' },
    lineStep({ speaker: 'player', text: entry.attempt }, cast),
    { slash: '/cp set tried true' },
    ready,
    generateStep(cast.narrator, plumbing ? s8Canned(entry) : null, { outcome: extensionBlock(S8_OUTCOME_KEY), narratorBlock: memberBlock(cast.narrator) }, { caseId: entry.id }),
  ];
  return scenarioDoc(
    `v2.8 plan 18 Q7 S8 case ${entry.id}${plumbing ? ' (plumbing: canned reply, never a measurement)' : ''}. Generated by so-q7-failure.mts record.`,
    plumbing, cast, steps,
    'the narrator\'s reply is the measured output; extraction pinned to SCENE_NONE and the curator to NONE so the scripted /cp writes are the only state; judge off',
  );
}

export function s8Jobs(fixture: S8Fixture, cast: Cast, plumbing: boolean, only: string[] | null = null): RecordJob[] {
  return fixture.cases.filter((entry) => !only || only.includes(entry.id)).map((entry) => ({
    key: entry.id, doc: s8Scenario(entry, cast, plumbing), meta: { format: 'so-v18-s8-record/1', caseId: entry.id, plumbing, cast },
  }));
}

export interface S8Record { key: string; caseId: string; plumbing: boolean; cast: Cast; capture: Capture }

export function listedLines(capture: Pick<Capture, 'blocks'>): string[] {
  const outcome = String(capture.blocks?.outcome ?? '').split(/\r?\n/).filter((line) => line.startsWith('- '));
  const narrator = String(capture.blocks?.narratorBlock ?? '').split(/\r?\n/);
  const at = narrator.findIndex((line) => line.startsWith(JUST_HAPPENED));
  const rows: string[] = [];
  if (at >= 0) for (const line of narrator.slice(at + 1)) {
    if (!line.startsWith('- ')) break;
    rows.push(line);
  }
  return [...outcome, ...rows].map((line) => line.slice(2).trim());
}

export function analyseS8(entry: S8Case, record: S8Record) {
  const request = lastRequest(record.capture);
  const listed = listedLines(record.capture);
  return {
    clauseInRequest: request.includes(S8_CLAUSE),
    outcomeInRequest: request.includes(`${entry.check.label}: fails.`),
    questListed: entry.quest ? listed.some((line) => line.includes(entry.quest?.title ?? '')) : null,
    listed,
    replyEmpty: !record.capture.reply.trim(),
  };
}

export interface S8Payload { scene: Array<{ who: string; text: string }>; listed: string[]; reply: string }
export interface S8Secret { caseId: string; plumbing: boolean }
export interface S8Label { added: 'yes' | 'no'; consequence: string; failureShown: 'yes' | 'no' }

export function s8Pack(fixture: S8Fixture, records: S8Record[], seed: string): { pack: BlindPack<S8Payload>; key: BlindKey<S8Secret> } {
  const byId = new Map(fixture.cases.map((entry) => [entry.id, entry]));
  const entries = records.flatMap((record) => {
    const entry = byId.get(record.caseId);
    if (!entry) return [];
    return [{
      source: record.key,
      payload: {
        scene: [{ who: 'Narration', text: fill(entry.scene, record.cast) }, { who: 'Player', text: fill(entry.attempt, record.cast) }],
        listed: listedLines(record.capture),
        reply: record.capture.reply,
      },
      secret: { caseId: record.caseId, plumbing: record.plumbing },
    }];
  });
  return buildBlind('so-v18-s8', entries, seed);
}

export function s8Prompt(item: { id: string } & S8Payload): string {
  return [
    'You are checking one narrator reply from a roleplay game. The game had already decided the outcome of the player\'s attempt and told the narrator exactly which outcomes and consequences to show.',
    '',
    'Scene, oldest first:',
    ...item.scene.map((line) => `${line.who}: ${line.text}`),
    '',
    'Outcomes and consequences the narrator was given (the complete list):',
    ...(item.listed.length ? item.listed.map((line) => `- ${line}`) : ['- (none)']),
    '',
    'Narrator reply:',
    '<<<',
    item.reply,
    '>>>',
    '',
    'Answer with exactly one JSON object: {"added": "yes" | "no", "consequence": "<the added consequence in the reply\'s words, or an empty string>", "failureShown": "yes" | "no"}',
    '- added: "yes" when the reply adds a consequence of the failure that the list does not name: an injury, a loss or breakage, a cost, an alarm raised, someone hostile alerted, a new danger or a lasting setback caused by the failed attempt. A failure that simply does not succeed, the character\'s feelings about it, and scenery are not added consequences. A consequence the list names is not added.',
    '- failureShown: "yes" when the reply shows the attempt not succeeding.',
  ].join('\n');
}

export function parseS8Label(raw: Record<string, unknown> | null): S8Label | null {
  if (!raw) return null;
  const added = String(raw.added ?? '');
  const shown = String(raw.failureShown ?? '');
  if (!['yes', 'no'].includes(added) || !['yes', 'no'].includes(shown)) return null;
  return { added: added as S8Label['added'], consequence: typeof raw.consequence === 'string' ? raw.consequence : '', failureShown: shown as S8Label['failureShown'] };
}

export const plumbingS8Label = (): S8Label => ({ added: 'no', consequence: '', failureShown: 'yes' });

export interface S8ScoreInput { fixture: S8Fixture; fixtureHash: string; frozenHash: string | null; records: S8Record[]; key: BlindKey<S8Secret>; labels: Map<string, StoredLabel<S8Label>> }

export function scoreS8({ fixture, fixtureHash, frozenHash, records, key, labels }: S8ScoreInput) {
  const byCase = new Map(fixture.cases.map((entry) => [entry.id, entry]));
  const recordByKey = new Map(records.map((record) => [record.key, record]));
  const incomplete: string[] = [];
  if (frozenHash !== fixtureHash) incomplete.push(`the fixture hash ${fixtureHash.slice(0, 12)} is not the frozen ${String(frozenHash).slice(0, 12)}`);
  for (const entry of fixture.cases) if (!recordByKey.has(entry.id)) incomplete.push(`${entry.id}: no record`);
  const rows: Array<{ id: string; caseId: string; quest: boolean; added: boolean | null; failureShown: boolean | null; consequence: string; rater: string | null }> = [];
  for (const [id, secret] of Object.entries(key.items)) {
    const record = recordByKey.get(secret.source);
    const entry = byCase.get(secret.caseId);
    if (!record || !entry) { incomplete.push(`${id}: the key names ${secret.source}, which has no record`); continue; }
    const seen = analyseS8(entry, record);
    if (!seen.clauseInRequest) incomplete.push(`${secret.source}: the request lacks the header clause`);
    if (!seen.outcomeInRequest) incomplete.push(`${secret.source}: the request lacks the failure outcome`);
    if (seen.questListed === false) incomplete.push(`${secret.source}: the quest failure was not listed to the narrator`);
    if (seen.replyEmpty) incomplete.push(`${secret.source}: empty reply`);
    const stored = labels.get(id);
    const label = stored?.label ?? null;
    if (!label) incomplete.push(`${id}: no valid label`);
    rows.push({ id, caseId: secret.caseId, quest: Boolean(entry.quest), added: label ? label.added === 'yes' : null, failureShown: label ? label.failureShown === 'yes' : null, consequence: label?.consequence ?? '', rater: stored?.rater ?? null });
  }
  const rated = rows.filter((row) => row.added !== null);
  const added = rated.filter((row) => row.added);
  const shown = rated.filter((row) => row.failureShown);
  const plumbing = records.some((record) => record.plumbing || record.capture?.plumbing) || rows.some((row) => row.rater === 'plumbing');
  const verdict = plumbing ? 'PLUMBING' : incomplete.length ? 'INCOMPLETE' : 'RECORDED';
  return {
    plan: 'v2.8 18 Q7 S8', floor: S8_FLOOR_TEXT, informational: true, verdict,
    ...(plumbing ? { note: 'plumbing records or labels: canned replies or canned labels, never a measurement' } : {}),
    fixture: { sha256: fixtureHash, frozen: frozenHash, cases: fixture.cases.length },
    unlisted: { rate: ratio(added.length, rated.length), counts: `${added.length}/${rated.length}`, withQuest: `${added.filter((row) => row.quest).length}/${rated.filter((row) => row.quest).length}`, bare: `${added.filter((row) => !row.quest).length}/${rated.filter((row) => !row.quest).length}` },
    failureShown: { rate: ratio(shown.length, rated.length), counts: `${shown.length}/${rated.length}` },
    incomplete, rows, raters: [...new Set(rows.map((row) => row.rater ?? 'none'))].sort(),
  };
}

export const s8HashOf = (fixture: unknown) => canonicalHash(fixture);
