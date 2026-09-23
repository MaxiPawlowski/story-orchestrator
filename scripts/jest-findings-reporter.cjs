// v2.3 plan 01 §A — the half of the finding ledger a test cannot check about itself.
//
// `src/runtime/findingsLedger.test.ts` proves every jest row has a declared reproduction in the
// tree. It cannot prove that reproduction RAN: a `describe.skip`, a `testPathIgnorePatterns` entry
// or a file renamed out of the roots would leave the source scan green while nothing executed.
// This reporter reads the actual results and fails the run when a ledger row has no passing test.
//
// It enforces only on a full run. `npx jest some/file` is a normal thing to do while working, and
// failing that because the other 27 findings did not run would train everyone to ignore it.

const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const LEDGER = join(__dirname, '..', 'test', 'findings', 'ledger.json');

class FindingsReporter {
  constructor(globalConfig) {
    this._globalConfig = globalConfig || {};
    this._error = null;
  }

  _isFullRun() {
    const config = this._globalConfig;
    // jest 30 replaced the "testPathPattern" string with a TestPathPatterns object whose own
    // "patterns" array is empty on a full run; jest 29 and earlier passed the string. Reading only
    // the old shape made every run look filtered, so the gate silently never enforced.
    const pattern = config.testPathPattern ?? config.testPathPatterns;
    const hasPattern = Array.isArray(pattern)
      ? pattern.length > 0
      : pattern && typeof pattern === 'object' && Array.isArray(pattern.patterns)
        ? pattern.patterns.length > 0
        : Boolean(pattern);
    const hasNames = Boolean(config.testNamePattern);
    return !hasPattern && !hasNames && !config.onlyChanged && !config.lastCommit;
  }

  onRunComplete(_contexts, results) {
    if (!this._isFullRun()) return;

    let ledger;
    try {
      ledger = JSON.parse(readFileSync(LEDGER, 'utf-8')).findings;
    } catch (error) {
      this._error = new Error(`findings ledger could not be read (${error.message}) — the v2.3 evidence gate cannot run`);
      return;
    }

    // Key on the test's own title, not its fullName: jest prefixes fullName with every enclosing
    // describe block, so `fullName.startsWith("R4: ")` was false for every finding declared inside
    // one — the gate reported them as "never executed" on a perfectly good run.
    const executed = new Map();
    for (const file of results.testResults || []) {
      for (const assertion of file.testResults || []) {
        if (assertion.title) executed.set(assertion.title, assertion.status);
      }
    }

    const problems = [];
    const expectedOf = (row) => [...executed.keys()].find((title) => title === `${row.id}: ${row.title}` || title.startsWith(`${row.id}: `));

    for (const row of ledger) {
      if (row.evidence !== 'jest' || row.testPending) continue;
      const name = expectedOf(row);
      if (!name) {
        problems.push(`${row.id} (${row.status}): no test ran for this ledger row — it is declared in the tree but never executed`);
        continue;
      }
      const status = executed.get(name);
      if (status !== 'passed') {
        problems.push(`${row.id}: its reproduction reported "${status}", so the ledger's claim about it is unverified`);
      }
    }

    const open = ledger.filter((row) => row.status === 'open').length;
    const pending = ledger.filter((row) => row.evidence === 'jest' && row.testPending).map((row) => row.id);
    // eslint-disable-next-line no-console
    console.log(`\nfindings ledger: ${open} open, ${ledger.length - open} settled`
      + `${pending.length ? `, reproductions still to write: ${pending.join(', ')}` : ''}`);

    if (problems.length) {
      // jest prints its own summary ("99 passed") and swallows getLastError()'s message, so the
      // run would otherwise fail with no visible reason — and an unexplained red build is one
      // people learn to ignore. Say it here, loudly, before failing.
      // eslint-disable-next-line no-console
      console.error(`\n  ✕ findings ledger is not backed by executed evidence:\n    - ${problems.join('\n    - ')}\n`);
      this._error = new Error(`findings ledger is not backed by executed evidence (${problems.length} problem(s), listed above)`);
    }
  }

  getLastError() {
    return this._error;
  }
}

module.exports = FindingsReporter;
