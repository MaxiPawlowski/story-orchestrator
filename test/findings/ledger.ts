// v2.3 plan 01 §A — the finding ledger, executed.
//
// The review's lesson was that a green harness proves nothing on its own. `it.failing` is not
// enough either: jest reports a `.failing` test as passed whenever its body throws, so a broken
// fixture, an obsolete API call or an unrelated typo keeps an "open finding" green forever and
// nobody notices the reproduction stopped reproducing.
//
// So an open finding is an ordinary test that states the INTENDED contract, and this helper
// asserts two things about it: that it still fails, and that it fails for the reason the ledger
// records. When the fix lands, the ledger row flips to `closed` and the same body must pass —
// there is no second place to edit and no marker to forget.

import { readFileSync } from "node:fs";
import { join } from "node:path";

export type FindingEvidence = "jest" | "node" | "live" | "human";
export type FindingStatus = "open" | "closed" | "by-design";

export interface LedgerRow {
  id: string;
  title: string;
  owner: string;
  evidence: FindingEvidence;
  status: FindingStatus;
  /** A substring of the assertion message an open finding must fail with. */
  expectedFailure?: string;
  /** Where a `live` or `human` row is proven instead. A closed `node` row cites `<file> :: <test title>`. */
  provenBy?: string;
  note?: string;
}

const LEDGER_PATH = join(__dirname, "ledger.json");

let cached: LedgerRow[] | null = null;

export function loadLedger(): LedgerRow[] {
  if (!cached) cached = JSON.parse(readFileSync(LEDGER_PATH, "utf-8")).findings as LedgerRow[];
  return cached;
}

export function ledgerRow(id: string): LedgerRow {
  const row = loadLedger().find((entry) => entry.id === id);
  if (!row) throw new Error(`finding "${id}" is not in test/findings/ledger.json — add the row before writing its test`);
  return row;
}

export const openJestFindings = () => loadLedger().filter((row) => row.evidence === "jest" && row.status === "open");

const messageOf = (error: unknown) => (error instanceof Error ? `${error.message}` : String(error));

async function settle(fn: () => void | Promise<void>): Promise<unknown | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    return error;
  }
}

/**
 * Declare the intended contract for a finding. The ledger decides what must happen:
 *
 * - `open`   — the body must still throw, and its message must contain `expectedFailure`.
 *              A body that passes means the defect is fixed: flip the row to `closed`.
 *              A body that throws something else means the reproduction broke and is no
 *              longer evidence of anything.
 * - `closed` — the body must pass, so a regression fails the build.
 */
export function finding(id: string, fn: () => void | Promise<void>): void {
  const row = ledgerRow(id);
  if (row.evidence !== "jest") {
    throw new Error(`finding "${id}" is recorded as ${row.evidence} evidence (${row.provenBy ?? "no proof named"}) — it must not be declared as a jest test`);
  }

  test(`${id}: ${row.title}`, async () => {
    const error = await settle(fn);

    if (row.status === "closed") {
      if (error) throw new Error(`${id} is closed in the ledger but its contract test failed — a regression:\n${messageOf(error)}`);
      return;
    }

    if (!error) {
      throw new Error(`${id} is open in the ledger but its contract test passed. If the fix landed, set status "closed" for ${id} in test/findings/ledger.json.`);
    }
    const expected = row.expectedFailure;
    if (!expected) {
      throw new Error(`${id} is open but the ledger records no expectedFailure, so nothing checks WHY it fails. Add one (the observed assertion message was: ${messageOf(error).slice(0, 200)})`);
    }
    if (!messageOf(error).includes(expected)) {
      throw new Error(
        `${id} still fails, but not for the recorded reason — the reproduction is no longer evidence.\n`
        + `  ledger expectedFailure: ${expected}\n`
        + `  actual failure:         ${messageOf(error).slice(0, 400)}`,
      );
    }
  });
}

/** A control beside an open finding: the behaviour that must keep working while it is open. */
export function control(title: string, fn: () => void | Promise<void>): void {
  test(`control: ${title}`, async () => { await fn(); });
}

/**
 * The load-bearing assertion of a finding's contract. Its message is the evidence — it is what the
 * ledger's `expectedFailure` matches, so it has to describe the defect in words that stay true
 * across refactors, not reproduce a matcher's formatting. Setup and controls keep ordinary
 * `expect`; only the claim the finding is about goes through `must`.
 */
export function must(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}
