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
// V20b: `node` is the harness's own node:test suite (`npm run test:debug`), where most of plan 01's
// findings are proven. A closed node row cites `<file> :: <test title>` and the title must be in the file.
const EVIDENCE = new Set(["jest", "node", "live", "human"]);
const ROOT = join(__dirname, "..", "..");
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
      if (!EVIDENCE.has(row.evidence)) problems.push(`${row.id}: evidence "${row.evidence}" is not jest | node | live | human`);
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

  test("a closed node row cites a harness test that is really in the file it names", () => {
    const problems: string[] = [];
    for (const row of ledger.filter((entry) => entry.evidence === "node" && entry.status === "closed")) {
      const [file, title] = (row.provenBy ?? "").split(" :: ");
      if (!file || !title) { problems.push(`${row.id}: a closed node row must cite "<file> :: <test title>"`); continue; }
      let text = "";
      try { text = readFileSync(join(ROOT, file), "utf-8"); } catch { problems.push(`${row.id}: ${file} does not exist`); continue; }
      if (!text.includes(`'${title}'`) && !text.includes(`"${title}"`)) problems.push(`${row.id}: ${file} has no test titled "${title}"`);
    }
    expect(problems).toEqual([]);
  });

  // V20b: the ledger used to be checked row by row, so an id the register names and nobody wrote down
  // (all of T1–T6 and S1–S13 until 2026-09-23) was invisible. The register is plan 01 §A's own list.
  test("every id in plan 01's register has a row", () => {
    const plan = readFileSync(join(ROOT, "docs/plans/v2.3/01-evidence-hardening.md"), "utf-8");
    const list = /one row per finding id \(([^)]*)\)/.exec(plan.replace(/\s+/g, " "))?.[1] ?? "";
    const register = list.split(",").map((part) => part.trim()).flatMap((part) => {
      const range = /^([A-Z]+)(\d+)[–-][A-Z]*(\d+)$/.exec(part);
      if (!range) return [part];
      return Array.from({ length: Number(range[3]) - Number(range[2]) + 1 }, (_, index) => `${range[1]}${Number(range[2]) + index}`);
    });
    expect(register).toHaveLength(49);
    const ids = new Set(ledger.map((row) => row.id));
    expect(register.filter((id) => !ids.has(id))).toEqual([]);
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
