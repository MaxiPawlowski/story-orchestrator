import { generateMemoryId } from "@memory/index";
import { EFFECT_LEDGER_LIMIT, type EffectLedgerRow, type EffectLedgerStatus, type EffectTarget } from "./types";

// Host effects touch state shared with every other chat: a group's disabled members, a
// lorebook FILE, the Author's Note, the preset, the background. A chat that changes one therefore
// owes an account of what it changed and how to put it back — and has to survive being killed
// between the host call and the save that would have recorded it.
//
// That is why the row is written BEFORE the call (status `pending`) and updated after. A row left
// `pending` by a crash is not a mystery: the host either holds `after` (the write landed), `before`
// (it never did) or neither (something else wrote). `reconcile` is that decision, kept pure here.

export interface EffectWrite {
  effect: string;
  target: EffectTarget;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  checkpointId: string | null;
  boundary: number;
  messageId: number;
  at: string;
}

export const pendingRow = (write: EffectWrite): EffectLedgerRow => ({ ...write, id: generateMemoryId(), status: "pending" });

const owesRestore = (row: EffectLedgerRow) => row.status === "applied" || row.status === "pending";

/**
 * The limit trims SETTLED rows only, oldest first. A row that is applied or pending is the chat's
 * only record of a host change it still owes back; forgetting it leaks the change on leave.
 */
export function trimLedger(rows: EffectLedgerRow[]): EffectLedgerRow[] {
  let excess = rows.length - EFFECT_LEDGER_LIMIT;
  if (excess <= 0) return rows;
  return rows.filter((row) => {
    if (excess <= 0 || owesRestore(row)) return true;
    excess -= 1;
    return false;
  });
}

export function appendRow(rows: EffectLedgerRow[], row: EffectLedgerRow): EffectLedgerRow[] {
  return trimLedger([...rows, row]);
}

export function setStatus(rows: EffectLedgerRow[], id: string, status: EffectLedgerStatus, patch: Partial<EffectLedgerRow> = {}): EffectLedgerRow[] {
  return rows.map((row) => (row.id === id ? { ...row, ...patch, status } : row));
}

/** Two recorded values are the same when they say the same thing, key order included. */
const same = (left: Record<string, unknown> | null, right: Record<string, unknown> | null): boolean => {
  if (left === null || right === null) return left === right;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => JSON.stringify(left[key] ?? null) === JSON.stringify(right[key] ?? null));
};

export interface ReconcileReads {
  /** What the host holds NOW for a target, or null when it cannot be read at all. */
  read: (target: EffectTarget) => Record<string, unknown> | null;
}

/**
 * What a `pending` row turns out to have been. A crash between the host write and the persist leaves
 * exactly one question — did it land? — and the host's current value answers it:
 *
 * - equal to `after` → the write landed, so the row was only ever missing its status (`applied`).
 * - equal to `before` → it never landed, so there is nothing to restore (`dropped`).
 * - neither → someone else wrote in between (`externally-changed`), which the author decides about.
 * - unreadable → the question cannot be answered, so the row is left alone rather than guessed at.
 */
export type ReconcileOutcome = "applied" | "dropped" | "externally-changed" | "unreadable" | "reverted";

export function reconcileRow(row: EffectLedgerRow, reads: ReconcileReads): ReconcileOutcome {
  if (row.status === "applied") {
    if (same(row.before, row.after)) return "applied";
    const held = reads.read(row.target);
    return held !== null && same(held, row.before) ? "reverted" : "applied";
  }
  if (row.status !== "pending") return "applied";
  const current = reads.read(row.target);
  if (current === null) return "unreadable";
  if (same(current, row.after)) return "applied";
  if (same(current, row.before)) return "dropped";
  return "externally-changed";
}

/** Every `pending` row of a chat, decided in one pass. */
export function reconcileLedger(rows: EffectLedgerRow[], reads: ReconcileReads): { rows: EffectLedgerRow[]; outcomes: Array<{ row: EffectLedgerRow; outcome: ReconcileOutcome }> } {
  const outcomes: Array<{ row: EffectLedgerRow; outcome: ReconcileOutcome }> = [];
  const next = rows.flatMap((row) => {
    if (row.status === "applied") {
      const settled = reconcileRow(row, reads);
      if (settled !== "reverted") return [row];
      outcomes.push({ row, outcome: settled });
      return [{ ...row, status: "reverted" as const }];
    }
    if (row.status !== "pending") return [row];
    const outcome = reconcileRow(row, reads);
    outcomes.push({ row, outcome });
    if (outcome === "dropped") return [];
    if (outcome === "unreadable") return [row];
    return [{ ...row, status: outcome === "applied" ? ("applied" as const) : ("externally-changed" as const) }];
  });
  return { rows: next, outcomes };
}

/**
 * What a restore of this chat's effects has to undo. A restore puts `before` back **only if** the
 * host still holds what this chat wrote: anything else means somebody edited the shared resource
 * after us, and overwriting that would silently undo their work.
 *
 * NEWEST write first, and each row is judged against the value the undo chain currently holds — not
 * against one reading taken before the loop. Two rows on one target are a history, and undoing the
 * oldest first leaves the resource at the older write's `before` instead of at the value the chat
 * found: measured live on a group's `disabled_members`, where road(disable) →
 * hall(enable) left Tobias DISABLED after the chat that wrote both was left, i.e. an EVEN number of
 * flips on one target ends at the wrong end. Undoing newest first makes each older row's
 * precondition the value its own successor put back, so the chain lands where the chat started.
 */
export interface RestoreStep {
  row: EffectLedgerRow;
  /** Null when the host no longer holds `after`: the step is refused, not guessed. */
  restoreTo: Record<string, unknown> | null;
}

const targetKey = (target: EffectTarget): string => JSON.stringify(target);

export function restorePlan(rows: EffectLedgerRow[], reads: ReconcileReads): { steps: RestoreStep[]; refused: EffectLedgerRow[] } {
  const steps: RestoreStep[] = [];
  const refused: EffectLedgerRow[] = [];
  const running = new Map<string, Record<string, unknown> | null>();
  for (const row of [...rows].reverse()) {
    if (row.status !== "applied") continue;
    // A row whose effect is a no-op (`before === after`) needs no restore and cannot be compared.
    if (same(row.before, row.after)) continue;
    const key = targetKey(row.target);
    const current = running.has(key) ? running.get(key) ?? null : reads.read(row.target);
    if (current !== null && same(current, row.after)) {
      steps.push({ row, restoreTo: row.before });
      running.set(key, row.before);
    } else {
      refused.push({ ...row, status: "externally-changed", found: current });
    }
  }
  return { steps, refused };
}

/**
 * The rows a rollback from `messageId` withdraws: everything this chat applied AT or after the edited
 * message — an effect fired on that message's boundary was caused by text that no longer exists.
 */
export function rowsAfter(rows: EffectLedgerRow[], messageId: number): EffectLedgerRow[] {
  return rows.filter((row) => row.status === "applied" && row.messageId >= messageId);
}
