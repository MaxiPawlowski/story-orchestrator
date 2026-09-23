// @memory/index reaches the host through the injector, which this test never calls.
jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readBackBoundary: () => null, setStoryExtensionPrompt: jest.fn(), clearStoryExtensionPrompt: jest.fn(), MEMORY_INJECTION_KEY_PREFIX: "so-memory-" }));

import { appendRow, pendingRow, reconcileLedger, restorePlan, rowsAfter, setStatus, type EffectWrite } from "./effectLedger";
import type { EffectLedgerRow, EffectTarget } from "./types";

// v2.3 plan 06. The ledger is the chat's account of what it changed in state it shares with every
// other chat — a group's disabled members, a lorebook file, the Author's Note, the preset. Two
// questions decide whether it is honest: did a write that never reported back land, and may a
// restore overwrite what it finds there now?

const target = (member: string): EffectTarget => ({ kind: "cast", group: "g1", member });
const write = (member: string, before: unknown, after: unknown): EffectWrite => ({
  effect: "cast",
  target: target(member),
  before: { disabled: before },
  after: { disabled: after },
  checkpointId: "cp1",
  boundary: 1,
  messageId: 5,
  at: "2026-09-22T00:00:00.000Z",
});
const reads = (held: Record<string, Record<string, unknown> | null>) => ({ read: (want: EffectTarget) => (want.kind === "cast" ? held[want.member] ?? null : null) });

describe("the effect ledger records writes before they happen", () => {
  it("writes a pending row, then the host's answer", () => {
    const row = pendingRow(write("tobias", false, true));
    expect(row.status).toBe("pending");
    const applied = setStatus([row], row.id, "applied");
    expect(applied[0].status).toBe("applied");
  });

  it("keeps the newest rows and forgets the oldest", () => {
    const rows = Array.from({ length: 250 }, (_, index) => pendingRow(write(`m${index}`, false, true)));
    expect(appendRow([], rows[rows.length - 1])).toHaveLength(1);
    const built = rows.reduce((all, row) => appendRow(all, row), [] as EffectLedgerRow[]);
    expect(built).toHaveLength(200);
  });
});

describe("a pending row is reconciled against what the host holds", () => {
  it("was applied when the host holds the new value", () => {
    const row = pendingRow(write("tobias", false, true));
    const { rows, outcomes } = reconcileLedger([row], reads({ tobias: { disabled: true } }));
    expect(outcomes[0].outcome).toBe("applied");
    expect(rows[0].status).toBe("applied");
  });

  it("never landed when the host still holds the old value", () => {
    const row = pendingRow(write("tobias", false, true));
    const { rows, outcomes } = reconcileLedger([row], reads({ tobias: { disabled: false } }));
    expect(outcomes[0].outcome).toBe("dropped");
    expect(rows).toEqual([]);
  });

  it("was changed by someone else when the host holds neither value", () => {
    const row = pendingRow(write("tobias", false, true));
    const { rows, outcomes } = reconcileLedger([row], reads({ tobias: { disabled: "something else" } }));
    expect(outcomes[0].outcome).toBe("externally-changed");
    expect(rows[0].status).toBe("externally-changed");
  });

  it("is left alone when the host cannot be read at all", () => {
    const row = pendingRow(write("tobias", false, true));
    const { rows, outcomes } = reconcileLedger([row], reads({}));
    expect(outcomes[0].outcome).toBe("unreadable");
    expect(rows[0].status).toBe("pending");
  });

  it("leaves rows that already have an answer untouched", () => {
    const row = { ...pendingRow(write("tobias", false, true)), status: "failed" as const };
    const { rows, outcomes } = reconcileLedger([row], reads({ tobias: { disabled: true } }));
    expect(outcomes).toEqual([]);
    expect(rows[0].status).toBe("failed");
  });
});

describe("a restore is compare-and-set", () => {
  it("puts the old value back when the host still holds what this chat wrote", () => {
    const row = { ...pendingRow(write("tobias", false, true)), status: "applied" as const };
    const { steps, refused } = restorePlan([row], reads({ tobias: { disabled: true } }));
    expect(steps.map((step) => step.restoreTo)).toEqual([{ disabled: false }]);
    expect(refused).toEqual([]);
  });

  // The author toggled the member by hand between the write and the leave. Restoring would silently
  // undo them, so the step is REFUSED and the author is shown the conflict instead.
  it("refuses, naming what it found, when someone else wrote in between", () => {
    const row = { ...pendingRow(write("tobias", false, true)), status: "applied" as const };
    const { steps, refused } = restorePlan([row], reads({ tobias: { disabled: "by hand" } }));
    expect(steps).toEqual([]);
    expect(refused[0]).toMatchObject({ status: "externally-changed", found: { disabled: "by hand" } });
  });

  // Two rows on ONE target are a history, not two independent writes. Undoing the oldest first used
  // to leave an even number of flips at the wrong end — found live on a group's `disabled_members`
  // (2026-09-23): road(disable) → hall(enable) left Tobias DISABLED after the chat that wrote both
  // was left, and the next run's own guard refused to start over it. The chain runs newest-first, so
  // each older row's precondition is the value its own successor put back.
  it("undoes a target's history newest first, so the chain lands where the chat found it", () => {
    const disable = { ...pendingRow(write("tobias", false, true)), status: "applied" as const };
    const enable = { ...pendingRow(write("tobias", true, false)), status: "applied" as const };
    const plan = restorePlan([disable, enable], reads({ tobias: { disabled: false } }));
    expect(plan.refused).toEqual([]);
    expect(plan.steps.map((step) => step.restoreTo)).toEqual([{ disabled: true }, { disabled: false }]);
    // Applying the chain in the order given is what lands it: the enable goes back to disabled, then
    // the disable goes back to enabled — the state the chat found.
    const landed = plan.steps.reduce((held, step) => step.restoreTo ?? held, { disabled: false } as Record<string, unknown>);
    expect(landed).toEqual({ disabled: false });
    expect(plan.steps.map((step) => step.row.after)).toEqual([{ disabled: false }, { disabled: true }]);
  });

  it("still refuses the whole history when someone else wrote over it", () => {
    const disable = { ...pendingRow(write("tobias", false, true)), status: "applied" as const };
    const enable = { ...pendingRow(write("tobias", true, false)), status: "applied" as const };
    const plan = restorePlan([disable, enable], reads({ tobias: { disabled: "by hand" } }));
    expect(plan.steps).toEqual([]);
    expect(plan.refused).toHaveLength(2);
  });

  it("skips a write that changed nothing", () => {
    const row = { ...pendingRow(write("tobias", false, false)), status: "applied" as const };
    expect(restorePlan([row], reads({ tobias: { disabled: false } })).steps).toEqual([]);
  });

  it("never restores a row that is not applied", () => {
    const row = { ...pendingRow(write("tobias", false, true)), status: "failed" as const };
    expect(restorePlan([row], reads({ tobias: { disabled: true } })).steps).toEqual([]);
  });
});

describe("a rollback withdraws the writes made after it", () => {
  it("names them by the message they landed at", () => {
    const early = { ...pendingRow({ ...write("a", false, true), messageId: 3 }), status: "applied" as const };
    const late = { ...pendingRow({ ...write("b", false, true), messageId: 9 }), status: "applied" as const };
    const failed = { ...pendingRow({ ...write("c", false, true), messageId: 9 }), status: "failed" as const };
    expect(rowsAfter([early, late, failed], 5).map((row) => (row.target.kind === "cast" ? row.target.member : ""))).toEqual(["b"]);
  });
});
