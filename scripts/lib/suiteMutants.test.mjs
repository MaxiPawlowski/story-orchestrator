import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyMutant, classifyJest, classifyRun, importsModule, mutationScore, noKillTests, relativeTest, specProblems, stratifiedSample, testAttribution } from './suiteMutants.mjs';
import { applyAt, mutantsOf } from './suiteMutantGen.mjs';
import { replayScope } from '../suite/defect-replay.mjs';

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

test('CR-P23: test:replay runs each mutant against its named killers by default, and against the whole suite with --full', () => {
  const spec = { tests: ['src/a.test.ts', 'src/b.test.ts'] };
  assert.deepEqual(replayScope(spec, false), ['--runTestsByPath', 'src/a.test.ts', 'src/b.test.ts']);
  assert.deepEqual(replayScope(spec, true), []);
});

test('testAttribution names the related and killing test files relative to the staged copy', () => {
  const result = { testResults: [
    { name: String.raw`C:\Temp\so-mutation-0\src\engine\gates.test.ts`, assertionResults: [{ status: 'passed' }, { status: 'failed' }] },
    { name: String.raw`C:\Temp\so-mutation-0\src\engine\engine.test.ts`, assertionResults: [{ status: 'passed' }] },
  ] };
  assert.deepEqual(testAttribution(result, String.raw`C:\Temp\so-mutation-0`), { related: ['src/engine/engine.test.ts', 'src/engine/gates.test.ts'], killers: ['src/engine/gates.test.ts'] });
  assert.deepEqual(testAttribution(null, 'x'), { related: [], killers: [] });
});

test('noKillTests lists test files that faced enough scored mutants and killed none; crashes are not evidence', () => {
  const outcomes = [
    { verdict: 'killed', related: ['a.test.ts', 'b.test.ts'], killers: ['a.test.ts'] },
    { verdict: 'survived', related: ['a.test.ts', 'b.test.ts', 'c.test.ts'], killers: [] },
    { verdict: 'killed', related: ['b.test.ts', 'c.test.ts'], killers: ['c.test.ts'] },
    { verdict: 'crashed', related: ['b.test.ts', 'd.test.ts'], killers: [] },
    { verdict: 'survived', related: ['d.test.ts'], killers: [] },
  ];
  const review = noKillTests(outcomes, 3);
  assert.deepEqual(review.noKill, [{ file: 'b.test.ts', faced: 3, killed: 0 }]);
  assert.deepEqual([review.tests, review.killing, review.thin], [4, 2, 1]);
});

test('relativeTest strips a staged copy whether jest reports the short or the long temp path', () => {
  assert.equal(relativeTest('C:/Users/Some/AppData/Local/Temp/so-mutation-2-5c3493db/src/a/b.test.ts', 'C:/Users/SOME~1/AppData/Local/Temp/so-mutation-2-5c3493db'), 'src/a/b.test.ts');
  assert.equal(relativeTest('C:/Users/Some/AppData/Local/Temp/so-mutation-0-5c3493db/src/c.test.ts', ''), 'src/c.test.ts');
  assert.equal(relativeTest('src/d.test.ts', ''), 'src/d.test.ts');
});

test('importsModule follows relative and alias imports to the mutated module only', () => {
  const source = 'import { a } from "./arcs";\nimport { b } from "@engine/gates";\njest.mock("../judge/scene");';
  assert.equal(importsModule(source, 'src/memory/arcs.test.ts', 'src/memory/arcs.ts'), true);
  assert.equal(importsModule(source, 'src/memory/arcs.test.ts', 'src/engine/gates.ts'), true);
  assert.equal(importsModule(source, 'src/memory/arcs.test.ts', 'src/judge/scene.ts'), true);
  assert.equal(importsModule(source, 'src/memory/arcs.test.ts', 'src/memory/score.ts'), false);
});
