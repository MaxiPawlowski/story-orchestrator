import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateSteps, validateFixture } from './lib/scenarioSchema.mts';
import { withAuthorView } from './lib/scenarioRequires.mts';
import { vacuousReason } from './lib/stepPrecondition.mts';

test('precondition is a modifier: it validates its shape and must name an earlier step', () => {
  assert.deepEqual(validateSteps([{ eval: 'return {kept: 1};' }, { precondition: { step: 1, path: 'kept', atLeast: 1 }, eval: 'return 1;' }]), []);
  const bad = validateSteps([{ eval: 'return 1;' }, { precondition: { step: 2, path: '', atLeast: 'one', extra: true }, eval: 'return 1;' }]);
  assert.equal(bad.length, 4);
  assert.match(bad.join('\n'), /unknown key\(s\) extra/);
  assert.match(bad.join('\n'), /earlier step/);
  assert.deepEqual(validateSteps([{ precondition: { step: 1, path: 'x', atLeast: 1 } }]).length, 1);
});

test('a leg whose precondition did not happen is vacuous, never a pass', () => {
  const precondition = { step: 2, path: 'kept', atLeast: 1 };
  assert.equal(vacuousReason(precondition, [{}, { kept: 1 }]), null);
  assert.equal(vacuousReason(precondition, [{}, { kept: [1, 2] }]), null);
  assert.match(vacuousReason(precondition, [{}, { kept: 0 }]) as string, /^vacuous: precondition step 2 kept=0 needs >= 1/);
  assert.match(vacuousReason(precondition, [{}, {}]) as string, /kept=null/);
  assert.match(vacuousReason(precondition, [{}]) as string, /step did not run/);
  assert.equal(vacuousReason({ step: 1, path: 'a.b', atLeast: 2 }, [{ a: { b: 2 } }]), null);
});

test('47 promises: step 13 (rollback reopens) is vacuous when step 10 read no kept event', async () => {
  const doc = JSON.parse(await readFile(join(process.cwd(), 'test/scenarios/live-v28-47-promises.json'), 'utf-8'));
  assert.deepEqual(validateFixture(doc, '47'), []);
  const step13 = doc.steps[12];
  assert.deepEqual(step13.precondition, { step: 10, path: 'kept', atLeast: 1 });
  assert.ok('eval' in doc.steps[9] && /kept: kept\.length/.test(doc.steps[9].eval));
  const outputs: unknown[] = [];
  outputs[9] = { kept: 0, events: ['promised'], rows: 1 };
  assert.match(vacuousReason(step13.precondition, outputs) as string, /^vacuous/);
  outputs[9] = { kept: 1, events: ['promised', 'kept'], rows: 1 };
  assert.equal(vacuousReason(step13.precondition, outputs), null);
});

test('author-view insertion keeps a precondition pointing at the authored step', () => {
  const steps = [{ import_story: { file: 'x.json' } }, { eval: 'return {kept: 1};' }, { precondition: { step: 2, path: 'kept', atLeast: 1 }, eval: 'return 1;' }];
  const out = withAuthorView(steps, { authorView: true }) as Array<Record<string, unknown>>;
  assert.equal(out.length, 4);
  assert.deepEqual(out[3].precondition, { step: 3, path: 'kept', atLeast: 1 });
  assert.ok('eval' in out[2]);
});
