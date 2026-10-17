import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { plumbingJourney, plumbingReplyEval } from './journeyPlumbing.mts';
import { validateFixture } from './scenarioSchema.mts';

test('plumbing copy: every send_generate becomes send + a canned reply eval, ids marked, loader-valid', () => {
  const source = JSON.parse(readFileSync(join(process.cwd(), 'test/journeys/gs6-adoption.journey.json'), 'utf-8'));
  const generated = source.checks.flatMap((c: { steps: Array<Record<string, unknown>> }) => c.steps).filter((s: Record<string, unknown>) => s.send_generate).length;
  const { journey, replaced } = plumbingJourney(source);
  assert.equal(replaced, generated);
  assert.equal(journey.id, 'GS6-plumbing');
  assert.match(String(journey.objective), /^PLUMBING ONLY, never evidence/);
  const steps = journey.checks.flatMap((c) => c.steps);
  assert.equal(steps.filter((s) => s.send_generate).length, 0);
  assert.equal(steps.filter((s) => typeof s.eval === 'string' && (s.eval as string).includes('plumbingReply')).length, generated);
  assert.deepEqual(validateFixture(journey, journey.id), []);
});

test('the canned reply eval compiles as one line of JS', () => {
  const code = plumbingReplyEval('It\'s "quiet" here.');
  assert.ok(!code.includes('\n'));
  assert.doesNotThrow(() => new Function(`return (async () => { ${code} })()`));
});
