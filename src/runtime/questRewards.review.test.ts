jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null, setStoryExtensionPrompt: jest.fn(), clearStoryExtensionPrompt: jest.fn(), MEMORY_INJECTION_KEY_PREFIX: "so-memory-" }));

import { compactLedger, pendingRow, restorePlan, rowsAfter, type EffectWrite } from "./effectLedger";
import { sanitizeEffects } from "./extras";
import type { EffectLedgerRow, EffectOrigin, RuntimeExtras } from "./types";

const wi = { kind: "wi" as const, book: "Lore", uid: 4, entry: "bell" };
const quest = (id: string, messageId: number): EffectOrigin => ({ kind: "quest", id, boundary: messageId, messageId });
const row = (before: unknown, after: unknown, messageId: number, origin?: EffectOrigin): EffectLedgerRow => {
  const write: EffectWrite = {
    effect: "world_info", target: wi, before: { disable: before }, after: { disable: after }, checkpointId: origin ? null : "cp1",
    boundary: messageId, messageId, at: "2026-10-07T00:00:00.000Z", ...(origin ? { origin } : {}),
  };
  return { ...pendingRow(write), status: "applied" };
};
const holding = (disable: unknown) => ({ read: () => ({ disable }) });
const land = (steps: ReturnType<typeof restorePlan>["steps"], start: unknown) => steps.reduce((held, step) => step.restoreTo ?? held, { disable: start } as Record<string, unknown>);

describe("quest rewards share one chronological undo with checkpoint effects", () => {
  test("interleaved checkpoint and quest writes on one target undo newest first and land where the chat started", () => {
    const rows = [row(true, false, 4), row(false, true, 6, quest("debt", 6)), row(true, false, 8), row(false, true, 10, quest("bell", 10))];
    const plan = restorePlan(rowsAfter(rows, 4), holding(true));
    expect(plan.refused).toEqual([]);
    expect(plan.steps.map((step) => step.row.messageId)).toEqual([10, 8, 6, 4]);
    expect(land(plan.steps, true)).toEqual({ disable: true });
  });

  test("a cut between the writes undoes only what came after it, across origins", () => {
    const rows = [row(true, false, 4), row(false, true, 6, quest("debt", 6)), row(true, false, 8)];
    const plan = restorePlan(rowsAfter(rows, 6), holding(false));
    expect(plan.steps.map((step) => step.row.messageId)).toEqual([8, 6]);
    expect(land(plan.steps, false)).toEqual({ disable: false });
  });

  test("negative control: undoing only the quest origin on that target is refused, not guessed", () => {
    const rows = [row(true, false, 4), row(false, true, 6, quest("debt", 6)), row(true, false, 8)];
    const questOnly = rowsAfter(rows, 4).filter((entry) => entry.origin?.kind === "quest");
    const plan = restorePlan(questOnly, holding(false));
    expect(plan.steps).toEqual([]);
    expect(plan.refused.map((entry) => entry.status)).toEqual(["externally-changed"]);
  });

  test("an external edit after the reward is left alone", () => {
    const plan = restorePlan([row(true, false, 6, quest("debt", 6))], holding("by hand"));
    expect(plan.steps).toEqual([]);
    expect(plan.refused[0]).toMatchObject({ status: "externally-changed", found: { disable: "by hand" } });
  });

  test("compaction never merges a quest write into a checkpoint write on the same message", () => {
    const rows = compactLedger([row(true, false, 6), row(false, true, 6, quest("debt", 6))]);
    expect(rows).toHaveLength(2);
    expect(rows[1].origin).toEqual(quest("debt", 6));
  });

  test("compaction still merges a chain from one origin", () => {
    const rows = compactLedger([row(true, false, 6, quest("debt", 6)), row(false, "mid", 6, quest("debt", 6))]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ before: { disable: true }, after: { disable: "mid" }, origin: quest("debt", 6) });
  });

  test("a reopened chat keeps every row's origin", () => {
    const ledger = [row(true, false, 4), row(false, true, 6, quest("debt", 6))];
    const effects = sanitizeEffects({ effects: { ledger, cast: [] } } as unknown as RuntimeExtras);
    expect(effects.ledger.map((entry) => entry.origin ?? null)).toEqual([null, quest("debt", 6)]);
  });

  test("a failed save leaves the reward's row pending, and reconcile decides it on reopen like any other", () => {
    const pending = { ...row(true, false, 6, quest("debt", 6)), status: "pending" as const };
    const effects = sanitizeEffects({ effects: { ledger: [pending], cast: [] } } as unknown as RuntimeExtras);
    expect(effects.ledger[0]).toMatchObject({ status: "pending", origin: quest("debt", 6) });
  });
});
