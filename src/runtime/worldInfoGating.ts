import type { WriteResult } from "@utils/writeResult";
import { beginRun, type RunOwnership } from "./runToken";
import type { ScanGateRow } from "./scanGatePlan";
import type { WorldInfoSettings } from "./settingsStore";
import { gatedIndex, ledgerCounts, restorePlan, verifyLedger, type RestoreBook, type BookEntries, type GatedEntryRef, type LedgerVerdict } from "./worldInfoLedger";
import type { WiGatingStatus } from "./worldInfoMode";
import { normalizeGatedEntries, type NormalizeOutcome } from "./worldInfoNormalize";

// v2.5 plan 01 A/B/C, host-free. The author's confirm is the switch to scan mode (Q2), and the only way
// the first lorebook write can happen: a sync in file mode writes nothing. In scan mode it verifies the
// ledger, normalises, and only then activates the scan view (W2), so a scan before that runs the file
// path. A mode change takes effect at the next sync, which every settings write triggers: no reload.
// Its writes are install-wide (lorebook files, the ledger, the mode), so its run is the gating's own
// lifetime, not a chat: a chat switch mid-normalisation must not leave half a gated set behind.
export type CapabilityReading = { state: "present" | "absent" | "error"; detail: string };

export interface NormalizePreviewBook {
  lorebook: string;
  entries: number;
}

type EntryWrite = (lorebook: string, comments: string[]) => Promise<WriteResult<{ changed: boolean; confirmed?: boolean }>>;

export interface WiGatingDeps {
  settings: () => WorldInfoSettings;
  write: (patch: Partial<WorldInfoSettings>) => void;
  library: () => unknown[];
  read: (lorebook: string) => Promise<BookEntries | null>;
  disable: EntryWrite;
  enable: EntryWrite;
  handler: { install: () => void; probe: () => Promise<CapabilityReading>; dispose: () => void };
  setActive: (active: boolean) => void;
  replayFilePath: () => Promise<void>;
  confirm: (preview: NormalizePreviewBook[]) => Promise<boolean>;
  toast: (text: string) => void;
  journal: (summary: string, note: string) => void;
  publish: (status: WiGatingStatus) => void;
}

export interface WiGating {
  sync: () => Promise<void>;
  requestScan: () => Promise<boolean>;
  requestFile: () => Promise<void>;
  renormalize: () => Promise<NormalizeOutcome | null>;
  noteScan: (owner: "story" | "no-story", rows: ScanGateRow[]) => void;
  restorable: (removed: unknown) => RestoreBook[];
  restore: (removed: unknown) => Promise<{ restored: GatedEntryRef[]; refused: string[] }>;
  status: () => WiGatingStatus;
  active: () => boolean;
  dispose: () => void;
}

const refKey = (ref: GatedEntryRef) => `${ref.lorebook.toLowerCase()}|${ref.comment}`;
const refText = (refs: GatedEntryRef[]) => refs.map((ref) => `${ref.lorebook}: ${ref.comment}`).join("; ");
const restingIn = (ledger: Record<string, string[]>, verdict: LedgerVerdict) => {
  const held = new Set(Object.entries(ledger).flatMap(([lorebook, comments]) => comments.map((comment) => refKey({ lorebook, comment }))));
  const drifting = new Set(verdict.drift.map(refKey));
  return (ref: GatedEntryRef) => held.has(refKey(ref)) && !drifting.has(refKey(ref));
};
const flippedRefs = (flipped: Record<string, string[]>): GatedEntryRef[] => Object.entries(flipped).flatMap(([lorebook, comments]) => comments.map((comment) => ({ lorebook, comment })));

export function createWiGating(deps: WiGatingDeps): WiGating {
  let installed = false;
  let active = false;
  let disposed = false;
  let busy = false;
  let capability: CapabilityReading | null = null;
  let verdict: LedgerVerdict = { drift: [], missing: [], unreadable: [] };
  let missingKey: GatedEntryRef[] = [];
  const journaledDrift = new Set<string>();
  const journaledMissing = new Set<string>();
  let chain: Promise<unknown> = Promise.resolve();
  let generation = 0;
  const lifetime: RunOwnership = {
    mint: () => ({ chatId: null, storyId: null, playedVersion: null, sessionEpoch: generation, window: null, windowRevision: 0 }),
    check: (token) => (!disposed && token.sessionEpoch === generation ? { ok: true } : { ok: false, reason: "epoch", detail: "the lorebook gating stopped" }),
  };

  const status = (): WiGatingStatus => ({
    mode: deps.settings().gatingMode,
    active,
    capability,
    ledger: ledgerCounts(deps.settings().normalized),
    drift: verdict.drift,
    missingKey,
    missing: verdict.missing,
    unreadable: verdict.unreadable,
    busy,
  });
  const publish = () => deps.publish(status());
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = chain.then(async () => {
      busy = true;
      publish();
      try {
        return await work();
      } finally {
        busy = false;
        publish();
      }
    });
    chain = next.catch(() => undefined);
    return next;
  };

  const verify = async () => {
    const run = beginRun(lifetime);
    const read = await verifyLedger(deps.settings().normalized, gatedIndex(deps.library()), deps.read);
    if (!run.stillOwns()) return;
    verdict = read;
    const drifting = new Set(verdict.drift.map(refKey));
    [...journaledDrift].filter((key) => !drifting.has(key)).forEach((key) => journaledDrift.delete(key));
    const fresh = verdict.drift.filter((ref) => !journaledDrift.has(refKey(ref)));
    fresh.forEach((ref) => journaledDrift.add(refKey(ref)));
    if (fresh.length) deps.journal("story lorebook entry switched on outside the story", refText(fresh));
  };

  const normalize = async (phase: "initial" | "growth" | "repair", recheck?: Set<string>): Promise<NormalizeOutcome | null> => {
    if (deps.settings().gatingMode !== "scan") return null;
    const run = beginRun(lifetime);
    const { normalized, normalizedFrom } = deps.settings();
    const outcome = await normalizeGatedEntries(deps.library(), { ledger: normalized, from: normalizedFrom }, {
      read: deps.read,
      disable: deps.disable,
      ownership: lifetime,
      ...(recheck ? { recheck: (lorebook: string, comment: string) => recheck.has(refKey({ lorebook, comment })) } : {}),
    });
    if (outcome.refused.length) deps.journal("lorebook normalisation refused", outcome.refused.join("; "));
    if (!run.stillOwns()) return outcome;
    if (outcome.changed) deps.write({ normalized: outcome.ledger, normalizedFrom: outcome.from });
    const flipped = flippedRefs(outcome.flipped);
    if (flipped.length) {
      deps.journal("lorebook entries now rest off", refText(flipped));
      if (phase === "growth") deps.toast(`Story lorebook entries now rest off: ${refText(flipped)}`);
    }
    return outcome;
  };

  const deactivate = async () => {
    active = false;
    deps.setActive(false);
    if (installed) deps.handler.dispose();
    installed = false;
    capability = null;
    verdict = { drift: [], missing: [], unreadable: [] };
    missingKey = [];
    await deps.replayFilePath();
  };

  const syncOnce = async () => {
    if (disposed) return;
    if (deps.settings().gatingMode !== "scan") {
      if (installed || active) await deactivate();
      return;
    }
    const run = beginRun(lifetime);
    if (!installed) {
      deps.handler.install();
      installed = true;
      const reading = await deps.handler.probe();
      if (!run.stillOwns()) return;
      capability = reading;
    }
    if (capability?.state !== "present") return;
    await verify();
    await normalize(active ? "growth" : "initial");
    if (!run.stillOwns() || deps.settings().gatingMode !== "scan" || active) return;
    active = true;
    deps.setActive(true);
  };

  const sync = () => serial(syncOnce);

  const requestScan = async (): Promise<boolean> => {
    const index = gatedIndex(deps.library());
    const preview: NormalizePreviewBook[] = [];
    for (const { lorebook, comments } of index.values()) {
      const entries = await deps.read(lorebook);
      if (!entries) continue;
      const count = [...comments].filter((comment) => entries.has(comment)).length;
      if (count) preview.push({ lorebook, entries: count });
    }
    const run = beginRun(lifetime);
    if (!(await deps.confirm(preview)) || !run.stillOwns()) return false;
    if (deps.settings().gatingMode !== "scan") deps.write({ gatingMode: "scan" });
    await sync();
    return active;
  };

  const requestFile = async () => {
    deps.write({ gatingMode: "file" });
    await sync();
  };

  const renormalize = () => serial(async () => {
    if (deps.settings().gatingMode !== "scan" || !active) return null;
    const run = beginRun(lifetime);
    const recheck = new Set([...verdict.drift, ...missingKey].map(refKey));
    const outcome = await normalize("repair", recheck);
    if (!run.stillOwns()) return outcome;
    await verify();
    const rests = restingIn(deps.settings().normalized, verdict);
    missingKey = missingKey.filter((ref) => !rests(ref));
    [...journaledMissing].filter((key) => !missingKey.some((ref) => refKey(ref) === key)).forEach((key) => journaledMissing.delete(key));
    return outcome;
  });

  const idOf = (story: unknown) => (story && typeof story === "object" ? (story as { id?: unknown }).id : undefined);
  const restorable = (removed: unknown) => {
    const remaining = deps.library().filter((story) => idOf(removed) === undefined || idOf(story) !== idOf(removed));
    return restorePlan(removed, remaining, deps.settings().normalized, deps.settings().normalizedFrom);
  };

  // Never automatic: the removal dialog's own choice. Each confirmed enable leaves the ledger, because the entry
  // no longer rests off.
  const restore = (removed: unknown) => serial(async () => {
    const run = beginRun(lifetime);
    const outcome = { restored: [] as GatedEntryRef[], refused: [] as string[] };
    for (const book of restorable(removed)) {
      if (!run.stillOwns()) break;
      const result = await deps.enable(book.lorebook, book.comments);
      if (!result.ok) {
        outcome.refused.push(result.reason);
        continue;
      }
      if (result.confirmed === false || !run.stillOwns()) continue;
      const { normalized, normalizedFrom } = deps.settings();
      const drop = new Set(book.comments);
      const strip = <T>(records: Record<string, T[]>, comment: (row: T) => string) => Object.fromEntries(Object.entries(records)
        .map(([name, rows]): [string, T[]] => [name, name.toLowerCase() === book.lorebook.toLowerCase() ? rows.filter((row) => !drop.has(comment(row))) : rows])
        .filter(([, rows]) => rows.length > 0));
      deps.write({ normalized: strip(normalized, (row) => row), normalizedFrom: strip(normalizedFrom, (row) => row.comment) });
      outcome.restored.push(...book.comments.map((comment) => ({ lorebook: book.lorebook, comment })));
    }
    if (outcome.restored.length) deps.journal("lorebook entries restored", refText(outcome.restored));
    if (outcome.refused.length) deps.journal("lorebook restore refused", outcome.refused.join("; "));
    return outcome;
  });

  const noteScan = (owner: "story" | "no-story", rows: ScanGateRow[]) => {
    if (owner !== "story") return;
    const found = rows.filter((row) => !row.on && row.fileDisabled === null).map((row) => ({ lorebook: row.lorebook, comment: row.comment }));
    const fresh = found.filter((ref) => !journaledMissing.has(refKey(ref)));
    if (!fresh.length) return;
    fresh.forEach((ref) => journaledMissing.add(refKey(ref)));
    missingKey = [...missingKey, ...fresh];
    deps.journal("story lorebook entry cannot be switched off", refText(fresh));
    publish();
  };

  return {
    sync,
    requestScan,
    requestFile,
    renormalize,
    noteScan,
    restorable,
    restore,
    status,
    active: () => active,
    dispose: () => {
      disposed = true;
      generation += 1;
      active = false;
      deps.setActive(false);
      if (installed) deps.handler.dispose();
      installed = false;
    },
  };
}
