import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyMutant, classifyJest, classifyRun, mutationScore, specProblems, stratifiedSample } from './suiteMutants.mjs';
import { applyAt, mutantsOf } from './suiteMutantGen.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SPECS = join(ROOT, 'test', 'findings', 'defect-replay');

test('a mutant applies in the file\'s own line endings, and only when its text is there exactly once', () => {
  const crlf = 'a();\r\nb();\r\nc();\r\n';
  const applied = applyMutant(crlf, { find: 'a();\nb();', replace: 'b();' });
  assert.equal(applied.ok, true);
  assert.equal(applied.mutated, 'b();\r\nc();\r\n');
  assert.match(applyMutant('x', { find: 'y', replace: '' }).reason, /not in the file/);
  assert.match(applyMutant('xx', { find: 'x', replace: 'y' }).reason, /occurs 2 times/);
  assert.match(applyMutant('x', { find: 'x', replace: 'x' }).reason, /unchanged/);
  assert.equal(applyMutant('$&', { find: '$&', replace: '$1' }).mutated, '$1', 'replacement text is literal, not a pattern');
});

test('only a failed assertion is a kill; a suite that never ran is a crash', () => {
  assert.equal(classifyJest({ numFailedTests: 2, numRuntimeErrorTestSuites: 1 }), 'killed');
  assert.equal(classifyJest({ numFailedTests: 0, numRuntimeErrorTestSuites: 1 }), 'crashed');
  assert.equal(classifyJest({ numFailedTests: 0, numFailedTestSuites: 1 }), 'crashed');
  assert.equal(classifyJest({ numFailedTests: 0, numTotalTests: 0, success: true }), 'no-tests');
  assert.equal(classifyJest({ numFailedTests: 0, numTotalTests: 4, success: true }), 'survived');
  assert.equal(classifyJest(null), 'crashed');
  assert.equal(classifyRun({ result: null, stderr: 'Test Suites: 1 failed\nTests:       3 failed, 99 passed' }), 'killed', 'a bailed run has only its stderr summary');
  assert.equal(classifyRun({ result: null, stderr: 'Test Suites: 1 failed\nTests:       0 total' }), 'crashed');
  assert.equal(classifyRun({ result: null, timedOut: true }), 'timeout');
});

test('the score counts killed over killed + survived, and never scores a crash', () => {
  const score = mutationScore(['killed', 'killed', 'survived', 'crashed', 'timeout']);
  assert.equal(score.scored, 3);
  assert.equal(score.score, 2 / 3);
  assert.equal(mutationScore([]).score, null);
});

test('the sample is seed-stable and spread across groups', () => {
  const items = Array.from({ length: 100 }, (_, index) => ({ index, group: index < 80 ? 'a' : 'b' }));
  const first = stratifiedSample(items, (item) => item.group, 10, 7).map((item) => item.index);
  assert.deepEqual(stratifiedSample(items, (item) => item.group, 10, 7).map((item) => item.index), first);
  assert.notDeepEqual(stratifiedSample(items, (item) => item.group, 10, 8).map((item) => item.index), first);
  assert.equal(first.filter((index) => index >= 80).length, 2);
});

test('AST mutants never land in a string, a comment or a type', () => {
  const text = 'type T = A | B;\nconst s = "a === b"; // x === y\nexport const f = (a: number, b: number) => a === b && !ok ? a + b : true;\n';
  const found = mutantsOf(text, 'f.ts');
  const operators = found.map((mutant) => mutant.operator).sort();
  assert.deepEqual(operators, ['+ -> -', '=== -> !==', '&& -> ||', 'cond ? -> true ?', 'drop !', 'true -> false'].sort());
  for (const mutant of found) assert.notEqual(applyAt(text, mutant), text);
});

test('every defect-replay spec is complete and still applies to the current tree (re-anchor a moved one)', () => {
  const files = readdirSync(SPECS).filter((name) => name.endsWith('.json'));
  assert.ok(files.length >= 20, 'the replay set holds the historical defects plan 13 names');
  const problems = files.flatMap((name) => {
    const spec = JSON.parse(readFileSync(join(SPECS, name), 'utf-8'));
    const own = specProblems(spec, ROOT).map((problem) => `${name}: ${problem}`);
    if (spec.id && `${spec.id}.json` !== name) own.push(`${name}: id ${spec.id} does not match the file name`);
    if (!own.length) {
      const applied = applyMutant(readFileSync(join(ROOT, spec.file), 'utf-8'), spec);
      if (!applied.ok) own.push(`${name}: ${applied.reason}`);
    }
    return own;
  });
  assert.deepEqual(problems, []);
});
