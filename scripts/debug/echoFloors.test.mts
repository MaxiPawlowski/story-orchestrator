import { test } from 'node:test';
import assert from 'node:assert/strict';
import { echoRate, echoVerdict, echoWindow, specificity } from './lib/echoFloors.mts';
import { scoreRows } from './so-echo-floors.mts';

const filler = (index: number) => `filler message number ${index} about nothing in particular at all today`;
const history = (old: string) => Array.from({ length: 45 }, (_, index) => (index === 45 - 20 ? old : filler(index)));
const old = 'the lantern swung over the black water while the ferryman counted coins slowly';

test('the echo window is messages 15 to 40 back', () => {
  const rows = Array.from({ length: 50 }, (_, index) => String(index));
  assert.deepEqual(echoWindow(rows), rows.slice(10, 36));
  assert.equal(echoWindow(rows).at(-1), '35');
  assert.equal(echoWindow(rows)[0], '10');
});

test('a reply copying an old message echoes; one copying the newest message does not count', () => {
  assert.equal(echoRate(old, history(old)), 1);
  const recent = [...history('x y z'), old];
  assert.equal(echoRate(old, recent), 0);
  assert.equal(echoRate('too short to have grams', history(old)), null);
});

test('specificity counts names and numbers mid-sentence, not sentence openers', () => {
  assert.equal(specificity('She went home.'), 0);
  const value = specificity('She paid Mara three coins at the Harbor gate.') ?? 0;
  assert.ok(Math.abs(value - (3 / 9) * 100) < 1e-9);
});

test('the verdict applies the predeclared floors', () => {
  const samples = [
    { arm: 'trim', echo: 0.01, specificity: 10 }, { arm: 'compact', echo: 0.02, specificity: 9.5 },
  ];
  assert.deepEqual(echoVerdict(samples, 'trim', 'compact').pass, { echo: true, specificity: true });
  assert.deepEqual(echoVerdict([...samples.slice(0, 1), { arm: 'compact', echo: 0.04, specificity: 8 }], 'trim', 'compact').pass, { echo: false, specificity: false });
  assert.equal(echoVerdict([], 'trim', 'compact').pass, null);
});

test('scoreRows reads a rating dir shape and pairs seeds to points', () => {
  const turn = (role: string, text: string) => `<|turn>${role}\n${text}<turn|>\n`;
  const prompt = turn('system', 'card') + history(old).map((text) => turn('model', text)).join('') + '<|turn>model\n';
  const verdict = scoreRows([{ id: 'p1', prompts: { trim: prompt, compact: prompt } }],
    [{ id: 'p1-s1', arm: 'trim', text: 'Mara waits by the gate and says nothing more tonight to anyone' }, { id: 'p1-s1', arm: 'compact', text: old }], 'trim', 'compact');
  assert.equal(verdict.echo.compact, 1);
  assert.equal(verdict.echo.trim, 0);
  assert.deepEqual(verdict.pass, { echo: false, specificity: true });
});
