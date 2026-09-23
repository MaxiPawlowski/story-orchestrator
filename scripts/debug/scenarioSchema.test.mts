// v2.3 plan 01 §C. Two jobs:
//   1. every shipped fixture passes the closed vocabulary, so the schema describes the runner that
//      exists rather than the one I imagined;
//   2. each vacuous-pass shape the credibility audit found is rejected, with the key named.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { globalsReadButNeverWritten, validateSteps, validateFixture } from './lib/scenarioSchema.mts';
import { validateJourneyExtraction } from './lib/configRestore.mts';

const ROOT = join(import.meta.dirname, '..', '..');
const corpus = (dir: string) => readdirSync(join(ROOT, dir))
  .filter((name) => name.endsWith('.json'))
  .map((name) => ({ name, dir, doc: JSON.parse(readFileSync(join(ROOT, dir, name), 'utf-8').replace(/^﻿/, '')) }));

test('every shipped scenario and journey passes the closed vocabulary', () => {
  const files = [...corpus('test/scenarios'), ...corpus('test/journeys')];
  assert.ok(files.length > 40, `expected the whole corpus, found ${files.length} fixtures`);
  const broken = files
    .map((file) => ({ name: file.name, problems: validateFixture(file.doc, file.name) }))
    .filter((file) => file.problems.length);
  assert.deepEqual(broken, [], `fixtures that would not test what they say:\n${broken.map((file) => `${file.name}\n  ${file.problems.join('\n  ')}`).join('\n')}`);
});

// A fixture that READS a page global it never SETS is a fixture whose failure will name the wrong
// cause. `plan05-pin-quarantine` read `globalThis.__p05Fact` in three steps and never assigned it, so
// every lookup returned undefined and the run reported "the pinned fact was deleted by the rollback
// instead of being quarantined" — a product defect that did not exist, in the message a reader would
// have believed (2026-09-22). It is a text check because the fixture is the text.
test('no fixture reads a page global it never sets', () => {
  const files: Array<{ name: string; text: string }> = [];
  for (const dir of ['test/scenarios', 'test/journeys']) {
    for (const name of readdirSync(join(ROOT, dir)).filter((entry) => entry.endsWith('.json'))) {
      files.push({ name, text: readFileSync(join(ROOT, dir, name), 'utf-8') });
    }
  }
  assert.ok(files.length > 40, `expected the whole corpus, found ${files.length} fixtures`);
  assert.deepEqual(globalsReadButNeverWritten(files), []);
  // The rule is only a rule if it can fail: the offender this was written for, and the write that
  // clears it, on synthetic text — a corpus that happens to be clean proves nothing about the check.
  assert.deepEqual(globalsReadButNeverWritten([{ name: 'synthetic', text: 'globalThis.__x = 1; rt.get(globalThis.__y);' }]), ['synthetic: reads __y and never sets it']);
  assert.deepEqual(globalsReadButNeverWritten([{ name: 'synthetic', text: 'globalThis.__y = 1; rt.get(globalThis.__y);' }]), []);
});

test('a typo in an expect key is rejected, and the key is named', () => {
  // The T1 case verbatim: this step reported ok and asserted nothing at all.
  const problems = validateSteps([{ expect: { activeCheckpont: 'cp2' } }]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /unknown key "activeCheckpont"/);
  assert.match(problems[0], /did you mean "activeCheckpoint"\?/);
});

test('an empty assertion object is rejected', () => {
  for (const step of [{ expect: {} }, { wait: {} }, { expect_ui: {} }]) {
    const [problem] = validateSteps([step]);
    assert.match(problem, /empty assertion object/);
  }
});

test('two verbs in one step are rejected, because only the first would run', () => {
  const [problem] = validateSteps([{ send: 'hello', expect: { activeCheckpoint: 'cp2' } }]);
  assert.match(problem, /2 verbs in one step \(send, expect\)/);
});

test('modifiers do not count as verbs, and a step of modifiers alone is rejected', () => {
  assert.deepEqual(validateSteps([{ send: 'hi', log: true, attempts: 3, retryBack: 1, adoptsNewChat: true, expectFail: true }]), []);
  const [problem] = validateSteps([{ log: true }]);
  assert.match(problem, /no verb/);
});

test('an unknown verb is rejected', () => {
  const [problem] = validateSteps([{ sned: 'hello' }]);
  assert.match(problem, /unknown step verb "sned"/);
});

test('an unknown sub-action is rejected for ui, stagecraft and copilot', () => {
  assert.match(validateSteps([{ ui: { action: 'open-drawr' } }])[0], /unknown action "open-drawr"/);
  assert.match(validateSteps([{ stagecraft: { action: 'curat' } }])[0], /unknown action "curat"/);
  assert.match(validateSteps([{ copilot: { action: 'prob' } }])[0], /unknown action "prob"/);
});

test('the string shorthand for an action is accepted', () => {
  assert.deepEqual(validateSteps([{ ui: 'open-drawer' }, { stagecraft: 'curate' }, { copilot: 'probe' }]), []);
});

test('comparison-suffixed expect keys are vocabulary, not typos', () => {
  // These are read by bracket access in the runner, so a schema built by scanning `expected.x`
  // alone would have condemned eleven real assertions across nine fixtures.
  assert.deepEqual(validateSteps([{ expect: { 'auditCount>=': 1 } }, { expect: { 'reconciliationEvents>=': 1 } }, { expect: { 'sceneBreaks>=': 1 } }]), []);
});

test('journey checks are validated too, and the check id is named', () => {
  const journey = { id: 'J9', checks: [{ id: 'J9.1', steps: [{ expect: { activeChckpoint: 'x' } }] }] };
  const [problem] = validateFixture(journey, 'j9.journey.json');
  assert.match(problem, /J9\.1/);
  assert.match(problem, /unknown key "activeChckpoint"/);
});

test('setup and cleanup step lists are validated', () => {
  assert.match(validateFixture({ setup: { steps: [{ sned: 'x' }] } })[0], /setup\.steps\[0\]/);
  assert.match(validateFixture({ cleanup: { steps: [{ expect: {} }] } })[0], /cleanup\.steps\[0\]/);
});

// The vocabulary was closed in plan 01; the JS inside an `eval` was not, and a typo there is a
// SyntaxError in the middle of a run that has already spent minutes on real turns.
test('an eval that does not compile is caught at load, with the step named', () => {
  const problems = validateSteps([{ eval: 'const a = ;' }]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /steps\[0\]\.eval: the eval does not compile/);
  // The runner's own wrapper is what is compiled, so a top-level await is legal here — and must be.
  assert.deepEqual(validateSteps([{ eval: 'const row = await globalThis.x(); return row;' }]), []);
  assert.deepEqual(validateSteps([{ eval: 'return { ok: true };' }]), []);
});

// A corpus guard proves nothing about a file it never read, and "the check is green" reads the same
// either way. Naming the newest fixtures is how the next plan's scenario cannot be silently left out.
test('the corpus actually contains the plan-05 and plan-06 live-gate fixtures', () => {
  const files = [...corpus('test/scenarios'), ...corpus('test/journeys')].map((file) => file.name);
  for (const name of ['plan05-pin-quarantine.json', 'plan05-pin-private-rollback.json', 'plan05-decision-write.json', 'live-effects-owned-restore.json', 'effects-preset.json']) {
    assert.ok(files.includes(name), `${name} is not in the validated corpus`);
  }
  assert.ok(files.length > 45, `expected the whole corpus, found ${files.length} fixtures`);
});

// v2.3 plan 06's live recipe named three harness pieces that did not exist. The vocabulary is the one
// place that says whether they do: a plan document claiming a verb exists is not a runner that
// honours it (the plan-05 `expect.payloadContains` case, one plan earlier).
test('the plan-06 vocabulary is real: the two assertions and the route block', () => {
  assert.deepEqual(validateSteps([
    { block_route: { pattern: '**/api/chats/save' } },
    { block_route: '**/api/chats/save' },
    { unblock_route: '**/api/chats/save' },
    { expect: { effectsLedger: { countAtLeast: 1 } } },
    { expect: { groupDisabled: { enabled: ['Belle'] } } },
  ]), []);
});

// A SHAPE the validator used to accept and the run died on: `{"send": {"text": …}}` passed the closed
// vocabulary and failed at step 4 with "sendCompactMessage requires a non-empty text string", because
// the verb hands its value straight to the page (2026-09-22). Seventeen corpus sends use the string
// form; the two that did not were written that same day and had never been executed.
test('a verb value of the wrong shape is refused at LOAD, not at step N', () => {
  const problems = validateSteps([
    { send: { text: 'hello' } },
    { send: 'hello' },
    { send_generate: { text: 'hello' } },
    { send_generate: 'hello' },
    { edit: { messageId: 2 } },
  ]);
  assert.deepEqual(problems, [
    'steps[0].send: expected a string, got an object ({"text": …} is the object form only where the runner documents it) — the verb hands this straight to the page',
    'steps[4].edit.text: expected a non-empty string, got nothing',
  ]);
});

test('every shipped journey declares the extraction it runs at (plan 01 §E)', () => {
  const journeys = corpus('test/journeys').filter((file) => file.name.endsWith('.journey.json'));
  assert.ok(journeys.length >= 13, `expected every journey, found ${journeys.length}`);
  const broken = journeys.flatMap((file) => validateJourneyExtraction(file.doc.setup).map((problem) => `${file.name}: ${problem}`));
  assert.deepEqual(broken, []);
});
