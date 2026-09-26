import type { NormalizedStoryV2 } from "@engine/index";
import {
  isCheckpointGated, isCuratorWritable, isNoteOp, noWriteAheads, pendingWriteAheads, previewCuratorOp, settleWriteAheads,
  type CuratorOpRecord, type CuratorProposalRecord, type WiCuratorOp, type WriteAheadCounts, type WriteAheadLive,
} from "@stagecraft/index";
import { lorebookFileId } from "@utils/string";
import type { CuratorWiHost, WIEntryTarget } from "./hostPorts";
import { beginRun, type RunGuard, type RunOwnership } from "./runToken";
import type { StagecraftRuntimeState } from "./types";

const RETAINED_OP_STATUSES = new Set(["applied", "revert-failed", "externally-edited"]);

// An op is reverted by the entry uid it recorded, so a rename after the write does not lose the
// entry. An op recorded without one is never name-addressed: it is refused.
const uidTarget = (entry: CuratorOpRecord): WIEntryTarget | null =>
  entry.target?.uid !== undefined ? { lorebookFileId: entry.target.lorebookFileId, uid: entry.target.uid } : null;

export interface CuratorWriterDeps {
  getStory: () => NormalizedStoryV2 | null;
  state: () => StagecraftRuntimeState;
  patch: (next: Partial<StagecraftRuntimeState>) => void;
  updateOps: (id: string, update: (record: CuratorProposalRecord) => CuratorProposalRecord) => void;
  save: () => Promise<void>;
  journal: (summary: string) => void;
  ownership: () => RunOwnership;
  host: () => CuratorWiHost;
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
    guard?: (op: WiCuratorOp, content: string) => string | null,
  ): Promise<{ ok: boolean; record: CuratorOpRecord; lapsed?: true }> {
    const op = entry.op;
    if (isNoteOp(op)) return { ok: false, record: entry };
    if (!isCuratorWritable(story, op.lorebook, op.comment)) {
      const message = isCheckpointGated(story, op.lorebook, op.comment)
        ? `"${op.comment}" is switched by checkpoint effects, which alone decide it`
        : `"${op.lorebook}" is not on this story's stagecraft allowlist`;
      return { ok: false, record: { ...entry, status: "failed", message } };
    }
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
    const refused = guard?.(op, live.content) ?? null;
    if (refused) return { ok: false, record: { ...entry, status: "failed", message: refused } };
    const before = { content: live.content, disabled: live.disabled, uid };
    const after = op.kind === "enable" || op.kind === "disable" ? { content: before.content, disabled: op.kind === "disable" } : { content: preview.content ?? "", disabled: before.disabled };
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

  async reconcileWriteAhead(): Promise<WriteAheadCounts> {
    const pending = pendingWriteAheads(this.deps.state().proposals);
    if (!pending.length) return noWriteAheads();
    const run = beginRun(this.deps.ownership());
    const live = new Map<string, WriteAheadLive | null>();
    for (const { key, entry } of pending) {
      const at = uidTarget(entry);
      live.set(key, at ? await this.deps.host().readWIEntryAt(at) : null);
      if (run.lapsed()) return noWriteAheads();
    }
    const { proposals, counts } = settleWriteAheads(this.deps.state().proposals, live, new Date().toISOString());
    this.deps.patch({ proposals });
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
    const affected = this.deps.state().proposals.filter((record) => record.curator !== "warden" && record.appliedAt && record.messageId >= messageId).reverse();
    if (!story || !affected.length) {
      if (withdrawn) await this.deps.save();
      return 0;
    }
    let reverted = 0;
    const settled = new Set<string>();
    const updates: Array<{ id: string; ops: CuratorOpRecord[] }> = [];
    for (const record of affected) {
      const ops: CuratorOpRecord[] = [];
      for (const entry of [...record.ops].reverse()) {
        if (run.lapsed()) { ops.unshift(entry); continue; }
        if (isNoteOp(entry.op) || entry.status !== "applied" || !entry.before || !isCuratorWritable(story, entry.op.lorebook, entry.op.comment)) {
          ops.unshift(entry);
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
        else ops.unshift({ ...entry, status: "revert-failed", message: `could not restore "${entry.op.comment}"; the entry it would restore is kept for a retry` });
      }
      if (!ops.some((kept) => RETAINED_OP_STATUSES.has(kept.status))) settled.add(record.id);
      updates.push({ id: record.id, ops });
    }
    if (run.lapsed()) return reverted;
    const byId = new Map(updates.map((update) => [update.id, update.ops]));
    this.deps.patch({ proposals: this.deps.state().proposals.filter((record) => !settled.has(record.id)).map((record) => {
      const ops = byId.get(record.id);
      return ops ? { ...record, ops } : record;
    }) });
    if (reverted) this.deps.journal(`World Info curator changes rolled back (${reverted})`);
    await this.deps.save();
    return reverted;
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
