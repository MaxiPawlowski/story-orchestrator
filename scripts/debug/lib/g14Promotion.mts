import { readFile } from 'node:fs/promises';
import { canonicalHash, clearStep, fill, helpersStep, lineStep, scenarioDoc, unsafeText, type Cast, type RecordJob, type Step } from './replyCapture.mts';
import { hasAll } from './rumorVoicing.mts';

export const G14_FORMAT = 'so-v44-g14/1';
export const G14_TURNS = 30;
export const G14_FLOOR_TEXT = 'G14: hearsay claims (true and false versions, and the origin claim) appearing as facts, [knows] rows, canon or chapter consequences after the 30-turn fixture: 0 (plan 44 §6). A row that attributes the claim (heard, said, rumor, they say) records that someone said it and is allowed by the read contract; it is listed, not counted.';
export const G14_ARTIFACTS = [
  'the chat\'s chat_metadata.story_orchestrator blob after the 30 turns (BLOB_VERSION 7): records/g14.json from g14-record (capture.blob), or the chat .jsonl (first line chat_metadata), or so-state current output',
  'inside it, stories[<story id>].extras: memory.entries (facts and session details), memory.epistemic ([knows] rows), memory.canon.text, memory.chapters[].consequences, rumors.hearsay (proves the hearsay landed), extraction.audits (proves reads ran; raw read lines are scanned as an informational count)',
];
const ATTRIBUTED = /\b(heard|hears|hearsay|rumou?rs?|rumou?red|says?|said|claims?|claimed|told|tells|according|gossip|supposedly|reportedly|allegedly|word is|whispers?|whispered|insists?|swears?)\b/i;
const SEAL_RESPONSE = 'SUMMARY:\nThe party bought rope, oil, fish and a coast road map in the rainy market town, stayed a night at the inn and rode out on the coast road.\nSHORT:\nThe party gathered supplies in town and rode out on the coast road.\nCONSEQUENCES:\n- The party carries rope, lamp oil, dried fish and a map of the coast road.\nPEOPLE:\nOPEN:';

export interface G14Turn { player: string; speaker: 'narrator' | 'receiver'; text: string; cp?: string[] }
export interface G14Fixture {
  format: string;
  synthetic: boolean;
  plan: string;
  story: Record<string, any>;
  claims: Record<string, { claim: string[]; versions: string[][] }>;
  expectHearsay: number;
  turns: G14Turn[];
}

const rumorsOf = (fixture: G14Fixture): Array<{ id: string; claim: string; starts_when?: { q: string }; versions?: Array<{ text: string; truth: string }> }> => fixture.story?.rumors ?? [];

export function g14Problems(fixture: G14Fixture, cast: Cast): string[] {
  const problems: string[] = [];
  if (fixture?.format !== G14_FORMAT) problems.push(`format is ${JSON.stringify(fixture?.format)}, expected ${G14_FORMAT}`);
  if (fixture?.synthetic !== true) problems.push('the fixture is not marked synthetic');
  const turns = Array.isArray(fixture?.turns) ? fixture.turns : [];
  if (turns.length !== G14_TURNS) problems.push(`${turns.length} turn(s), G14 needs ${G14_TURNS}`);
  const rumors = rumorsOf(fixture);
  if (fixture.expectHearsay !== rumors.length) problems.push(`expectHearsay ${fixture.expectHearsay} differs from the ${rumors.length} rumor(s)`);
  const truths = new Set(rumors.flatMap((rumor) => (rumor.versions ?? []).map((version) => version.truth)));
  if (!truths.has('true') || !truths.has('false')) problems.push('G14 needs both true and false versions');
  const set = new Set(turns.flatMap((turn) => (turn.cp ?? []).map((command) => command.split(' ')[0])));
  for (const rumor of rumors) {
    const needles = fixture.claims?.[rumor.id];
    if (!needles) { problems.push(`rumor ${rumor.id}: no needles`); continue; }
    if (!hasAll(rumor.claim, needles.claim)) problems.push(`rumor ${rumor.id}: the claim lacks its needles`);
    (rumor.versions ?? []).forEach((version, index) => {
      if (!hasAll(version.text, needles.versions[index] ?? [])) problems.push(`rumor ${rumor.id}: version ${index} lacks its needles`);
    });
    if (rumor.starts_when && !set.has(rumor.starts_when.q)) problems.push(`rumor ${rumor.id}: nothing sets ${rumor.starts_when.q}`);
  }
  turns.forEach((turn, index) => {
    for (const text of [turn.player, turn.text]) {
      const unsafe = unsafeText(fill(text ?? '', cast));
      if (unsafe) problems.push(`turn ${index + 1}: a line ${unsafe}`);
    }
    for (const command of turn.cp ?? []) if (!/^[a-z_][a-z0-9_]* (true|false|-?\d+)$/.test(command)) problems.push(`turn ${index + 1}: cp ${JSON.stringify(command)} is not "<key> <value>"`);
  });
  return problems;
}

export function g14Story(fixture: G14Fixture, cast: Cast) {
  return JSON.parse(JSON.stringify(fixture.story).replaceAll('{receiver}', cast.receiver).replaceAll('{narrator}', cast.narrator));
}

const PLUMBING_PINS = {
  storyOrchestratorDebugExtractionResponse: 'SCENE_NONE',
  storyOrchestratorDebugCuratorResponse: 'NONE',
  storyOrchestratorDebugSceneSummaryResponse: 'The party gathered supplies in the rainy market town.',
  storyOrchestratorDebugChapterSealResponse: SEAL_RESPONSE,
  storyOrchestratorDebugCanonResponse: 'The party came to a rainy market town, bought supplies, stayed at the inn and rode out on the coast road.',
};

export function g14Scenario(fixture: G14Fixture, cast: Cast, plumbing: boolean) {
  const wait = { wait: { schedulerIdle: true, quietMs: plumbing ? 800 : 1500, timeoutMs: plumbing ? 30000 : 600000 } };
  const steps: Step[] = [
    clearStep(plumbing ? PLUMBING_PINS : { storyOrchestratorDebugCuratorResponse: 'NONE' }),
    { import_story: g14Story(fixture, cast) },
    helpersStep(),
    { eval: `const h = globalThis.__soRc; if (h.rt.getEffectiveSettings().memory.rumors === false) throw new Error('rumors are switched off'); return { rumors: true };` },
  ];
  for (const turn of fixture.turns) {
    steps.push(lineStep({ speaker: 'player', text: turn.player }, cast));
    steps.push(lineStep({ speaker: turn.speaker, text: turn.text }, cast));
    for (const command of turn.cp ?? []) steps.push({ slash: `/cp set ${command}` });
    steps.push(wait);
  }
  steps.push({
    log: 400,
    eval: `const rt = globalThis.__soRc.rt; const sealed = (rt.getSnapshot().memory?.chapters ?? []).length ? null : Boolean(await rt.chapters.sealNow()); const canon = await rt.regenerateCanon(true); globalThis.__soG14Final = { sealedNow: sealed, canonRegenerated: canon === true }; return globalThis.__soG14Final;`,
  });
  steps.push(wait);
  steps.push({
    log: 600,
    eval: `const h = globalThis.__soRc; await h.saved(); await h.pause(1500); const ctx = SillyTavern.getContext(); const blob = JSON.parse(JSON.stringify(ctx.chatMetadata?.story_orchestrator ?? null)); globalThis.__soReplyCapture = { requests: [], reply: '', replyName: null, error: null, blocks: {}, plumbing: ${plumbing}, blob, chatId: ctx.chatId, final: globalThis.__soG14Final ?? null }; delete globalThis.__soG14Final; const record = blob?.stories?.[blob?.selectedStoryId] ?? null; return { stories: Object.keys(blob?.stories ?? {}), hearsay: record?.extras?.rumors?.hearsay?.length ?? null, audits: record?.extras?.extraction?.audits?.length ?? null, chapters: record?.extras?.memory?.chapters?.length ?? null, canon: Boolean(record?.extras?.memory?.canon?.text) };`,
  });
  return scenarioDoc(
    `v2.8 plan 44 G14: 30 scripted turns, real reads${plumbing ? ' (plumbing: every model answer canned, never a measurement)' : ''}; the final step stashes the chat's story blob for g14-check. Generated by so-rumor-voicing.mts g14-record.`,
    plumbing, cast, steps,
    'the read model is the measured path (no SCENE_NONE pin on the real arm); the curator is pinned to NONE so no lorebook write muddies the run; judge off',
  );
}

export function g14Job(fixture: G14Fixture, cast: Cast, plumbing: boolean): RecordJob {
  return { key: 'g14', doc: g14Scenario(fixture, cast, plumbing), meta: { format: 'so-v44-g14-record/1', plumbing, cast, fixtureSha256: canonicalHash(fixture) } };
}

export async function readStateFile(file: string): Promise<unknown> {
  const text = await readFile(file, 'utf-8');
  if (file.endsWith('.jsonl')) return JSON.parse(text.split(/\r?\n/)[0])?.chat_metadata?.story_orchestrator ?? null;
  return JSON.parse(text);
}

export function extrasOf(state: any, storyId: string): any {
  if (!state || typeof state !== 'object') return null;
  if (state.capture?.blob) return extrasOf(state.capture.blob, storyId);
  if (state.stories) return state.stories[storyId]?.extras ?? state.stories[state.selectedStoryId]?.extras ?? null;
  if (state.extras) return state.extras;
  if (state.memory) return state;
  return null;
}

const active = (row: any) => row && !row.supersededBy && !row.retiredAt && row.status !== 'removed';
const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);

export interface G14Hit { surface: string; rumorId: string; which: string; text: string; attributed: boolean }

export function checkG14(fixture: G14Fixture, state: unknown, { plumbing = false }: { plumbing?: boolean } = {}) {
  const extras = extrasOf(state, fixture.story.id);
  const incomplete: string[] = [];
  if (!extras) return { plan: 'v2.8 44 G14', floor: G14_FLOOR_TEXT, verdict: 'INCOMPLETE', incomplete: [`no story record for ${fixture.story.id} in the state`], promoted: 0, attributed: 0, counts: {}, hearsay: 0, audits: 0, hits: [] as G14Hit[], informational: { unattributed: 0, hits: [] as G14Hit[] } };
  const memory = extras.memory ?? {};
  const entries = (memory.entries ?? []).filter(active);
  const surfaces: Array<{ surface: string; texts: string[] }> = [
    { surface: 'facts', texts: entries.filter((row: any) => row.tier === 'facts').map((row: any) => String(row.text ?? '')) },
    { surface: 'memory', texts: entries.filter((row: any) => row.tier === 'session_details').map((row: any) => String(row.text ?? '')) },
    { surface: 'knows', texts: (memory.epistemic ?? []).filter((row: any) => active(row) && row.tag === 'knows').map((row: any) => `${row.subject ?? ''}: ${row.content ?? ''}`) },
    { surface: 'canon', texts: sentences(String(memory.canon?.text ?? '')) },
    { surface: 'chapterConsequences', texts: (memory.chapters ?? []).flatMap((record: any) => (record.consequences ?? []).map((item: any) => String(item.text ?? ''))) },
  ];
  const informational: Array<{ surface: string; texts: string[] }> = [
    { surface: 'otherTiers', texts: entries.filter((row: any) => row.tier !== 'facts' && row.tier !== 'session_details').map((row: any) => String(row.text ?? '')) },
    { surface: 'chapterSummaries', texts: (memory.chapters ?? []).flatMap((record: any) => sentences(String(record.summary ?? ''))) },
    { surface: 'readLines', texts: (extras.extraction?.audits ?? []).flatMap((audit: any) => String(audit.rawResponse ?? '').split(/\r?\n/)).filter((line: string) => /^\s*(FACT|MEMORY|\[knows\])/i.test(line)) },
  ];
  const needles = Object.entries(fixture.claims).flatMap(([rumorId, sets]) => [
    { rumorId, which: 'claim', needles: sets.claim },
    ...sets.versions.map((set, index) => ({ rumorId, which: `version ${index}`, needles: set })),
  ]);
  const scan = (groups: typeof surfaces): G14Hit[] => groups.flatMap(({ surface, texts }) => texts.flatMap((text) => needles
    .filter((item) => hasAll(text, item.needles)).map((item) => ({ surface, rumorId: item.rumorId, which: item.which, text, attributed: ATTRIBUTED.test(text) }))));
  const hits = scan(surfaces);
  const side = scan(informational);
  const rowsOf = (list: G14Hit[]) => new Set(list.map((hit) => `${hit.surface}\u0000${hit.text}`)).size;
  const promoted = hits.filter((hit) => !hit.attributed);
  const hearsay = (extras.rumors?.hearsay ?? []).length;
  const audits = (extras.extraction?.audits ?? []).length;
  if (hearsay < fixture.expectHearsay) incomplete.push(`${hearsay} hearsay row(s) landed, the fixture expects ${fixture.expectHearsay}: the run did not exercise every rumor`);
  if (!audits) incomplete.push('no extraction audit: no read ran, so nothing could be promoted');
  if (!String(memory.canon?.text ?? '').trim()) incomplete.push('no canon text: the canon surface was not produced');
  if (!(memory.chapters ?? []).length) incomplete.push('no chapter record: the chapter surface was not produced');
  const verdict = incomplete.length ? 'INCOMPLETE' : plumbing ? 'PLUMBING' : promoted.length ? 'FAIL' : 'PASS';
  return {
    plan: 'v2.8 44 G14', floor: G14_FLOOR_TEXT, verdict, ...(plumbing ? { note: 'plumbing run: every model answer canned, never a measurement' } : {}),
    promoted: rowsOf(promoted), attributed: rowsOf(hits.filter((hit) => hit.attributed)),
    counts: Object.fromEntries(surfaces.map(({ surface, texts }) => [surface, texts.length])), hearsay, audits,
    incomplete, hits, informational: { unattributed: rowsOf(side.filter((hit) => !hit.attributed)), hits: side },
  };
}
