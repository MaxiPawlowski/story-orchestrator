import type { NormalizedStoryV2 } from "@engine/index";
import {
  CURATOR_OP_REVERTED, hiddenTitleRefusal, keepStamps, stampCreated, type CreatedStampOwner,
  isCreateOp, newEntriesText, isCuratorWritable, isNoteOp, noWriteAheads, pendingWriteAheads, previewCuratorOp, protectedRefusal, settleWriteAheads,
  type CreatedEntry, type CuratorOpRecord, type CuratorProposalRecord, type WiCuratorOp, type WriteAheadCounts, type WriteAheadLive,
} from "@stagecraft/index";
import { lorebookFileId } from "@utils/string";
import type { CuratorWiHost, WIEntryTarget } from "./hostPorts";
import { beginRun, type RunGuard, type RunOwnership } from "./runToken";
import type { StagecraftRuntimeState } from "./types";

const RETAINED_OP_STATUSES = new Set(["applied", "revert-failed", "externally-edited"]);
const OPEN_OP_STATUSES = new Set(["pending", "accepted"]);

// An op is reverted by the entry uid it recorded, so a rename after the write does not lose the
// entry. An op recorded without one is never name-addressed: it is refused.
const uidTarget = (entry: CuratorOpRecord): WIEntryTarget | null =>
  entry.target?.uid !== undefined ? { lorebookFileId: entry.target.lorebookFileId, uid: entry.target.uid } : null;

const reopened = (entry: CuratorOpRecord): CuratorOpRecord => ({
  op: entry.op, status: "pending", message: CURATOR_OP_REVERTED,
  ...(entry.before ? { before: entry.before } : {}), ...(entry.fuzzy ? { fuzzy: entry.fuzzy } : {}),
  ...(entry.nearDups ? { nearDups: entry.nearDups } : {}), ...(entry.created ? { created: entry.created } : {}),
});

const scopeRefusal = (story: NormalizedStoryV2, op: WiCuratorOp): string =>
  hiddenTitleRefusal(story, op.lorebook, op.comment) ?? `"${op.lorebook}" is not on this story's stagecraft allowlist`;

const sameKeys = (left: string[], right: string[]) => left.length === right.length && left.every((key, index) => key === right[index]);

export const createdEntryOf = (record: CuratorProposalRecord, entry: CuratorOpRecord, at: string): CreatedEntry | null =>
  isCreateOp(entry.op) && entry.status === "applied" && entry.target?.uid !== undefined
    ? {
        lorebook: entry.op.lorebook, lorebookFileId: entry.target.lorebookFileId, uid: entry.target.uid, comment: entry.op.comment,
        proposalId: record.id, messageId: entry.writeAhead?.messageId ?? record.messageId, at,
      }
    : null;

export interface CuratorWriterDeps {
  getStory: () => NormalizedStoryV2 | null;
  state: () => StagecraftRuntimeState;
  patch: (next: Partial<StagecraftRuntimeState>) => void;
  updateOps: (id: string, update: (record: CuratorProposalRecord) => CuratorProposalRecord) => void;
  save: () => Promise<void>;
  journal: (summary: string) => void;
  ownership: () => RunOwnership;
  host: () => CuratorWiHost;
  owner?: () => CreatedStampOwner | null;
}

export class CuratorWriter {
  constructor(private readonly deps: CuratorWriterDeps) {}

  // The record is a tiny WAL. Persist it before a host write, then the applied row after: a crash in
  // between leaves a pending row with before/after, not an unrecorded file mutation.
  async markWriteAhead(proposalId: string, index: number, entry: CuratorOpRecord) {
    this.deps.updateOps(proposalId, (record) => ({ ...record, ops: record.ops.map((item, at) => at === index ? entry : item) }));
    await this.deps.save();
  }

  // A lapse returns before the next write and records nothing: after a switch, the state and the
  // save both resolve to the chat that replaced this one.
  async writeOp(
    story: NormalizedStoryV2, entry: CuratorOpRecord, run: RunGuard, messageId: number, beforeHostWrite: (pending: CuratorOpRecord) => Promise<void>,
  ): Promise<{ ok: boolean; record: CuratorOpRecord; lapsed?: true }> {
    const op = entry.op;
    if (isNoteOp(op)) return { ok: false, record: entry };
    if (!isCuratorWritable(story, op.lorebook, op.comment)) return { ok: false, record: { ...entry, status: "failed", message: scopeRefusal(story, op) } };
    if (isCreateOp(op)) return this.writeCreate(entry, run, messageId, beforeHostWrite);
    // The before-image is read at the write edge. by uid, and
    // an entry that is gone is a failed op, never a created one.
    const fileId = lorebookFileId(op.lorebook);
    const host = this.deps.host();
    const live = op.uid !== undefined ? await host.readWIEntryAt({ lorebookFileId: fileId, uid: op.uid }) : await host.readWIEntry(op.lorebook, op.comment);
    if (run.lapsed()) return { ok: false, record: entry, lapsed: true };
    const uid = op.uid ?? live?.uid;
    if (!live || uid === undefined) return { ok: false, record: { ...entry, status: "failed", message: `"${op.comment}" is no longer in ${op.lorebook}` } };
    const comment = "comment" in live && typeof live.comment === "string" ? live.comment : op.comment;
    if (!isCuratorWritable(story, op.lorebook, comment)) return { ok: false, record: { ...entry, status: "failed", message: `"${op.comment}" is now "${comment}", which the curator may not write` } };
    const preview = previewCuratorOp(op, { lorebook: op.lorebook, comment: op.comment, keys: live.keys, content: live.content, disabled: live.disabled, uid });
    if (!preview.ok) return { ok: false, record: { ...entry, status: "failed", message: preview.message } };
    const refused = protectedRefusal(op, live.content);
    if (refused) return { ok: false, record: { ...entry, status: "failed", message: refused } };
    const before = { content: live.content, disabled: live.disabled, uid };
    const flip = op.kind === "enable" || op.kind === "disable";
    const after = flip ? { content: before.content, disabled: op.kind === "disable" } : { content: keepStamps(live.content, preview.content ?? ""), disabled: before.disabled };
    const pending: CuratorOpRecord = { ...entry, before, after, target: { lorebookFileId: fileId, uid }, writeAhead: { status: "pending", at: new Date().toISOString(), messageId } };
    await beforeHostWrite(pending);
    if (run.lapsed()) return { ok: false, record: pending, lapsed: true };
    try {
      const written = await host.updateWIEntryByUid({ lorebookFileId: fileId, uid }, after);
      if (!written.ok) return { ok: false, record: { ...pending, status: "failed", message: written.reason, writeAhead: undefined } };
      return { ok: true, record: { ...pending, status: "applied", message: preview.message, writeAhead: undefined } };
    } catch (error) {
      return { ok: false, record: { ...pending, status: "failed", message: error instanceof Error ? error.message : "write failed", writeAhead: undefined } };
    }
  }

  private async writeCreate(
    entry: CuratorOpRecord, run: RunGuard, messageId: number, beforeHostWrite: (pending: CuratorOpRecord) => Promise<void>,
  ): Promise<{ ok: boolean; record: CuratorOpRecord; lapsed?: true }> {
    const op = entry.op;
    if (!isCreateOp(op)) return { ok: false, record: entry };
    const preview = previewCuratorOp(op, undefined);
    if (!preview.ok) return { ok: false, record: { ...entry, status: "failed", message: preview.message } };
    const marked = protectedRefusal(op, "");
    if (marked) return { ok: false, record: { ...entry, status: "failed", message: marked } };
    const host = this.deps.host();
    const existing = await host.readWIEntry(op.lorebook, op.comment);
    if (run.lapsed()) return { ok: false, record: entry, lapsed: true };
    if (existing) return { ok: false, record: { ...entry, status: "failed", message: `"${op.comment}" already exists in ${op.lorebook}; a new entry never edits one` } };
    const after = { content: stampCreated(op.text, this.deps.owner?.() ?? null), disabled: false };
    const writeAhead = { status: "pending" as const, at: new Date().toISOString(), messageId };
    const pending: CuratorOpRecord = { ...entry, after, created: { keys: [...op.keys] }, target: { lorebookFileId: lorebookFileId(op.lorebook) }, writeAhead };
    await beforeHostWrite(pending);
    if (run.lapsed()) return { ok: false, record: pending, lapsed: true };
    try {
      const written = await host.createWIEntry(op.lorebook, { comment: op.comment, keys: op.keys, content: after.content });
      if (!written.ok) return { ok: false, record: { ...pending, status: "failed", message: written.reason, writeAhead: undefined } };
      return { ok: true, record: { ...pending, status: "applied", message: preview.message, target: { lorebookFileId: written.lorebookFileId, uid: written.uid }, writeAhead: undefined } };
    } catch (error) {
      return { ok: false, record: { ...pending, status: "failed", message: error instanceof Error ? error.message : "write failed", writeAhead: undefined } };
    }
  }

  private async readPending(entry: CuratorOpRecord): Promise<WriteAheadLive | null> {
    const op = entry.op;
    if (isCreateOp(op)) {
      const live = await this.deps.host().readWIEntry(op.lorebook, op.comment);
      return live ? { content: live.content, disabled: live.disabled, ...(live.uid !== undefined ? { uid: live.uid } : {}) } : null;
    }
    const at = uidTarget(entry);
    return at ? this.deps.host().readWIEntryAt(at) : null;
  }

  async reconcileWriteAhead(): Promise<WriteAheadCounts> {
    const pending = pendingWriteAheads(this.deps.state().proposals);
    if (!pending.length) return noWriteAheads();
    const run = beginRun(this.deps.ownership());
    const live = new Map<string, WriteAheadLive | null>();
    for (const { key, entry } of pending) {
      live.set(key, await this.readPending(entry));
      if (run.lapsed()) return noWriteAheads();
    }
    const now = new Date().toISOString();
    const { proposals, counts } = settleWriteAheads(this.deps.state().proposals, live, now);
    const before = new Set(this.deps.state().proposals.flatMap((record) => record.ops.filter((entry) => entry.status === "applied")));
    const landed = proposals.flatMap((record) => record.ops.filter((entry) => !before.has(entry)).map((entry) => createdEntryOf(record, entry, now)))
      .filter((row): row is CreatedEntry => row !== null);
    this.deps.patch({ proposals, ...(landed.length ? { created: [...(this.deps.state().created ?? []), ...landed] } : {}) });
    this.deps.journal(`World Info curator writes reconciled on reload: ${counts.applied} landed, ${counts.retry} to rewrite, ${counts.left} left alone`);
    return counts;
  }

  // A rollback undoes the story; a curator write made after that point has to go with it. The
  // pre-write content is recorded on the op, so putting it back needs no history of its own.
  async revertAppliedSince(messageId: number, withdrawn: number): Promise<number> {
    const story = this.deps.getStory();
    const run = beginRun(this.deps.ownership());
    // NEWEST RECORD FIRST, and within a record newest op first, so two writes to
    // one entry walk back through their own chain: Original -> First -> Second reverts to Original,
    // not to the intermediate text the older record happens to hold.
    const orphaned = this.withdrawOrphaned(messageId);
    const affected = this.deps.state().proposals.filter((record) => record.curator !== "warden" && record.appliedAt && record.messageId >= messageId).reverse();
    if (!story || !affected.length) {
      if (withdrawn || orphaned) await this.deps.save();
      return 0;
    }
    let reverted = 0;
    let reviewed = 0;
    const deleted = new Set<string>();
    const settled = new Set<string>();
    const updates: Array<{ id: string; ops: CuratorOpRecord[]; source?: number }> = [];
    for (const record of affected) {
      const source = record.provenance?.messageId;
      const kept = source !== undefined && source < messageId;
      const ops: CuratorOpRecord[] = [];
      for (const entry of [...record.ops].reverse()) {
        if (run.lapsed()) { ops.unshift(entry); continue; }
        if (isNoteOp(entry.op) || entry.status !== "applied" || (!entry.before && !isCreateOp(entry.op)) || !isCuratorWritable(story, entry.op.lorebook, entry.op.comment)) {
          ops.unshift(entry);
          continue;
        }
        if (isCreateOp(entry.op)) {
          const step = await this.revertCreateStep(entry, run, kept);
          ops.unshift(...step.ops);
          reverted += step.reverted;
          reviewed += step.reviewed;
          step.deleted.forEach((key) => deleted.add(key));
          continue;
        }
        // Compare-and-set: the entry has to still hold what this op wrote. If it does not, someone
        // else edited the book after us and putting our before-image back would silently undo them.
        const at = uidTarget(entry);
        if (!at) { ops.unshift({ ...entry, status: "revert-failed", message: `"${entry.op.comment}" was recorded without a uid; not reverted` }); continue; }
        const current = await this.deps.host().readWIEntryAt(at);
        if (run.lapsed()) { ops.unshift(entry); continue; }
        if (current?.comment !== undefined && current.comment !== entry.op.comment && !isCuratorWritable(story, entry.op.lorebook, current.comment)) {
          ops.unshift({ ...entry, status: "externally-edited", message: `"${entry.op.comment}" is now "${current.comment}", which the curator may not write, so it was left alone` });
          continue;
        }
        if (current && entry.after && (current.content !== entry.after.content || current.disabled !== entry.after.disabled)) {
          ops.unshift({ ...entry, status: "externally-edited", message: `"${entry.op.comment}" changed after this write, so it was left alone` });
          continue;
        }
        const restored = await this.restoreBefore(entry, at);
        if (restored) reverted += 1;
        if (restored && kept) {
          reviewed += 1;
          ops.unshift(reopened(entry));
        }
        if (!restored) ops.unshift({ ...entry, status: "revert-failed", message: `could not restore "${entry.op.comment}"; the entry it would restore is kept for a retry` });
      }
      const retained = ops.some((entry) => RETAINED_OP_STATUSES.has(entry.status));
      if (!kept && !retained) settled.add(record.id);
      updates.push({ id: record.id, ops, ...(kept && !retained ? { source } : {}) });
    }
    if (run.lapsed()) return reverted;
    const byId = new Map(updates.map((update) => [update.id, update]));
    if (deleted.size) this.deps.patch({ created: (this.deps.state().created ?? []).filter((row) => !deleted.has(`${row.lorebookFileId}#${String(row.uid)}`)) });
    this.deps.patch({ proposals: this.deps.state().proposals.filter((record) => !settled.has(record.id)).map((record) => {
      const update = byId.get(record.id);
      if (!update) return record;
      return update.source === undefined ? { ...record, ops: update.ops } : { ...record, ops: update.ops, messageId: update.source, appliedAt: undefined };
    }) });
    const removed = deleted.size ? `, ${newEntriesText(deleted.size)} deleted` : "";
    if (reverted) this.deps.journal(`World Info curator changes rolled back (${reverted})${removed}${reviewed ? `; ${reviewed} back to review` : ""}`);
    await this.deps.save();
    return reverted;
  }

  private async revertCreateStep(entry: CuratorOpRecord, run: RunGuard, kept: boolean): Promise<{ ops: CuratorOpRecord[]; reverted: number; reviewed: number; deleted: string[] }> {
    const undone = await this.revertCreate(entry, run);
    if (undone === "lapsed") return { ops: [entry], reverted: 0, reviewed: 0, deleted: [] };
    if (undone !== "deleted") return { ops: [undone], reverted: 0, reviewed: 0, deleted: [] };
    const key = entry.target?.uid !== undefined ? [`${entry.target.lorebookFileId}#${String(entry.target.uid)}`] : [];
    return { ops: kept ? [reopened(entry)] : [], reverted: 1, reviewed: kept ? 1 : 0, deleted: key };
  }

  private async revertCreate(entry: CuratorOpRecord, run: RunGuard): Promise<CuratorOpRecord | "deleted" | "lapsed"> {
    const op = entry.op;
    if (!isCreateOp(op)) return entry;
    const at = uidTarget(entry);
    if (!at) return { ...entry, status: "revert-failed", message: `"${op.comment}" was recorded without a uid; not deleted` };
    const current = await this.deps.host().readWIEntryAt(at);
    if (run.lapsed()) return "lapsed";
    if (!current) return "deleted";
    const keys = entry.created?.keys ?? op.keys;
    const untouched = current.comment === op.comment && current.content === entry.after?.content && current.disabled === entry.after?.disabled && sameKeys(current.keys, keys);
    if (!untouched) return { ...entry, status: "externally-edited", message: `"${op.comment}" changed after it was created, so the rollback kept it` };
    try {
      const removed = await this.deps.host().deleteWIEntryAt(at);
      return removed.ok ? "deleted" : { ...entry, status: "revert-failed", message: `could not delete "${op.comment}": ${removed.reason}` };
    } catch (error) {
      return { ...entry, status: "revert-failed", message: `could not delete "${op.comment}": ${error instanceof Error ? error.message : "the host refused"}` };
    }
  }

  private withdrawOrphaned(messageId: number): number {
    let withdrawn = 0;
    const proposals = this.deps.state().proposals.filter((record) => {
      if (record.curator === "warden" || record.appliedAt || (record.provenance?.messageId ?? record.messageId) < messageId) return true;
      withdrawn += record.ops.filter((entry) => OPEN_OP_STATUSES.has(entry.status)).length;
      return false;
    });
    const removed = this.deps.state().proposals.length - proposals.length;
    if (!removed) return 0;
    this.deps.patch({ proposals });
    if (withdrawn) this.deps.journal(`World Info curator proposal withdrawn (${withdrawn} change(s)): the reply it was read from was changed or removed`);
    return removed;
  }

  // One inverse host call, checked. `false` means the host refused or could not find the entry;
  // the caller keeps the record and its before-image rather than reporting a revert that did not
  // happen.
  private async restoreBefore(entry: CuratorOpRecord, at: WIEntryTarget): Promise<boolean> {
    if (!entry.before || isNoteOp(entry.op)) return false;
    try {
      return (await this.deps.host().restoreWIEntryAt(at, entry.before)).ok;
    } catch {
      return false;
    }
  }
}
