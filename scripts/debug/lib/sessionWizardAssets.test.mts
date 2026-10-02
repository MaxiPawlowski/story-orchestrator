import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { REPO_ROOT } from '../../lib/stRoot.mjs';
import { resolveHeaderAllow, storyContext, wizardAllowance } from './sessionWizardAssets.mts';
import { allowFileEntries, diffHeaders, parseAllow } from '../so-run-header.mts';
import { fileAllowances, headerDiffArgs } from './sessionStop.mts';
import { headerAllowProblems, validateCardDoc, rubricTemplate, type CardDoc } from './sessionCharters.mts';
import { cardCommands } from './sessionRunbook.mts';
import { driverOnlyFlags } from './sessionDigest.mts';
import { agentProblems, runAgentVerb, type AgentUi } from './sessionDriver.mts';
import { agentModeTarget } from '../so-ui.mts';
import { findCard, loadCards, loadIndex, loadSessionFiles, parseLiveArgs, scoreCommand, scoreRefusal } from '../so-session.mts';
import { digestSession } from './sessionDigest.mts';

const T52 = resolve(REPO_ROOT, 'test', 'fixtures', 'sessions', 'T5-2-1');
const json = (name: string) => JSON.parse(readFileSync(resolve(T52, name), 'utf-8'));
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const WIZARD_PATHS = ['inventory.characterCount', 'inventory.lorebookCount', 'inventory.lorebooksSelected', 'inventory.v2Stories', 'inventory.wizardSessions'];

function t52() {
  const drafts = json('wizard-drafts.json');
  const start = json('run-header-start.json');
  const end = json('run-header-end.json');
  end.inventory.wizardSessions = drafts.sessions.map((session: { key: string }) => session.key).sort();
  const session = json('session.json');
  return { drafts, start, end, startedAt: session.startedAt as string };
}

const blockingIn = (before: unknown, after: unknown, allow: string[]) => diffHeaders(before, after, allow).filter((difference) => !difference.allowed && WIZARD_PATHS.includes(difference.path)).map((difference) => difference.path);

test('T5-2 wizard assets: the recorded T5-2-1 ledger allows exactly the five paths that made the session INVALID', () => {
  const { drafts, start, end, startedAt } = t52();
  assert.deepEqual(blockingIn(start, end, []), WIZARD_PATHS);
  const { allow, ledger } = wizardAllowance(start, drafts, startedAt, { end, chats: json('session.json').chats });
  assert.deepEqual(ledger.continued, []);
  assert.deepEqual(ledger.unbaselined, []);
  assert.deepEqual(ledger.groups, [], 'the T5-2-1 headers predate inventory.groups');
  assert.deepEqual(ledger.entries, []);
  assert.deepEqual(allow.filter((entry) => !entry.startsWith('inventory.wizardApplied:')), wizardAllowance(start, drafts, startedAt).allow.filter((entry) => !entry.startsWith('inventory.wizardApplied:')));
  assert.equal(allow.filter((entry) => entry.startsWith('inventory.wizardApplied:')).length, 11);
  assert.ok(fileAllowances(allow).includes('inventory.wizardApplied:+the-hoard-of-the-unflown/Vaelrith, the Unflown'));
  assert.deepEqual(ledger.sessions.sort(), ['the-hoard-of-the-unflown', 'the-pawnbroker-of-forgotten-days', 'untitled-story']);
  assert.deepEqual(ledger.stories.sort(), ['the-hoard-of-the-unflown', 'the-pawnbroker-of-forgotten-days']);
  assert.equal(ledger.characters.length, 9);
  assert.deepEqual(ledger.lorebooks.sort(), ['The Hoard of the Unflown — Lore', 'The Pawnbroker of Forgotten Days']);
  assert.ok(allow.includes('inventory.characterCount=+9'));
  assert.ok(allow.includes('inventory.lorebookCount=+2'));
  assert.deepEqual(blockingIn(start, end, allow), []);
  assert.deepEqual(parseAllow(allow).errors, []);
});

test('T5-2 wizard assets: a removal, an unledgered character or book, and a foreign story still block', () => {
  const { drafts, start, end, startedAt } = t52();
  const { allow } = wizardAllowance(start, drafts, startedAt);
  const removed = clone(end);
  removed.inventory.v2Stories = removed.inventory.v2Stories.filter((item: string) => !item.startsWith('adolion-war@'));
  assert.deepEqual(blockingIn(start, removed, allow), ['inventory.v2Stories']);
  const extraCard = clone(end);
  extraCard.inventory.characterCount += 1;
  assert.deepEqual(blockingIn(start, extraCard, allow), ['inventory.characterCount']);
  const extraBook = clone(end);
  extraBook.inventory.lorebookCount += 1;
  extraBook.inventory.lorebooksSelected = [...extraBook.inventory.lorebooksSelected, 'Someone Else'].sort();
  assert.deepEqual(blockingIn(start, extraBook, allow), ['inventory.lorebookCount', 'inventory.lorebooksSelected']);
  const foreignStory = clone(end);
  foreignStory.inventory.v2Stories = [...foreignStory.inventory.v2Stories, 'imported-by-hand@1'].sort();
  assert.deepEqual(blockingIn(start, foreignStory, allow), ['inventory.v2Stories']);
});

test('T5-2 wizard assets: sessions that existed at start, or were last written before it, ledger nothing', () => {
  const { drafts, start, startedAt } = t52();
  const known = clone(start);
  known.inventory.wizardSessions = ['the-pawnbroker-of-forgotten-days'];
  const fromKnown = wizardAllowance(known, drafts, startedAt).ledger;
  assert.ok(!fromKnown.sessions.includes('the-pawnbroker-of-forgotten-days'));
  assert.ok(!fromKnown.stories.includes('the-pawnbroker-of-forgotten-days'));
  assert.equal(fromKnown.characters.length, 5);
  assert.deepEqual(wizardAllowance(start, drafts, '2026-10-02T09:00:00.000Z').allow, []);
  assert.deepEqual(wizardAllowance(start, null, startedAt).allow, []);
  const comma = clone(drafts);
  comma.sessions[0].createdLorebooks = ['A, B'];
  comma.sessions[0].applied = ['A, B'];
  const { allow, ledger } = wizardAllowance(start, comma, startedAt);
  assert.ok(ledger.lorebooks.includes('A, B'));
  assert.ok(allow.includes('inventory.lorebooksSelected:+A, B'));
  assert.ok(fileAllowances(allow).includes('inventory.lorebooksSelected:+A, B'), 'a comma item reaches the diff through the allow file');
});

test('run header delta allowance: path=+n allows only that exact move, and a bare = is refused', () => {
  const before = { inventory: { characterCount: 10 } };
  assert.equal(diffHeaders(before, { inventory: { characterCount: 12 } }, ['inventory.characterCount=+2'])[0].allowed, true);
  assert.equal(diffHeaders(before, { inventory: { characterCount: 13 } }, ['inventory.characterCount=+2'])[0].allowed, false);
  assert.equal(diffHeaders(before, { inventory: { characterCount: 8 } }, ['inventory.characterCount=+2'])[0].allowed, false);
  assert.match(parseAllow(['inventory.characterCount=2']).errors[0], /signed whole number/);
  const args = headerDiffArgs('s', 'e', [], ['inventory.characterCount=+9', 'inventory.lorebooksSelected:+The Hoard of the Unflown — Lore']);
  assert.ok(args[args.indexOf('--allow') + 1].includes('inventory.lorebooksSelected:+The Hoard of the Unflown — Lore'));
});

test('T5-2 charters: wizardAssets is declared on the wizard cards, refused elsewhere, and goal beats only on wizard cards', async () => {
  const [doc, index] = await Promise.all([loadCards(), loadIndex()]);
  assert.deepEqual(doc.cards.filter((card) => card.wizardAssets).map((card) => card.id), ['T5-1', 'T5-2', 'T5-4', 'T6-3']);
  const broken: CardDoc = clone(doc);
  findCardIn(broken, 'T0-1').wizardAssets = true;
  findCardIn(broken, 'T0-1').drive[0].goal = { mode: 'review' };
  findCardIn(broken, 'T5-2').drive[0].goal = { mode: 'step' as never };
  const problems = validateCardDoc(broken, index);
  assert.ok(problems.some((problem) => /T0-1: wizardAssets is for a card whose story the wizard makes/.test(problem)));
  assert.ok(problems.some((problem) => /T0-1 drive\[0\]: goal is the wizard agent's goal/.test(problem)));
  assert.ok(problems.some((problem) => /T5-2 drive\[0\]: goal.mode must be review\|auto-draft/.test(problem)));
});

const findCardIn = (doc: CardDoc, id: string) => doc.cards.find((card) => card.id === id)!;

test('T5-2 runbook: wizard premises are agent goal steps, never chat turns, and each is read back', async () => {
  const doc = await loadCards();
  const lines = cardCommands(findCard(doc, 'T5-2'), 4);
  assert.equal(lines.filter((line) => line.includes(' turn ')).length, 0);
  const goals = lines.filter((line) => line.includes('so-session.mts goal test/sessions/T5/T5-2-1 '));
  assert.equal(goals.length, 2);
  for (const line of goals) assert.match(line, /--mode auto-draft --new --go$/);
  assert.equal(lines.filter((line) => line.endsWith('so-session.mts agent test/sessions/T5/T5-2-1 state')).length, 2);
  const t51 = cardCommands(findCard(doc, 'T5-1'), 3);
  assert.match(t51.join('\n'), /goal test\/sessions\/T5\/T5-1-1 "A cartographer's apprentice[^"]*" --mode review --new --go/);
  assert.equal(t51.filter((line) => line.includes(' turn ')).length, 1, 'only the play beat after adopt sends a turn');
  assert.ok(t51.findIndex((line) => line.includes(' adopt ')) < t51.findIndex((line) => line.includes(' turn ')));
});

test('T5-2 digest: a flag filed with no chat open reaches the findings from turns.jsonl, once', async () => {
  const { files, paths } = await loadSessionFiles(T52, await loadIndex());
  const digest = digestSession(files, paths);
  assert.equal(digest.flags.length, 5);
  assert.deepEqual(digest.flags.map((flag) => flag.evidence.path), ['turns.jsonl', 'turns.jsonl', 'turns.jsonl', 'turns.jsonl', 'journal.jsonl']);
  assert.ok(digest.flags.every((flag, at, all) => at === 0 || Date.parse(all[at - 1].at) <= Date.parse(flag.at)));
  const known = [{ at: 'A', chatId: null, messageId: -1, note: 'seen', evidence: { path: 'journal.jsonl', line: 1 }, context: [], contextFrom: 'none' as const }];
  const rows = [
    { line: 1, value: { kind: 'flag', at: 'B', note: 'seen', ok: true, flag: { at: 'A' } } },
    { line: 2, value: { kind: 'flag', at: 'C', note: 'new', ok: true, flag: { at: 'C2', messageId: -1 } } },
    { line: 3, value: { kind: 'flag', at: 'D', note: 'failed', ok: false } },
    { line: 4, value: { kind: 'turn', at: 'E' } },
  ];
  assert.deepEqual(driverOnlyFlags(rows, known, null, 'turns.jsonl').map((flag) => [flag.at, flag.note, flag.evidence.line]), [['C2', 'new', 2]]);
});

test('T5-2 Agent verbs: so-session goal and agent parse, run the Agent pane and fail on an unsettled state', async () => {
  assert.deepEqual(parseLiveArgs('goal', ['d', 'A dragon too old to fly.', '--mode', 'auto-draft', '--new', '--go']).args, { text: 'A dragon too old to fly.', agentMode: 'auto-draft', fresh: true, go: true });
  assert.throws(() => parseLiveArgs('goal', ['d']), /goal needs the goal text/);
  assert.throws(() => parseLiveArgs('goal', ['d', 'x', '--mode', 'yolo']), /--mode must be one of review, auto-draft/);
  assert.deepEqual(parseLiveArgs('agent', ['d', 'mode', 'step']).args, { agentOp: 'mode', agentMode: 'step' });
  assert.throws(() => parseLiveArgs('agent', ['d', 'launch']), /agent takes one of go, continue, new-goal, state, mode/);
  assert.throws(() => parseLiveArgs('agent', ['d']), /agent needs an op/);
  assert.deepEqual(agentModeTarget('step'), { wizard: 'staged', agent: null });
  assert.deepEqual(agentModeTarget('auto-draft'), { wizard: 'agent', agent: 'auto-draft' });
  assert.throws(() => agentModeTarget('agent'), /step, review, auto-draft/);
  const calls: string[] = [];
  const ui = (planned: string, settled: string): AgentUi => ({
    agentGoal: async (_page, goal, options) => { calls.push(`goal:${goal}:${options.mode}:${options.fresh}`); return { agent: true, status: planned, plan: '1. build' }; },
    agentGo: async () => { calls.push('go'); return { agent: true, status: settled }; },
    agentContinue: async () => { calls.push('continue'); return { agent: true, status: settled }; },
    agentNewGoal: async () => ({ agent: true, status: null }),
    getAgentState: async () => ({ agent: true, status: settled }),
    setAgentEntry: async (_page, choice) => (choice === 'step' ? { agent: false } : { agent: true, status: null }),
  });
  const went = await runAgentVerb({}, { verb: 'goal', args: { text: 'P', agentMode: 'auto-draft', fresh: true, go: true } }, ui('awaiting-plan', 'awaiting-author'));
  assert.deepEqual({ ok: went.ok, went: (went as { went: boolean }).went }, { ok: true, went: true });
  assert.deepEqual(calls, ['goal:P:auto-draft:true', 'go']);
  const noPlan = await runAgentVerb({}, { verb: 'goal', args: { text: 'P', go: true } }, ui('done', 'done'));
  assert.equal(noPlan.ok, false);
  assert.match(noPlan.problems.join(' '), /no plan to approve/);
  const planned = await runAgentVerb({}, { verb: 'goal', args: { text: 'P' } }, ui('awaiting-plan', 'done'));
  assert.equal(planned.ok, true);
  assert.equal((await runAgentVerb({}, { verb: 'agent', args: { agentOp: 'continue' } }, ui('x', 'budget'))).ok, true);
  assert.equal((await runAgentVerb({}, { verb: 'agent', args: { agentOp: 'mode', agentMode: 'step' } }, ui('x', 'x'))).ok, true);
  assert.deepEqual(agentProblems({ agent: true, status: 'running', busy: true }, ['done']), ['the agent is still working', 'agent status running, expected done']);
  assert.deepEqual(agentProblems({ agent: false }, null), ['the Agent pane is not open']);
});

test('T5-2 score: an INVALID session refuses a score unless --provisional, which marks the row', async () => {
  assert.match(String(scoreRefusal({ valid: false, invalid: ['header diff'] }, false)), /INVALID \(header diff\).*--provisional/);
  assert.equal(scoreRefusal({ valid: false }, true), null);
  assert.match(String(scoreRefusal({ valid: true }, true)), /only for an INVALID session/);
  assert.equal(scoreRefusal(null, false), null);
  const dir = await mkdtemp(join(tmpdir(), 'so-provisional-'));
  await writeFile(join(dir, 'turns.jsonl'), '{"seq":1}\n', 'utf-8');
  await writeFile(join(dir, 'session.json'), JSON.stringify({ valid: false, invalid: ['the run header diff failed (exit 1)'] }), 'utf-8');
  await writeFile(join(dir, 'rubric.json'), JSON.stringify(rubricTemplate(findCard(await loadCards(), 'T5-2'))), 'utf-8');
  await assert.rejects(scoreCommand(dir, ['auto-draft', 'annoying', 'out of budget at step 26', '--evidence', 'turns.jsonl:1'], 'T'), /score refused: the session is INVALID/);
  const scored = await scoreCommand(dir, ['auto-draft', 'annoying', 'out of budget at step 26', '--evidence', 'turns.jsonl:1', '--provisional'], 'T');
  assert.equal(scored.provisional, true);
  const written = JSON.parse(await readFile(join(dir, 'rubric.json'), 'utf-8'));
  assert.deepEqual({ score: written.rows[0].score, provisional: written.rows[0].provisional }, { score: 'annoying', provisional: true });
});

const STORY = 'the-hoard-of-the-unflown';
const AT = '2026-10-02T10:00:00.000Z';
const LATER = '2026-10-02T10:05:00.000Z';
const ORIGINAL_CAST = ['The Hoard of the Unflown — Lore', 'Vaelrith, the Unflown', 'Quill', 'Marlow', 'Brannoc', 'Ser Aldric'];

function continued() {
  const start = {
    story: { id: STORY },
    inventory: {
      v2Stories: ['adolion-war@10', `${STORY}@1`],
      wizardSessions: [STORY],
      wizardApplied: ORIGINAL_CAST.map((name) => `${STORY}/${name}`).sort(),
      lorebooksSelected: ['Adolion World', 'The Hoard of the Unflown — Lore'],
      lorebookCount: 26,
      characterCount: 172,
      groups: ['1790929215846@The Hoard of the Unflown — Crew', '17897@Adolion - War'],
      groupChats: ['1790929215846/chat-a'],
    },
  };
  const session = {
    key: STORY, updatedAt: LATER, applied: [...ORIGINAL_CAST, 'Ilse Vane'], createdLorebooks: ['The Hoard of the Unflown — Lore'],
    agent: { steps: [
      { id: 1, at: '2026-10-02T09:00:00.000Z', status: 'applied', call: { tool: 'createGroup' }, op: { kind: 'createGroup', name: 'The Hoard of the Unflown — Crew' }, observation: 'Created the group "The Hoard of the Unflown — Crew" with 5 member(s).' },
      { id: 2, at: LATER, status: 'applied', call: { tool: 'createGroup' }, op: { kind: 'createGroup', name: 'Hoard Crew' }, observation: 'Created the group "Hoard Crew 2" with 6 member(s).' },
      { id: 3, at: LATER, status: 'refused', call: { tool: 'createGroup' }, op: { kind: 'createGroup', name: 'Never Made' }, observation: 'no' },
    ] },
  };
  const drafts = { sessions: [session], library: [{ id: 'adolion-war', version: 10 }, { id: STORY, version: 2 }] };
  const end = clone(start);
  end.inventory.v2Stories = ['adolion-war@10', `${STORY}@2`];
  end.inventory.wizardApplied = [...start.inventory.wizardApplied, `${STORY}/Ilse Vane`].sort();
  end.inventory.characterCount = 173;
  end.inventory.groups = [...start.inventory.groups, '1790999999999@Hoard Crew 2'].sort();
  end.inventory.groupChats = [...start.inventory.groupChats, '1790999999999/chat-new'].sort();
  return { start, end, drafts };
}

const stopAllow = (start: any, end: any, drafts: any, card: { headerAllow?: string[] }, chats: any[] = []) => {
  const wizard = wizardAllowance(start, drafts, AT, { end: { inventory: { groups: end.inventory.groups } }, chats });
  const declared = resolveHeaderAllow(card.headerAllow ?? [], storyContext(start, chats, drafts));
  const tracked = end.inventory.groupChats.filter((item: string) => !start.inventory.groupChats.includes(item)).map((item: string) => `inventory.groupChats:+${item}`);
  return { wizard, declared, allow: [...declared.allow, ...wizard.allow, ...tracked] };
};
const blocking = (start: unknown, end: unknown, allow: string[]) => diffHeaders(start, end, allow).filter((difference) => !difference.allowed).map((difference) => difference.path);

test('T5-4 Fix with wizard: a session that existed at start allows exactly what its ledger grew by, and the story version moving up', async () => {
  const { start, end, drafts } = continued();
  const card = findCard(await loadCards(), 'T5-4');
  const { wizard, declared, allow } = stopAllow(start, end, drafts, card);
  assert.deepEqual(wizard.ledger.sessions, []);
  assert.deepEqual(wizard.ledger.continued, [STORY]);
  assert.deepEqual(wizard.ledger.characters, ['Ilse Vane']);
  assert.deepEqual(wizard.ledger.groups, [{ id: '1790999999999', name: 'Hoard Crew 2', source: 'agent' }]);
  assert.deepEqual(wizard.ledger.applied, [`${STORY}/Ilse Vane`]);
  assert.deepEqual(declared.allow, [`inventory.v2Stories:~${STORY}`, 'inventory.lorebooksSelected:-The Hoard of the Unflown — Lore']);
  assert.ok(allow.includes('inventory.characterCount=+1'));
  assert.ok(allow.includes('inventory.groups:+1790999999999'));
  assert.deepEqual(blocking(start, end, allow), []);
  const unrepaired = clone(end);
  unrepaired.inventory.lorebooksSelected = ['Adolion World'];
  assert.deepEqual(blocking(start, unrepaired, allow), [], 'the card breaks its own story book on purpose');
});

test('T5-4 Fix with wizard: unledgered growth, a ledger removal, another book, another group, a story removal and a version drop still block', () => {
  const { start, end, drafts } = continued();
  const { allow } = stopAllow(start, end, drafts, { headerAllow: ['inventory.v2Stories:~{story}', 'inventory.lorebooksSelected:-{story-books}'] });
  const extraCard = clone(end);
  extraCard.inventory.characterCount = 174;
  assert.deepEqual(blocking(start, extraCard, allow), ['inventory.characterCount']);
  const lostItem = clone(end);
  lostItem.inventory.wizardApplied = lostItem.inventory.wizardApplied.filter((item: string) => item !== `${STORY}/Quill`);
  assert.deepEqual(blocking(start, lostItem, allow), ['inventory.wizardApplied']);
  const foreignBook = clone(end);
  foreignBook.inventory.lorebooksSelected = ['The Hoard of the Unflown — Lore'];
  assert.deepEqual(blocking(start, foreignBook, allow), ['inventory.lorebooksSelected']);
  const foreignGroup = clone(end);
  foreignGroup.inventory.groups = [...foreignGroup.inventory.groups, '1791000000000@Made By Hand'].sort();
  assert.deepEqual(blocking(start, foreignGroup, allow), ['inventory.groups']);
  const goneGroup = clone(end);
  goneGroup.inventory.groups = goneGroup.inventory.groups.filter((item: string) => !item.startsWith('17897@'));
  assert.deepEqual(blocking(start, goneGroup, allow), ['inventory.groups']);
  const goneStory = clone(end);
  goneStory.inventory.v2Stories = ['adolion-war@10'];
  assert.deepEqual(blocking(start, goneStory, allow), ['inventory.v2Stories']);
  const older = clone(start);
  older.inventory.v2Stories = ['adolion-war@10', `${STORY}@3`];
  assert.deepEqual(blocking(older, end, allow).filter((path) => path === 'inventory.v2Stories'), ['inventory.v2Stories']);
  const withOther = clone(end);
  withOther.inventory.v2Stories = [`${STORY}@2`];
  assert.deepEqual(blocking(start, withOther, allow), ['inventory.v2Stories'], 'a version move does not excuse dropping another story');
});

test('T5-4 Fix with wizard: an existing session with no start ledger (an older header) allows nothing', () => {
  const { start, end, drafts } = continued();
  delete (start.inventory as any).wizardApplied;
  const { wizard } = stopAllow(start, end, drafts, {});
  assert.deepEqual(wizard.ledger.unbaselined, [STORY]);
  assert.deepEqual(wizard.ledger.continued, []);
  assert.deepEqual(wizard.allow, []);
  const stale = continued();
  stale.drafts.sessions[0].updatedAt = '2026-10-02T09:59:00.000Z';
  assert.deepEqual(stopAllow(stale.start, stale.end, stale.drafts, {}).wizard.allow, []);
});

test('T5-3 Studio edit: {story} names the continued chat\'s story, so only its version moving up is allowed', async () => {
  const card = findCard(await loadCards(), 'T5-3');
  assert.deepEqual(card.headerAllow, ['inventory.v2Stories:~{story}']);
  assert.equal(card.wizardAssets, undefined);
  const start = { story: { id: STORY }, inventory: { v2Stories: ['adolion-war@10', `${STORY}@1`] } };
  const end = { story: { id: STORY }, inventory: { v2Stories: ['adolion-war@10', `${STORY}@4`] } };
  const chats = [{ chatId: 'chat-a', groupId: '1790929215846', storyId: STORY, continued: true }];
  const declared = resolveHeaderAllow(card.headerAllow!, storyContext(start, chats, null));
  assert.deepEqual(declared, { allow: [`inventory.v2Stories:~${STORY}`], unresolved: [] });
  assert.deepEqual(blocking(start, end, declared.allow), []);
  assert.deepEqual(blocking(start, { ...end, inventory: { v2Stories: ['adolion-war@10'] } }, declared.allow), ['inventory.v2Stories']);
  assert.deepEqual(blocking(start, { ...end, inventory: { v2Stories: ['adolion-war@10', `${STORY}@4`, 'other@1'] } }, declared.allow), ['inventory.v2Stories']);
  assert.deepEqual(resolveHeaderAllow(card.headerAllow!, storyContext(null, [], null)), { allow: [], unresolved: ['inventory.v2Stories:~{story}'] });
});

test('T5-1 staged arm: a group and lorebook entries in the ledger are neither characters nor unaccounted, and an adopted chat names its new group', () => {
  const start = { inventory: { v2Stories: ['adolion-war@10'], wizardSessions: [], wizardApplied: [], lorebooksSelected: [], lorebookCount: 24, characterCount: 163, groups: ['17897@Adolion - War'], groupChats: [] } };
  const session = { key: 'the-ink-that-moves', updatedAt: LATER, applied: ['Ink Lore', 'Ink Lore/The Map', 'Ink Lore/House of Ash', 'Mira', 'Tomas', 'The Ink Crew'], createdLorebooks: ['Ink Lore'] };
  const drafts = { sessions: [session], library: [{ id: 'the-ink-that-moves', version: 1 }] };
  const end = {
    inventory: {
      v2Stories: ['adolion-war@10', 'the-ink-that-moves@1'], wizardSessions: ['the-ink-that-moves'],
      wizardApplied: session.applied.map((name) => `the-ink-that-moves/${name}`).sort(),
      lorebooksSelected: ['Ink Lore'], lorebookCount: 25, characterCount: 165,
      groups: ['17897@Adolion - War', '1800@The Ink Crew'], groupChats: ['1800/ink-chat'],
    },
  };
  const { wizard, allow } = stopAllow(start, end, drafts, {});
  assert.deepEqual(wizard.ledger.characters, ['Mira', 'Tomas']);
  assert.deepEqual(wizard.ledger.entries, ['Ink Lore/The Map', 'Ink Lore/House of Ash']);
  assert.deepEqual(wizard.ledger.groups, [{ id: '1800', name: 'The Ink Crew', source: 'staged' }]);
  assert.deepEqual(blocking(start, end, allow), []);
  const agentLost = { ...session, applied: ['Ink Lore', 'Mira', 'Tomas'] };
  const agentEnd = clone(end);
  agentEnd.inventory.wizardApplied = agentLost.applied.map((name) => `the-ink-that-moves/${name}`).sort();
  const adoptedChat = [{ chatId: 'ink-chat', groupId: '1800', storyId: 'the-ink-that-moves', adopted: true }];
  const adopted = stopAllow(start, agentEnd, { ...drafts, sessions: [agentLost] }, {}, adoptedChat);
  assert.deepEqual(adopted.wizard.ledger.groups, [{ id: '1800', name: 'The Ink Crew', source: 'adopted' }]);
  assert.deepEqual(blocking(start, agentEnd, adopted.allow), []);
  const foreignStory = stopAllow(start, agentEnd, { ...drafts, sessions: [agentLost] }, {}, [{ ...adoptedChat[0], storyId: 'adolion-war' }]);
  assert.deepEqual(foreignStory.wizard.ledger.groups, []);
  assert.deepEqual(blocking(start, agentEnd, foreignStory.allow), ['inventory.groups']);
  const notAdopted = stopAllow(start, agentEnd, { ...drafts, sessions: [agentLost] }, {}, [{ ...adoptedChat[0], adopted: false }]);
  assert.deepEqual(blocking(start, agentEnd, notAdopted.allow), ['inventory.groups']);
});

test('run header: :~ allows only one id@old out and one id@new in, upward; allow files carry comma items; charters check the tokens', () => {
  const before = { inventory: { v2Stories: ['a@1', 'b@3'] } };
  const at = (v2Stories: string[]) => diffHeaders(before, { inventory: { v2Stories } }, ['inventory.v2Stories:~a'])[0]?.allowed ?? true;
  assert.equal(at(['a@2', 'b@3']), true);
  assert.equal(at(['a@0', 'b@3']), false);
  assert.equal(at(['b@3']), false);
  assert.equal(at(['a@1', 'a@2', 'b@3']), false);
  assert.equal(at(['a@2']), false);
  assert.equal(at(['a@2', 'b@3', 'c@1']), false);
  assert.deepEqual(parseAllow(['inventory.v2Stories:~a']).allow[0].sign, 'changed');
  assert.deepEqual(allowFileEntries('["inventory.wizardApplied:+k/Vaelrith, the Unflown", ""]'), ['inventory.wizardApplied:+k/Vaelrith, the Unflown']);
  assert.throws(() => allowFileEntries('{"a":1}'), /JSON array of strings/);
  const allow = ['inventory.characterCount=+1', 'inventory.wizardApplied:+k/Vaelrith, the Unflown'];
  const args = headerDiffArgs('s', 'e', [], allow, 'allow.json');
  assert.ok(!args[args.indexOf('--allow') + 1].includes('Vaelrith'));
  assert.ok(args[args.indexOf('--allow') + 1].includes('inventory.characterCount=+1'));
  assert.deepEqual(args.slice(-2), ['--allow-file', 'allow.json']);
  assert.deepEqual(fileAllowances(allow), ['inventory.wizardApplied:+k/Vaelrith, the Unflown']);
  assert.ok(!headerDiffArgs('s', 'e', [], ['inventory.characterCount=+1'], 'allow.json').includes('--allow-file'));
  assert.deepEqual(headerAllowProblems('c', ['inventory.v2Stories:~{story}', 'inventory.lorebooksSelected:-{story-books}', 'inventory.v2Stories:~adolion-war']), []);
  assert.match(headerAllowProblems('c', ['inventory.v2Stories:~{chat}'])[0], /unknown token/);
  assert.match(headerAllowProblems('c', ['inventory.lorebooksSelected:+{story-books}'])[0], /only inventory.lorebooksSelected:-/);
  assert.match(headerAllowProblems('c', ['inventory.lorebooksSelected:~x'])[0], /only for inventory.v2Stories/);
  assert.match(headerAllowProblems('c', ['inventory.groups'])[0], /would excuse every change to a list/);
});

test('T5 cards: what stop is told for each card', async () => {
  const doc = await loadCards();
  const rows = ['T5-1', 'T5-2', 'T5-3', 'T5-4', 'T5-5'].map((id) => findCard(doc, id)).map((card) => [card.id, Boolean(card.wizardAssets), card.headerAllow ?? []]);
  assert.deepEqual(rows, [
    ['T5-1', true, []],
    ['T5-2', true, []],
    ['T5-3', false, ['inventory.v2Stories:~{story}']],
    ['T5-4', true, ['inventory.v2Stories:~{story}', 'inventory.lorebooksSelected:-{story-books}']],
    ['T5-5', false, []],
  ]);
});

test('T5-2-1 evidence through the whole stop allowance: nothing blocks, and with groups recorded both wizard groups are named', () => {
  const { drafts, start, end, startedAt } = t52();
  const chats = json('page-end.json').chats ?? json('session.json').chats;
  const run = (before: any, after: any, groups: string[]) => {
    const wizard = wizardAllowance(before, drafts, startedAt, { end: { inventory: { groups } }, chats });
    const allow = [...resolveHeaderAllow([], storyContext(before, chats, drafts)).allow, ...wizard.allow];
    const args = headerDiffArgs('s', 'e', chats, allow, 'run-header-allow.json');
    const entries = [...args[args.indexOf('--allow') + 1].split(','), ...(args.includes('--allow-file') ? fileAllowances(allow) : [])];
    assert.deepEqual(parseAllow(entries).errors, []);
    const owned = args[args.indexOf('--owned') + 1].split(',');
    return { wizard, blocking: diffHeaders(before, after, entries, { ownedChats: owned, servedIdentity: true }).filter((difference) => !difference.allowed).map((difference) => difference.path) };
  };
  assert.deepEqual(run(start, end, []).blocking, []);
  const groups = chats.map((chat: { groupId: string; group: string }) => `${chat.groupId}@${chat.group}`).sort();
  const before = { ...clone(start), inventory: { ...clone(start).inventory, groups: ['17897@Adolion - War'], wizardApplied: [] } };
  const after = { ...clone(end), inventory: { ...clone(end).inventory, groups: ['17897@Adolion - War', ...groups].sort(), wizardApplied: drafts.sessions.flatMap((session: { key: string; applied: string[] }) => session.applied.map((name) => `${session.key}/${name}`)).sort() } };
  const recorded = run(before, after, after.inventory.groups);
  assert.deepEqual(recorded.blocking, []);
  assert.deepEqual(recorded.wizard.ledger.groups.map((group) => [group.name, group.source]).sort(), [['The Hoard of the Unflown — Crew', 'adopted'], ['The Pawnbroker of Forgotten Days', 'agent']]);
  const stray = { ...after, inventory: { ...after.inventory, groups: [...after.inventory.groups, '1790930000000@Stray'].sort() } };
  assert.deepEqual(run(before, stray, stray.inventory.groups).blocking, ['inventory.groups']);
});

test('T6-3-3: a group the agent created is never counted as a character, so 4 cards allow characterCount +4, not +5', () => {
  const STORY_ID = 'the-red-ink';
  const start = { inventory: { v2Stories: ['adolion-war@10'], wizardSessions: [], wizardApplied: [], lorebooksSelected: [], lorebookCount: 24, characterCount: 163, groups: ['17897@Adolion - War'], groupChats: [] } };
  const cast = ['House Agent', 'House Scholar-Envoy', 'House Enforcer', 'Master Cartographer'];
  const session = {
    key: STORY_ID, updatedAt: LATER,
    applied: ['Red Ink — Lore', 'Red Ink — Lore/The Map', ...cast, 'Red Ink — Cast'],
    createdLorebooks: ['Red Ink — Lore'],
    agent: { steps: [{ status: 'applied', at: LATER, op: { kind: 'createGroup', name: 'Red Ink — Cast' }, call: { tool: 'createGroup' }, observation: 'Created the group "Red Ink — Cast" with 4 member(s).' }] },
  };
  const drafts = { sessions: [session], library: [{ id: STORY_ID, version: 1 }] };
  const end = {
    inventory: {
      v2Stories: ['adolion-war@10', `${STORY_ID}@1`], wizardSessions: [STORY_ID],
      wizardApplied: session.applied.map((name) => `${STORY_ID}/${name}`).sort(),
      lorebooksSelected: ['Red Ink — Lore'], lorebookCount: 25, characterCount: 167,
      groups: ['17897@Adolion - War', '1790974874340@Red Ink — Cast'], groupChats: ['1790974874340/red-chat'],
    },
  };
  const { wizard, allow } = stopAllow(start, end, drafts, {}, [{ chatId: 'red-chat', groupId: '1790974874340', storyId: STORY_ID, adopted: true }]);
  assert.deepEqual(wizard.ledger.characters, cast);
  assert.deepEqual(wizard.ledger.lorebooks, ['Red Ink — Lore']);
  assert.deepEqual(wizard.ledger.entries, ['Red Ink — Lore/The Map']);
  assert.deepEqual(wizard.ledger.groups, [{ id: '1790974874340', name: 'Red Ink — Cast', source: 'agent' }]);
  assert.ok(allow.includes('inventory.characterCount=+4'));
  assert.ok(!allow.includes('inventory.characterCount=+5'));
  assert.deepEqual(blocking(start, end, allow), []);
  const noGroupsHeader = wizardAllowance({ inventory: { ...start.inventory, groups: undefined } }, drafts, AT).ledger;
  assert.deepEqual(noGroupsHeader.characters, cast, 'an agent group stays out of the cards when the header predates inventory.groups');
});
