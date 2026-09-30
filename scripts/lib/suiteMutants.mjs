// v2.6 plan 13 R2: the shared half of the defect replay and the mutation baseline.
// A mutant that did not change the file proves nothing (scripts/mutate.mjs, 2026-09-20), and a run
// that crashed before any assertion ran is not a kill: both are refused here, once.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const eolOf = (content) => (content.includes('\r\n') ? '\r\n' : '\n');
const withEol = (text, eol) => text.replace(/\r\n/g, '\n').replace(/\n/g, eol);

const occurrences = (haystack, needle) => {
  let count = 0;
  for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + needle.length)) count += 1;
  return count;
};

/** Applies one find/replace mutant. The text to find must occur exactly once, in the file's own line endings. */
export function applyMutant(content, spec) {
  const eol = eolOf(content);
  const find = withEol(spec.find ?? '', eol);
  const replace = withEol(spec.replace ?? '', eol);
  if (!find) return { ok: false, reason: 'the mutant names no text to find' };
  const count = occurrences(content, find);
  if (count === 0) return { ok: false, reason: 'the text to find is not in the file (the code moved: re-anchor the mutant)' };
  if (count > 1) return { ok: false, reason: `the text to find occurs ${count} times; widen it until it is unique` };
  const mutated = content.replace(find, () => replace);
  if (mutated === content) return { ok: false, reason: 'the file is unchanged after the edit' };
  return { ok: true, mutated };
}

/** One jest --json result read as a verdict. Only a failed ASSERTION kills; a suite that never ran is a crash. */
export function classifyJest(result) {
  if (!result || typeof result !== 'object') return 'crashed';
  if ((result.numFailedTests ?? 0) > 0) return 'killed';
  if ((result.numRuntimeErrorTestSuites ?? 0) > 0 || (result.numFailedTestSuites ?? 0) > 0) return 'crashed';
  if ((result.numTotalTests ?? 0) === 0) return 'no-tests';
  return result.success ? 'survived' : 'crashed';
}

/**
 * `jest --bail` exits before it writes --outputFile, so a bailed run has only its stderr summary.
 * A summary line with failed TESTS is a kill; failed suites with no failed test are a crash.
 */
export function classifyRun({ result, stderr = '', timedOut = false }) {
  if (timedOut) return 'timeout';
  if (result) return classifyJest(result);
  const tests = /Tests:\s+(\d+) failed/.exec(stderr);
  if (tests && Number(tests[1]) > 0) return 'killed';
  return 'crashed';
}

const REQUIRED = ['id', 'defect', 'guards', 'fixCommit', 'file', 'find', 'tests'];

/** Everything a replay spec must state before it runs. `root` resolves the file and the tests. */
export function specProblems(spec, root) {
  const problems = REQUIRED.filter((key) => spec[key] === undefined || spec[key] === '').map((key) => `missing "${key}"`);
  if (typeof spec.replace !== 'string') problems.push('"replace" must be a string (empty deletes the found text)');
  if (spec.tests !== undefined && (!Array.isArray(spec.tests) || spec.tests.length === 0)) problems.push('"tests" must list at least one jest file');
  if (root && typeof spec.file === 'string' && !existsSync(join(root, spec.file))) problems.push(`file ${spec.file} does not exist`);
  if (root && Array.isArray(spec.tests)) for (const test of spec.tests) if (!existsSync(join(root, test))) problems.push(`test ${test} does not exist`);
  if (typeof spec.id === 'string' && !/^[a-z0-9][a-z0-9-]*$/.test(spec.id)) problems.push('"id" must be kebab-case');
  return problems;
}

/** Deterministic PRNG (mulberry32), so a sampled baseline can be re-run on the same mutants. */
export function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Takes `count` items, spread across groups in proportion to their size, in a seed-stable order. */
export function stratifiedSample(items, groupOf, count, seed) {
  const random = seeded(seed);
  const groups = new Map();
  for (const item of items) {
    const key = groupOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const shuffle = (list) => {
    const copy = [...list];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [copy[index], copy[swap]] = [copy[swap], copy[index]];
    }
    return copy;
  };
  const keys = [...groups.keys()].sort();
  const total = items.length;
  if (count >= total) return keys.flatMap((key) => shuffle(groups.get(key)));
  const picked = [];
  for (const key of keys) {
    const list = shuffle(groups.get(key));
    const share = Math.max(1, Math.round((list.length / total) * count));
    picked.push(...list.slice(0, share));
  }
  return picked;
}

/** Killed over killed + survived. Crashes, timeouts and uncovered mutants are reported, never scored. */
export function mutationScore(outcomes) {
  const tally = { killed: 0, survived: 0, crashed: 0, 'no-tests': 0, timeout: 0 };
  for (const outcome of outcomes) tally[outcome] = (tally[outcome] ?? 0) + 1;
  const scored = tally.killed + tally.survived;
  return { ...tally, scored, score: scored ? tally.killed / scored : null };
}
