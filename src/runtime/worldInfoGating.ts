import type { WriteResult } from "@utils/writeResult";
import { beginRun, type RunOwnership } from "./runToken";
import type { ScanGateRow } from "./scanGatePlan";
import type { WorldInfoSettings } from "./settingsStore";
import { gatedIndex, ledgerCounts, restorePlan, verifyLedger, type RestoreBook, type BookEntries, type GatedEntryRef, type LedgerVerdict } from "./worldInfoLedger";
import type { WiGatingStatus } from "./worldInfoMode";
import { normalizeGatedEntries, type NormalizeOutcome } from "./worldInfoNormalize";

// A/B/C, host-free. Scan mode is the default; a sync in file mode writes nothing. In scan mode it verifies the
// ledger, normalises, and only then activates the scan view (W2), so a scan before that runs the file
// path. A mode change takes effect at the next sync, which every settings write triggers: no reload.
// Its writes are install-wide (lorebook files, the ledger, the mode), so its run is the gating's own
// lifetime, not a chat: a chat switch mid-normalisation must not leave half a gated set behind, while
// stopping the runtime or leaving per-chat mode ends the run before its next write.
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
  settle: (settled: boolean) => void;
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

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const restingCount = (flipped: GatedEntryRef[]) => plural(flipped.length, "story lorebook entry now rests", "story lorebook entries now rest");
const bookCount = (flipped: GatedEntryRef[]) => plural(new Set(flipped.map((ref) => ref.lorebook.toLowerCase())).size, "lorebook", "lorebooks");

const refKey = (ref: GatedEntryRef) => `${ref.lorebook.toLowerCase()}|${ref.comment}`;
const refText = (refs: GatedEntryRef[]) => refs.map((ref) => `${ref.lorebook}: ${ref.comment}`).join("; ");
const restingIn = (ledger: Record<string, string[]>, verdict: LedgerVerdict) => {
  const held = new Set(Object.entries(ledger).flatMap(([lorebook, comments]) => comments.map((comment) => refKey({ lorebook, comment }))));
  const drifting = new Set(verdict.drift.map(refKey));
  return (ref: GatedEntryRef) => held.has(refKey(ref)) && !drifting.has(refKey(ref));
};
const flippedRefs = (flipped: Record<string, string[]>): GatedEntryRef[] => Object.entries(flipped).flatMap(([lorebook, comments]) => comments.map((comment) => ({ lorebook, comment })));

const idOf = (story: unknown) => (story && typeof story === "object" ? (story as { id?: unknown }).id : undefined);

const stripBook = (settings: WorldInfoSettings, book: RestoreBook): Partial<WorldInfoSettings> => {
  const drop = new Set(book.comments);
  const strip = <T>(records: Record<string, T[]>, comment: (row: T) => string) => Object.fromEntries(Object.entries(records)
    .map(([name, rows]): [string, T[]] => [name, name.toLowerCase() === book.lorebook.toLowerCase() ? rows.filter((row) => !drop.has(comment(row))) : rows])
    .filter(([, rows]) => rows.length > 0));
  return { normalized: strip(settings.normalized, (row) => row), normalizedFrom: strip(settings.normalizedFrom, (row) => row.comment) };
};

const previewOf = async (deps: WiGatingDeps): Promise<NormalizePreviewBook[]> => {
  const preview: NormalizePreviewBook[] = [];
  for (const { lorebook, comments } of gatedIndex(deps.library()).values()) {
    const entries = await deps.read(lorebook);
    if (!entries) continue;
    const count = [...comments].filter((comment) => entries.has(comment)).length;
    if (count) preview.push({ lorebook, entries: count });
  }
  return preview;
};

class WiGatingRuntime implements WiGating {
  private installed = false;
  private live = false;
  private disposed = false;
  private busy = false;
  private capability: CapabilityReading | null = null;
  private fellBack = false;
  private verdict: LedgerVerdict = { drift: [], missing: [], unreadable: [] };
  private missingKey: GatedEntryRef[] = [];
  private readonly journaledDrift = new Set<string>();
  private readonly journaledMissing = new Set<string>();
  private chain: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private readonly alive: RunOwnership;
  private readonly lifetime: RunOwnership;

  constructor(private readonly deps: WiGatingDeps) {
    const mint = () => ({ chatId: null, storyId: null, storyHash: null, sessionEpoch: this.generation, window: null, windowRevision: 0 });
    this.alive = {
      mint,
      check: (token) => (!this.disposed && token.sessionEpoch === this.generation ? { ok: true } : { ok: false, reason: "epoch", detail: "the lorebook gating stopped" }),
    };
    this.lifetime = {
      mint,
      check: (token) => (this.alive.check(token).ok && this.deps.settings().gatingMode === "scan"
        ? { ok: true }
        : { ok: false, reason: "epoch", detail: "the lorebook gating stopped or left per-chat mode" }),
    };
  }

  status = (): WiGatingStatus => ({
    mode: this.deps.settings().gatingMode,
    active: this.live,
    capability: this.capability,
    ledger: ledgerCounts(this.deps.settings().normalized),
    drift: this.verdict.drift,
    missingKey: this.missingKey,
    missing: this.verdict.missing,
    unreadable: this.verdict.unreadable,
    busy: this.busy,
  });

  active = () => this.live;

  private publish = () => this.deps.publish(this.status());

  private serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = this.chain.then(async () => {
      this.busy = true;
      this.publish();
      try {
        return await work();
      } finally {
        this.busy = false;
        this.publish();
      }
    });
    this.chain = next.catch(() => undefined);
    return next;
  };

  private verify = async () => {
    const run = beginRun(this.lifetime);
    const read = await verifyLedger(this.deps.settings().normalized, gatedIndex(this.deps.library()), this.deps.read);
    if (!run.stillOwns()) return;
    this.verdict = read;
    const drifting = new Set(this.verdict.drift.map(refKey));
    [...this.journaledDrift].filter((key) => !drifting.has(key)).forEach((key) => this.journaledDrift.delete(key));
    const fresh = this.verdict.drift.filter((ref) => !this.journaledDrift.has(refKey(ref)));
    fresh.forEach((ref) => this.journaledDrift.add(refKey(ref)));
    if (fresh.length) this.deps.journal("story lorebook entry switched on outside the story", refText(fresh));
  };

  private normalize = async (phase: "initial" | "growth" | "repair", recheck?: Set<string>): Promise<NormalizeOutcome | null> => {
    if (this.deps.settings().gatingMode !== "scan") return null;
    const run = beginRun(this.lifetime);
    const { normalized, normalizedFrom } = this.deps.settings();
    const outcome = await normalizeGatedEntries(this.deps.library(), { ledger: normalized, from: normalizedFrom }, {
      read: this.deps.read,
      disable: this.deps.disable,
      ownership: this.lifetime,
      ...(recheck ? { recheck: (lorebook: string, comment: string) => recheck.has(refKey({ lorebook, comment })) } : {}),
    });
    if (outcome.refused.length) this.deps.journal("lorebook normalisation refused", outcome.refused.join("; "));
    if (!run.stillOwns()) return outcome;
    if (outcome.changed) this.deps.write({ normalized: outcome.ledger, normalizedFrom: outcome.from });
    const flipped = flippedRefs(outcome.flipped);
    if (flipped.length) {
      this.deps.journal("lorebook entries now rest off", refText(flipped));
      if (phase !== "repair") this.deps.toast(`${restingCount(flipped)} off in ${bookCount(flipped)}; each chat switches on its own story's entries.`);
    }
    return outcome;
  };

  private fallBack = async () => {
    if (this.fellBack) return;
    this.fellBack = true;
    this.deps.settle(true);
    await this.deps.replayFilePath();
  };

  private deactivate = async () => {
    this.fellBack = false;
    this.deps.settle(false);
    this.live = false;
    this.deps.setActive(false);
    if (this.installed) this.deps.handler.dispose();
    this.installed = false;
    this.capability = null;
    this.verdict = { drift: [], missing: [], unreadable: [] };
    this.missingKey = [];
    await this.deps.replayFilePath();
  };

  private syncOnce = async () => {
    if (this.disposed) return;
    if (this.deps.settings().gatingMode !== "scan") {
      if (this.installed || this.live) await this.deactivate();
      return;
    }
    const run = beginRun(this.lifetime);
    if (!this.installed) {
      this.deps.handler.install();
      this.installed = true;
      const reading = await this.deps.handler.probe();
      if (!run.stillOwns()) return;
      this.capability = reading;
    }
    if (this.capability?.state !== "present") return this.fallBack();
    await this.verify();
    await this.normalize(this.live ? "growth" : "initial");
    if (!run.stillOwns() || this.deps.settings().gatingMode !== "scan" || this.live) return;
    this.live = true;
    this.deps.setActive(true);
  };

  sync = () => this.serial(async () => {
    try {
      await this.syncOnce();
    } catch (error) {
      this.deps.journal("lorebook gating failed", error instanceof Error ? error.message : String(error));
    }
  });

  requestScan = async (): Promise<boolean> => {
    const preview = await previewOf(this.deps);
    const run = beginRun(this.alive);
    if (!(await this.deps.confirm(preview)) || !run.stillOwns()) return false;
    this.deps.write({ gatingMode: "scan", gatingChosen: true });
    await this.sync();
    return this.live;
  };

  requestFile = async () => {
    this.deps.write({ gatingMode: "file", gatingChosen: true });
    await this.sync();
  };

  renormalize = () => this.serial(async () => {
    if (this.deps.settings().gatingMode !== "scan" || !this.live) return null;
    const run = beginRun(this.lifetime);
    const recheck = new Set([...this.verdict.drift, ...this.missingKey].map(refKey));
    const outcome = await this.normalize("repair", recheck);
    if (!run.stillOwns()) return outcome;
    await this.verify();
    const rests = restingIn(this.deps.settings().normalized, this.verdict);
    this.missingKey = this.missingKey.filter((ref) => !rests(ref));
    [...this.journaledMissing].filter((key) => !this.missingKey.some((ref) => refKey(ref) === key)).forEach((key) => this.journaledMissing.delete(key));
    return outcome;
  });

  restorable = (removed: unknown) => {
    const remaining = this.deps.library().filter((story) => idOf(removed) === undefined || idOf(story) !== idOf(removed));
    return restorePlan(removed, remaining, this.deps.settings().normalized, this.deps.settings().normalizedFrom);
  };

  // Never automatic: the removal dialog's own choice. Each confirmed enable leaves the ledger, because the entry
  // no longer rests off.
  restore = (removed: unknown) => this.serial(async () => {
    const run = beginRun(this.lifetime);
    const outcome = { restored: [] as GatedEntryRef[], refused: [] as string[] };
    for (const book of this.restorable(removed)) {
      if (!run.stillOwns()) break;
      const result = await this.deps.enable(book.lorebook, book.comments);
      if (!result.ok) {
        outcome.refused.push(result.reason);
        continue;
      }
      if (result.confirmed === false || !run.stillOwns()) continue;
      this.deps.write(stripBook(this.deps.settings(), book));
      outcome.restored.push(...book.comments.map((comment) => ({ lorebook: book.lorebook, comment })));
    }
    if (outcome.restored.length) this.deps.journal("lorebook entries restored", refText(outcome.restored));
    if (outcome.refused.length) this.deps.journal("lorebook restore refused", outcome.refused.join("; "));
    return outcome;
  });

  noteScan = (owner: "story" | "no-story", rows: ScanGateRow[]) => {
    if (owner !== "story") return;
    const found = rows.filter((row) => !row.on && row.fileDisabled === null).map((row) => ({ lorebook: row.lorebook, comment: row.comment }));
    const fresh = found.filter((ref) => !this.journaledMissing.has(refKey(ref)));
    if (!fresh.length) return;
    fresh.forEach((ref) => this.journaledMissing.add(refKey(ref)));
    this.missingKey = [...this.missingKey, ...fresh];
    this.deps.journal("story lorebook entry cannot be switched off", refText(fresh));
    this.publish();
  };

  dispose = () => {
    this.disposed = true;
    this.generation += 1;
    this.live = false;
    this.deps.setActive(false);
    if (this.installed) this.deps.handler.dispose();
    this.installed = false;
  };
}

export function createWiGating(deps: WiGatingDeps): WiGating {
  return new WiGatingRuntime(deps);
}
