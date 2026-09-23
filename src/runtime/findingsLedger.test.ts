// v2.3 plan 01 §A — the guard over the finding ledger itself.
//
// Two halves, because neither is sufficient alone:
//   - this test checks the ledger is well formed and that every jest row has a declared
//     reproduction in the tree (so a row cannot be closed by deleting its test);
//   - scripts/jest-findings-reporter.cjs checks, after the run, that each of those tests actually
//     EXECUTED and passed — a source scan cannot prove a suite was not skipped.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadLedger, type LedgerRow } from "../../test/findings/ledger";

const SRC = join(__dirname, "..");
const EVIDENCE = new Set(["jest", "live", "human"]);
const STATUS = new Set(["open", "closed", "by-design"]);

function reviewTestFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return reviewTestFiles(path);
    return entry.endsWith(".review.test.ts") ? [path] : [];
  });
}

const declaredIds = (): Map<string, string[]> => {
  const found = new Map<string, string[]>();
  for (const file of reviewTestFiles(SRC)) {
    for (const match of readFileSync(file, "utf-8").matchAll(/\bfinding\(\s*["']([^"']+)["']/g)) {
      found.set(match[1], [...(found.get(match[1]) ?? []), file]);
    }
  }
  return found;
};

const ledger = loadLedger();

describe("the findings ledger", () => {
  test("every row is well formed", () => {
    const problems: string[] = [];
    const seen = new Set<string>();
    for (const row of ledger) {
      if (seen.has(row.id)) problems.push(`${row.id}: duplicate row`);
      seen.add(row.id);
      if (!row.title) problems.push(`${row.id}: no title`);
      if (!row.owner) problems.push(`${row.id}: no owning plan`);
      if (!EVIDENCE.has(row.evidence)) problems.push(`${row.id}: evidence "${row.evidence}" is not jest | live | human`);
      if (!STATUS.has(row.status)) problems.push(`${row.id}: status "${row.status}" is not open | closed | by-design`);
      if (row.evidence !== "jest" && !row.provenBy) problems.push(`${row.id}: a ${row.evidence} row must name where it is proven`);
      if (row.evidence === "jest" && row.status === "open" && !row.expectedFailure && !(row as { testPending?: boolean }).testPending) {
        problems.push(`${row.id}: an open jest row needs an expectedFailure, or nothing checks WHY it fails`);
      }
    }
    expect(problems).toEqual([]);
  });

  test("every jest row has exactly one declared reproduction, and every declaration has a row", () => {
    const declared = declaredIds();
    const problems: string[] = [];
    for (const row of ledger) {
      const pending = (row as { testPending?: boolean }).testPending === true;
      const files = declared.get(row.id) ?? [];
      if (row.evidence === "jest" && !pending && files.length === 0) {
        problems.push(`${row.id}: recorded as jest evidence but no finding("${row.id}") exists — a finding cannot be closed by deleting its test`);
      }
      if (files.length > 1) problems.push(`${row.id}: declared in ${files.length} files (${files.join(", ")})`);
      if (row.evidence !== "jest" && files.length) problems.push(`${row.id}: recorded as ${row.evidence} evidence but declared as a jest finding`);
      if (pending && files.length) problems.push(`${row.id}: marked testPending but its test exists — clear the flag`);
    }
    for (const id of declared.keys()) {
      if (!ledger.some((row) => row.id === id)) problems.push(`${id}: declared as a finding but absent from the ledger`);
    }
    expect(problems).toEqual([]);
  });

  test("the open list is printed, so the number is never quoted from a document", () => {
    const open = ledger.filter((row) => row.status === "open");
    const byOwner = open.reduce<Record<string, string[]>>((acc, row) => {
      (acc[row.owner] ??= []).push(row.id + ((row as { testPending?: boolean }).testPending ? " (test pending)" : ""));
      return acc;
    }, {});
    const pending = open.filter((row) => (row as { testPending?: boolean }).testPending).map((row) => row.id);
    console.info(JSON.stringify({
      findingsLedger: {
        open: open.length,
        closed: ledger.filter((row) => row.status === "closed").length,
        byDesign: ledger.filter((row) => row.status === "by-design").length,
        byOwningPlan: byOwner,
        reproductionsStillToWrite: pending,
      },
    }, null, 2));
    expect(open.length).toBeGreaterThan(0);
  });
});

// A row whose evidence is not jest must be unusable as a jest test, so nobody can quietly close a
// live or human finding by writing a unit test that cannot see the thing it is about.
test("a non-jest finding cannot be declared as a jest test", () => {
  const liveRow = ledger.find((row: LedgerRow) => row.evidence !== "jest");
  expect(liveRow).toBeDefined();
  const { finding } = jest.requireActual("../../test/findings/ledger") as { finding: (id: string, fn: () => void) => void };
  expect(() => finding((liveRow as LedgerRow).id, () => {})).toThrow(/must not be declared as a jest test/);
});
