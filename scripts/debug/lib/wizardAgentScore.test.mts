import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreAgentRuns, scoreRecipeTask, w5Escapes } from './wizardAgentScore.mts';

const floors = { W1: { local: 0.75, harness: 0.9 }, W2: 1, W3: 0.6 };
const step = (status: string, family: string | null, firstTryValid = true, route = 'local') => ({ status, family, firstTryValid, route });

test('W1 is per route, W3 leaves refused calls out of the proposals', () => {
  const score = scoreAgentRuns([
    { premise: 'a', route: 'local', finished: true, validationErrors: 0, steps: [step('observed', 'read'), step('accepted', 'edit'), step('refused', 'edit', false), step('rejected', 'edit')] },
  ], floors);
  assert.deepEqual(score.W1.local, { valid: 3, calls: 4, rate: 0.75, floor: 0.75, pass: true });
  assert.deepEqual(score.W3, { accepted: 1, proposed: 2, rate: 0.5, floor: 0.6, pass: false });
  assert.equal(score.W2.pass, true);
});

test('W2 fails when a run never finished, even if every finished story is valid', () => {
  const score = scoreAgentRuns([
    { premise: 'a', route: 'local', finished: true, validationErrors: 0, steps: [] },
    { premise: 'b', route: 'local', finished: false, validationErrors: 0, steps: [] },
  ], floors);
  assert.equal(score.W2.rate, 1);
  assert.equal(score.W2.pass, false);
});

test('W5 counts every install change and a draft the accepted steps do not explain', () => {
  const before = { characters: ['A'], lorebooks: ['L'], groups: [], persona: 'User', selectedLorebooks: [] };
  assert.deepEqual(w5Escapes(before, before, true), []);
  assert.deepEqual(w5Escapes(before, { ...before, characters: ['A', 'Rin'], persona: 'Rin' }, false), [
    'character added: Rin',
    'persona changed: User -> Rin',
    'the draft differs from the replay of the accepted steps',
  ]);
});

test('a recipe task passes only when the recipe was read, every required tool was kept, the run finished and the draft validates', () => {
  const call = (tool: string, status: string, args: Record<string, unknown> = {}) => ({ status, call: { tool, args } });
  const task = { id: 't', recipe: 'quest-line', requires: ['addQuality', 'setQuests'] };
  const good = { session: { status: 'done', steps: [call('readRecipe', 'observed', { recipe: 'Quest-Line ' }), call('addQuality', 'accepted'), call('setQuests', 'applied')] }, validationErrors: 0 };
  assert.equal(scoreRecipeTask(task, good).pass, true);
  assert.deepEqual(scoreRecipeTask(task, { ...good, session: { ...good.session, steps: good.session.steps.slice(1) } }).readRecipe, false);
  assert.deepEqual(scoreRecipeTask(task, { ...good, session: { ...good.session, steps: [good.session.steps[0], call('addQuality', 'accepted'), call('setQuests', 'rejected')] } }).missing, ['setQuests']);
  assert.equal(scoreRecipeTask(task, { ...good, validationErrors: 1 }).pass, false);
  assert.equal(scoreRecipeTask(task, { ...good, session: { ...good.session, status: 'stopped' } }).pass, false);
});

test('v2.8 52 C7: a recipe task with diagnosticsAbsent passes only when the agent read diagnostics after its last edit and none of the codes showed', () => {
  const task = { id: 'codex-pages', recipe: 'codex-pages', requires: ['setCodexEntry'], diagnosticsAbsent: ['codex-gate-holds-at-start'] };
  const base = [
    { status: 'observed', call: { tool: 'readRecipe', args: { recipe: 'codex-pages' } }, observation: '' },
    { status: 'accepted', call: { tool: 'setCodexEntry', args: {} }, observation: '' },
  ];
  const clean = { status: 'observed', call: { tool: 'readDiagnostics', args: {} }, observation: 'no diagnostics' };
  const dirty = { status: 'observed', call: { tool: 'readDiagnostics', args: {} }, observation: 'warning codex-gate-holds-at-start on arin' };
  const run = (steps: any[]) => scoreRecipeTask(task, { session: { status: 'done', steps }, validationErrors: 0 });
  assert.equal(run([...base, clean]).pass, true);
  assert.equal(run([...base, dirty]).pass, false);
  assert.deepEqual(run([...base, dirty]).diagnostics, { verified: true, found: ['codex-gate-holds-at-start'] });
  assert.equal(run(base).pass, false);
  assert.equal(run([base[0], clean, base[1]]).pass, false);
});

test('v2.8 09 A6: a task passes when the replacement clears every flagged note', async () => {
  const { scoreCardRevision } = await import('./wizardAgentScore.mts');
  const card = (id: number, status: string, notes: string[], replaces?: number) => ({ id, status, call: { tool: 'createCharacterCard' }, notes, ...(replaces ? { replaces } : {}) });
  const task = { id: 't', plants: 'description-thin' };
  assert.equal(scoreCardRevision(task, [card(1, 'replaced', ['description-thin']), card(2, 'rejected', [], 1)]).pass, true);
  assert.deepEqual(scoreCardRevision(task, [card(1, 'replaced', ['description-thin']), card(2, 'rejected', ['description-thin'], 1)]).left, ['description-thin']);
  assert.equal(scoreCardRevision(task, [card(1, 'rejected', ['description-thin'])]).revised, false);
  assert.equal(scoreCardRevision(task, [card(1, 'rejected', [])]).seeded, false);
  assert.equal(scoreCardRevision(task, [{ id: 1, status: 'observed', call: { tool: 'readGraph' } }]).seeded, false);
});
