import type { EngineState, NormalizedStoryV2 } from "@engine/index";
import { failureClass } from "@extraction/breaker";
import { callExtractionModel } from "@extraction/client";
import { maxTokensForInput } from "@extraction/callBudget";
import { cleanWindowMessage } from "@extraction/windowHygiene";
import {
  buildWiCuratorPrompt,
  curatorHasScope,
  curatorLorebooks,
  decidedOp,
  declinedOps,
  entriesForScope,
  isCheckpointGated,
  isCuratorWritable,
  isNoteOp,
  capProposalRing,
  parseCuratorResponse,
  planCuratorProposal,
  previewCuratorOp,
  type CuratorEntryView,
  type CuratorPassOutcome,
  type CuratorOp,
  type CuratorOpRecord,
  type CuratorOpStatus,
  type CuratorProposalRecord,
  type WardenNoteOp,
  anyWardenFamily,
  composeWardenNote,
  newestCarriedNote,
  wardenFlagJournal,
  wardenNoteJournal,
  wardenNoteOps,
  wardenReason,
  wardenSummary,
  withdrawRemovedRules,
  type WardenCheckFinding,
  type WardenCheckInput,
  type WardenFamiliesActive,
  noWriteAheads,
  pendingWriteAheads,
  settleWriteAheads,
  type WriteAheadCounts,
  type WriteAheadLive,
} from "@stagecraft/index";
import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import { beginRun, type RunGuard, type RunOwnership, type RunToken } from "../runToken";
import {
  clearStoryExtensionPrompt, getContext, getPlayerName, loadLorebook, readWIEntry, readWIEntryAt,
  restoreWIEntryAt, setStoryExtensionPrompt, updateWIEntryByUid, type WIEntryTarget,
} from "@services/STAPI";
import { lorebookFileId } from "@utils/string";
import type { ExtractionRuntimeSettings, StagecraftRuntimeState } from "../types";
import type { EstablishedFact } from "../continuity";

// One curator pass every few boundaries at most: the reply path never waits for it, and a story that
// moves fast should not fund a model call per turn.
export const CURATOR_BOUNDARY_GAP = 4;

export interface StagecraftCoordinatorDeps {
  getStory: () => NormalizedStoryV2 | null;
  getState: () => EngineState | null;
  getStagecraft: () => StagecraftRuntimeState;
  setStagecraft: (next: StagecraftRuntimeState) => void;
  getExtractionSettings: () => ExtractionRuntimeSettings;
  getCanon: () => string;
  getOpenArcs: () => string[];
  filterEntries?: (entries: CuratorEntryView[], context: { checkpoint: { name: string; objective: string }; canon: string; openThreads: string[] }) => Promise<CuratorEntryView[]>;
  warden?: {
    check: (input: WardenCheckInput) => Promise<WardenCheckFinding[] | null>;
    facts: () => EstablishedFact[];
    families?: () => Omit<WardenFamiliesActive, "continuity">;
    nudgeActive: () => boolean;
  };
  journal: (summary: string, note?: string) => void;
  persist: () => Promise<void>;
  notify: () => void;
  // v2.3 plan 03 (R1). A curator pass reads the world, awaits a model for seconds, then writes
  // through `setStagecraft` — which resolves to whatever chat is current when the promise lands,
  // not the one the work belongs to. The token is minted before the awaits and checked at the
  // write edge. Optional so an existing caller keeps today's behaviour until it supplies one.
  ownership: RunOwnership;
}

const uniqueRecordId = (base: string, records: CuratorProposalRecord[]): string => {
  const taken = new Set(records.map((record) => record.id));
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
  return id;
};

const acceptedOps = (record: CuratorProposalRecord) => record.ops.filter((entry) => entry.status === "accepted" && !isNoteOp(entry.op));

// The reply the warden reads is the one at its own id, never "the last message": by the time the
// judge answers, the player may already have written.
const readReply = (messageId: number): { speaker: string; text: string } | null => {
  const chat = getContext().chat;
  const raw = Array.isArray(chat) ? (chat[messageId] as { name?: unknown } | undefined) : undefined;
  const message = cleanWindowMessage(raw);
  if (!message.keep || message.isUser) return null;
  return { speaker: typeof raw?.name === "string" && raw.name ? raw.name : "Narrator", text: message.text };
};

const readPlayerLine = (replyMessageId: number): string | null => {
  const chat = getContext().chat;
  if (!Array.isArray(chat)) return null;
  for (let index = Math.min(replyMessageId, chat.length) - 1; index >= 0; index -= 1) {
    const message = cleanWindowMessage(chat[index]);
    if (message.keep && message.isUser) return message.text;
  }
  return null;
};

// Owns extras.stagecraft: the World Info curator's off-path pass, the review ring the author acts
// on, and the boundary write. It holds no engine or memory dependency **by construction** — a
// curator can never move the blackboard or a memory tier (spec addendum §Stagecraft).
const RETAINED_OP_STATUSES = new Set(["applied", "revert-failed", "externally-edited"]);

// V10: an op is reverted by the entry uid it recorded, so a rename after the write does not lose the
// entry. An op recorded without one is never name-addressed: it is refused.
const uidTarget = (entry: CuratorOpRecord): WIEntryTarget | null =>
  entry.target?.uid !== undefined ? { lorebookFileId: entry.target.lorebookFileId, uid: entry.target.uid } : null;

interface PassHold {
  token: RunToken | undefined;
}

export class StagecraftCoordinator {
  private curatorHold: PassHold | null = null;
  private wardenHold: PassHold | null = null;
  private noteActive = false;
  private carriedNote: { recordId: string; indices: number[] } | null = null;
  private applying: Promise<unknown> = Promise.resolve();

  constructor(private readonly deps: StagecraftCoordinatorDeps) {}

  /** V3: a pass holds the coordinator only while its own world is still open — a slow pass started
   *  in another chat used to block this chat's pass until its model call returned to be discarded. */
  private busy(hold: PassHold | null): boolean {
    return hold !== null && (!hold.token || this.deps.ownership.check(hold.token).ok !== false);
  }

  private get state(): StagecraftRuntimeState {
    return this.deps.getStagecraft();
  }

  private patch(next: Partial<StagecraftRuntimeState>) {
    this.deps.setStagecraft({ ...this.state, ...next });
  }

  private async save() {
    await this.deps.persist();
    this.deps.notify();
  }

  getState(): StagecraftRuntimeState {
    return this.state;
  }

  get curatorEnabled(): boolean {
    return this.state.settings.curatorEnabled && curatorHasScope(this.deps.getStory());
  }

  // Coalesced: nothing while a pass is in flight, and never twice inside the boundary gap.
  dueForRun(): boolean {
    const boundary = this.deps.getState()?.boundary ?? 0;
    return this.curatorEnabled && !this.busy(this.curatorHold) && boundary - this.state.lastRunBoundary >= CURATOR_BOUNDARY_GAP;
  }

  // Only the authored allowlist is ever read, minus the entries checkpoints switch, so the prompt
  // cannot mention — and the parser cannot accept — an entry the curator may not write.
  async readScope(): Promise<CuratorEntryView[]> {
    const story = this.deps.getStory();
    const views: CuratorEntryView[] = [];
    for (const lorebook of curatorLorebooks(story)) {
      const loaded = await loadLorebook(lorebook);
      if (!loaded?.entries) continue;
      views.push(...entriesForScope(lorebook, Object.values(loaded.entries)).filter((view) => !isCheckpointGated(story, view.lorebook, view.comment)));
    }
    return views;
  }

  async runCuratorPass(reason = "curator", debugResponse?: string): Promise<CuratorPassOutcome> {
    const story = this.deps.getStory();
    const state = this.deps.getState();
    if (!story || !state || !this.state.settings.curatorEnabled) return { ran: false, skipped: "disabled", record: null };
    if (!curatorHasScope(story)) return { ran: false, skipped: "no-scope", record: null };
    if (this.busy(this.curatorHold)) return { ran: false, skipped: "in-flight", record: null };
    // Minted before the first await, so it describes the world this pass was asked about.
    const token = this.deps.ownership.mint();
    const hold: PassHold = { token };
    this.curatorHold = hold;
    try {
      const entries = await this.readScope();
      if (!entries.length) return { ran: false, skipped: "empty-scope", record: null };
      const checkpoint = story.checkpointById[state.activeCheckpointId];
      const checkpointName = checkpoint?.name ?? state.activeCheckpointId;
      const objective = checkpoint?.objective ?? "";
      const canon = this.deps.getCanon();
      const openArcs = this.deps.getOpenArcs();
      const shown = this.deps.filterEntries ? await this.deps.filterEntries(entries, { checkpoint: { name: checkpointName, objective }, canon, openThreads: openArcs }).catch(() => entries) : entries;
      const declined = declinedOps(this.state.proposals, state.activeCheckpointId, state.checkpointStartedBoundary ?? 0);
      const prompt = buildWiCuratorPrompt({ storyTitle: story.title, checkpointName, objective, canon, openArcs, entries: shown, declined });
      const response = await callExtractionModel(prompt, {
        profileId: this.deps.getExtractionSettings().profileId, role: "curator",
        maxTokens: maxTokensForInput("curator", prompt),
        ...(this.deps.ownership.signal ? { signal: this.deps.ownership.signal() } : {}),
        debugResponse: debugResponse ?? globalThis.storyOrchestratorDebugCuratorResponse ?? null,
      });
      // The write edge. Everything above was read from, or computed for, the world the token
      // names; if that world moved while the model was thinking, this result belongs to it and
      // not to whatever is open now.
      const owned = token ? this.deps.ownership.check(token) : undefined;
      if (owned && owned.ok === false) {
        this.deps.journal(`World Info curator result discarded (${owned.reason})`, owned.detail);
        return { ran: true, record: null, discarded: owned.reason };
      }
      const proposal = parseCuratorResponse(response, shown);
      const plan = planCuratorProposal(proposal, shown, { mode: this.state.settings.acceptMode, declined });
      this.patch({
        lastRunBoundary: state.boundary,
        lastError: null,
        lastPass: { at: new Date().toISOString(), reason, prompt, rawResponse: response, proposed: plan.records.length, dropped: plan.dropped, ...(shown.length < entries.length ? { focus: { shown: shown.length, total: entries.length } } : {}) },
      });
      if (!plan.records.length && !plan.dropped.length) {
        await this.save();
        return { ran: true, record: null };
      }
      const mode = this.state.settings.acceptMode;
      const record: CuratorProposalRecord = {
        id: uniqueRecordId(`wi-${state.boundary}-${state.lastMessageId}`, this.state.proposals),
        curator: "wi",
        at: new Date().toISOString(),
        boundary: state.boundary,
        messageId: state.lastMessageId,
        checkpointId: state.activeCheckpointId,
        reason,
        summary: proposal.summary,
        mode,
        // "auto" accepts on the spot so the next boundary writes it; "review" and "off" wait, and
        // "off" never leaves the ring at all.
        ops: plan.records.map((entry) => (mode === "auto" ? { ...entry, status: "accepted" as const } : entry)),
        dropped: plan.dropped,
        provenance: { source: "curator", messageId: state.lastMessageId, boundary: state.boundary, pass: `wi-curator:${reason}`, inputs: shown.map((entry) => ({ store: "memory" as const, id: `${entry.lorebook}#${entry.comment}` })), validity: "live" },
      };
      this.patch({ proposals: capProposalRing([...this.state.proposals, record]) });
      this.deps.journal(`World Info curator proposed ${record.ops.length} change(s) at ${checkpoint?.name ?? state.activeCheckpointId}`, record.summary);
      await this.save();
      return { ran: true, record };
    } catch (error) {
      // A failure belongs to its own chat too: writing `lastError` after a switch marks the wrong
      // chat's panel with an error it never had.
      const owned = token ? this.deps.ownership.check(token) : undefined;
      if (owned && owned.ok === false) return { ran: true, record: null, discarded: owned.reason };
      this.patch({ lastError: error instanceof Error ? error.message : "Curator pass failed" });
      await this.save();
      if (failureClass(error) === "transport") throw error;
      return { ran: true, record: null };
    } finally {
      if (this.curatorHold === hold) this.curatorHold = null;
    }
  }

  getProposals(): CuratorProposalRecord[] {
    return this.state.proposals;
  }

  private updateOps(id: string, update: (record: CuratorProposalRecord) => CuratorProposalRecord) {
    this.patch({ proposals: this.state.proposals.map((record) => (record.id === id ? update(record) : record)) });
  }

  // Author review: accept or reject a single change, optionally with the text they edited. Editing
  // is the point of the card — the model drafts, the author decides what gets written.
  async setOpDecision(id: string, index: number, status: "accepted" | "rejected", op?: CuratorOp) {
    this.updateOps(id, (record) => ({
      ...record,
      ops: record.ops.map((entry, entryIndex) => (entryIndex === index ? { ...entry, status, op: decidedOp(entry, status, op) } : entry)),
    }));
    await this.save();
  }

  async decideProposal(id: string, status: "accepted" | "rejected") {
    this.updateOps(id, (record) => ({ ...record, ops: record.ops.map((entry) => (entry.status === "pending" ? { ...entry, status, op: decidedOp(entry, status) } : entry)) }));
    await this.save();
  }

  // The record is a tiny WAL. Persist it before a host write, then the applied row after: a crash in
  // between leaves a pending row with before/after, not an unrecorded file mutation.
  private async markWriteAhead(proposalId: string, index: number, entry: CuratorOpRecord) {
    this.updateOps(proposalId, (record) => ({ ...record, ops: record.ops.map((item, at) => at === index ? entry : item) }));
    await this.save();
  }

  // Boundary-applied, like every other effect: an accepted change reaches World Info here and
  // nowhere else, and the allowlist is re-checked at the write edge. One apply at a time: two that
  // overlap both read an op as accepted and write it twice.
  applyAccepted(): Promise<number> {
    const run = beginRun(this.deps.ownership);
    const turn = this.applying.then(() => this.applyInTurn(run));
    this.applying = turn.catch(() => undefined);
    return turn;
  }

  // These ops reach a real lorebook FILE, shared by every chat that uses the book, so a boundary
  // commit that outlives its chat does not merely record something in the wrong place — it edits
  // a file another story is reading. `writeOp` checks the run after each of its awaits, before the
  // write that follows it, and the proposal patch is checked again after the last op.
  private async applyInTurn(run: RunGuard): Promise<number> {
    const story = this.deps.getStory();
    if (!story || !this.state.proposals.some((record) => acceptedOps(record).length)) return 0;
    const messageId = this.deps.getState()?.lastMessageId ?? -1;
    let applied = 0;
    const updated = new Map<string, CuratorProposalRecord>();
    for (const record of [...this.state.proposals]) {
      if (!acceptedOps(record).length) continue;
      const ops: CuratorOpRecord[] = [];
      for (let index = 0; index < record.ops.length; index += 1) {
        const entry = record.ops[index];
        if (entry.status !== "accepted" || isNoteOp(entry.op)) {
          ops.push(entry);
          continue;
        }
        const result = await this.writeOp(story, entry, run, messageId, async (pending) => this.markWriteAhead(record.id, index, pending));
        if (result.lapsed) return applied;
        if (result.ok) applied += 1;
        ops.push(result.record);
      }
      updated.set(record.id, { ...record, ops, appliedAt: new Date().toISOString(), messageId });
    }
    if (run.lapsed()) return applied;
    const proposals = this.state.proposals.map((record) => updated.get(record.id) ?? record);
    this.patch({ proposals });
    if (applied) this.deps.journal(`World Info curator applied ${applied} change(s)`, proposals[proposals.length - 1]?.summary);
    await this.save();
    return applied;
  }

  // A lapse returns before the next write and records nothing: after a switch, the state and the
  // save both resolve to the chat that replaced this one.
  private async writeOp(story: NormalizedStoryV2, entry: CuratorOpRecord, run: RunGuard, messageId: number, beforeHostWrite: (pending: CuratorOpRecord) => Promise<void>): Promise<{ ok: boolean; record: CuratorOpRecord; lapsed?: true }> {
    const op = entry.op;
    if (isNoteOp(op)) return { ok: false, record: entry };
    if (!isCuratorWritable(story, op.lorebook, op.comment)) {
      const message = isCheckpointGated(story, op.lorebook, op.comment)
        ? `"${op.comment}" is switched by checkpoint effects, which alone decide it`
        : `"${op.lorebook}" is not on this story's stagecraft allowlist`;
      return { ok: false, record: { ...entry, status: "failed", message } };
    }
    // v2.3 plan 04 (R2): the before-image is read at the write edge. v2.4 plan 06 T17.2: by uid, and
    // an entry that is gone is a failed op, never a created one.
    const fileId = lorebookFileId(op.lorebook);
    const live = op.uid !== undefined ? await readWIEntryAt({ lorebookFileId: fileId, uid: op.uid }) : await readWIEntry(op.lorebook, op.comment);
    if (run.lapsed()) return { ok: false, record: entry, lapsed: true };
    const uid = op.uid ?? live?.uid;
    if (!live || uid === undefined) return { ok: false, record: { ...entry, status: "failed", message: `"${op.comment}" is no longer in ${op.lorebook}` } };
    const comment = "comment" in live && typeof live.comment === "string" ? live.comment : op.comment;
    if (!isCuratorWritable(story, op.lorebook, comment)) return { ok: false, record: { ...entry, status: "failed", message: `"${op.comment}" is now "${comment}", which the curator may not write` } };
    const preview = previewCuratorOp(op, { lorebook: op.lorebook, comment: op.comment, keys: live.keys, content: live.content, disabled: live.disabled, uid });
    if (!preview.ok) return { ok: false, record: { ...entry, status: "failed", message: preview.message } };
    const before = { content: live.content, disabled: live.disabled, uid };
    const after = op.kind === "enable" || op.kind === "disable" ? { content: before.content, disabled: op.kind === "disable" } : { content: preview.content ?? "", disabled: before.disabled };
    const pending: CuratorOpRecord = { ...entry, before, after, target: { lorebookFileId: fileId, uid }, writeAhead: { status: "pending", at: new Date().toISOString(), messageId } };
    await beforeHostWrite(pending);
    if (run.lapsed()) return { ok: false, record: pending, lapsed: true };
    try {
      const written = await updateWIEntryByUid({ lorebookFileId: fileId, uid }, after);
      if (!written.ok) return { ok: false, record: { ...pending, status: "failed", message: written.reason, writeAhead: undefined } };
      return { ok: true, record: { ...pending, status: "applied", message: preview.message, writeAhead: undefined } };
    } catch (error) {
      return { ok: false, record: { ...pending, status: "failed", message: error instanceof Error ? error.message : "write failed", writeAhead: undefined } };
    }
  }

  async reconcileWriteAhead(): Promise<WriteAheadCounts> {
    const pending = pendingWriteAheads(this.state.proposals);
    if (!pending.length) return noWriteAheads();
    const run = beginRun(this.deps.ownership);
    const live = new Map<string, WriteAheadLive | null>();
    for (const { key, entry } of pending) {
      const at = uidTarget(entry);
      live.set(key, at ? await readWIEntryAt(at) : null);
      if (run.lapsed()) return noWriteAheads();
    }
    const { proposals, counts } = settleWriteAheads(this.state.proposals, live, new Date().toISOString());
    this.patch({ proposals });
    this.deps.journal(`World Info curator writes reconciled on reload: ${counts.applied} landed, ${counts.retry} to rewrite, ${counts.left} left alone`);
    return counts;
  }

  // A rollback undoes the story; a curator write made after that point has to go with it. The
  // pre-write content is recorded on the op, so putting it back needs no history of its own.
  async revertAppliedSince(messageId: number): Promise<number> {
    const story = this.deps.getStory();
    const run = beginRun(this.deps.ownership);
    const withdrawn = this.settleNotes((op) => op.replyMessageId >= messageId, "reverted");
    // v2.3 plan 04 (R2). NEWEST RECORD FIRST, and within a record newest op first, so two writes to
    // one entry walk back through their own chain: Original -> First -> Second reverts to Original,
    // not to the intermediate text the older record happens to hold.
    const affected = this.state.proposals.filter((record) => record.curator !== "warden" && record.appliedAt && record.messageId >= messageId).reverse();
    if (!story || !affected.length) {
      if (withdrawn) await this.save();
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
        const current = await readWIEntryAt(at);
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
    this.patch({ proposals: this.state.proposals.filter((record) => !settled.has(record.id)).map((record) => (byId.has(record.id) ? { ...record, ops: byId.get(record.id)! } : record)) });
    if (reverted) this.deps.journal(`World Info curator changes rolled back (${reverted})`);
    await this.save();
    return reverted;
  }

  // One inverse host call, checked. `false` means the host refused or could not find the entry;
  // the caller keeps the record and its before-image rather than reporting a revert that did not
  // happen.
  private async restoreBefore(entry: CuratorOpRecord, at: WIEntryTarget): Promise<boolean> {
    if (!entry.before || isNoteOp(entry.op)) return false;
    try {
      return (await restoreWIEntryAt(at, entry.before)).ok;
    } catch {
      return false;
    }
  }

  // v2.2 plan 05: fire-and-forget after a committed character reply, never a scheduler job. The judge
  // decides which established facts the reply broke; the note itself is composed in code.
  private activeFamilies(): WardenFamiliesActive {
    const extra = this.deps.warden?.families?.() ?? { agency: false, houseRules: [] };
    return { continuity: this.state.settings.wardenEnabled, agency: extra.agency, houseRules: extra.houseRules };
  }

  // T23: a story swap that drops a rule withdraws the unapplied notes that named it.
  private withdrawRemovedRules(): number {
    const rules = this.deps.getStory()?.house_rules ?? [];
    return this.settleNotes((op, status) => status !== "applied" && withdrawRemovedRules(op, rules), "rule removed");
  }

  async runWardenPass(replyMessageId: number): Promise<boolean> {
    const settings = this.state.settings;
    const state = this.deps.getState();
    const warden = this.deps.warden;
    if (!warden || !state || settings.wardenAcceptMode === "off") return false;
    const families = this.activeFamilies();
    if (!anyWardenFamily(families)) return false;
    const reply = readReply(replyMessageId);
    if (!reply) return false;
    const lapsed = this.settleNotes((op, status) => op.replyMessageId < replyMessageId && status !== "applied", "lapsed") + this.withdrawRemovedRules();
    if (this.busy(this.wardenHold)) {
      if (lapsed) await this.save();
      return false;
    }
    const token = this.deps.ownership.mint();
    const hold: PassHold = { token };
    this.wardenHold = hold;
    try {
      const established = families.continuity ? warden.facts() : [];
      const playerLine = families.agency ? readPlayerLine(replyMessageId) : null;
      const input: WardenCheckInput = { reply, facts: established.map((fact) => fact.text), agency: playerLine !== null ? { player: getPlayerName(), message: playerLine } : null, houseRules: families.houseRules };
      const asks = input.facts.length > 0 || input.agency !== null || input.houseRules.length > 0;
      const findings = asks ? await warden.check(input).catch(() => null) : null;
      const owned = token ? this.deps.ownership.check(token) : undefined;
      if (owned && owned.ok === false) return false;
      if (!findings?.length || readReply(replyMessageId)?.text !== reply.text) {
        if (lapsed) await this.save();
        return false;
      }
      const record: CuratorProposalRecord = {
        id: `warden-${state.boundary}-${replyMessageId}`,
        curator: "warden",
        at: new Date().toISOString(),
        boundary: state.boundary,
        messageId: replyMessageId,
        checkpointId: state.activeCheckpointId,
        reason: wardenReason(findings),
        summary: wardenSummary(reply.speaker, findings),
        mode: settings.wardenAcceptMode,
        ops: wardenNoteOps(findings, established, replyMessageId, settings.wardenAcceptMode),
        dropped: [],
        provenance: { source: "curator", messageId: replyMessageId, boundary: state.boundary, pass: "continuity-warden", inputs: [{ store: "memory" as const, id: `reply:${replyMessageId}` }], validity: "live" },
      };
      this.patch({ proposals: capProposalRing([...this.state.proposals, record]) });
      this.deps.journal(...wardenFlagJournal(reply.speaker, findings));
      await this.save();
      return true;
    } finally {
      if (this.wardenHold === hold) this.wardenHold = null;
    }
  }

  // A note is about one reply: a newer reply makes an unapplied one moot ("lapsed"), and a rollback
  // past its reply withdraws it whatever its state ("reverted").
  private settleNotes(match: (op: WardenNoteOp, status: CuratorOpStatus) => boolean, message: string): number {
    let settled = 0;
    const proposals = this.state.proposals.map((record) => (record.curator !== "warden" ? record : {
      ...record,
      ops: record.ops.map((entry) => {
        if (!isNoteOp(entry.op) || entry.status === "rejected" || !match(entry.op, entry.status)) return entry;
        settled += 1;
        return { ...entry, status: "rejected" as const, message };
      }),
    }));
    if (settled) this.patch({ proposals });
    return settled;
  }

  // An accepted note rides the outermost loud generation: set when it opens, spent only when that
  // generation closes with its own reply (v2.4 X6). The author's own nudge wins a shared generation,
  // and the note waits for the next one.
  onGenerationStarted(type: unknown, dryRun: unknown) {
    const settings = this.state.settings;
    if (dryRun === true || type === "quiet" || type === "impersonate" || settings.wardenAcceptMode === "off" || this.deps.warden?.nudgeActive()) return;
    this.withdrawRemovedRules();
    const active = this.activeFamilies();
    const carried = newestCarriedNote(this.state.proposals, active);
    if (!carried) return;
    const ops = carried.indices.map((index) => carried.record.ops[index].op).filter(isNoteOp);
    setStoryExtensionPrompt(INJECTION_REGISTRY.continuityNote.key, composeWardenNote(ops), INJECTION_REGISTRY.continuityNote.depth);
    this.noteActive = true;
    this.carriedNote = { recordId: carried.record.id, indices: carried.indices };
    this.deps.journal(...wardenNoteJournal(ops));
  }

  // A stopped or reply-less generation leaves the note accepted, so it rides the next loud one.
  commitNote(rendered: boolean) {
    const carried = this.carriedNote;
    this.clearContinuityNote();
    if (!rendered || !carried) return;
    this.updateOps(carried.recordId, (current) => ({
      ...current,
      appliedAt: new Date().toISOString(),
      ops: current.ops.map((candidate, index) => (carried.indices.includes(index) && candidate.status === "accepted" ? { ...candidate, status: "applied" as const } : candidate)),
    }));
    void this.save();
  }

  clearContinuityNote() {
    this.carriedNote = null;
    if (!this.noteActive) return;
    clearStoryExtensionPrompt(INJECTION_REGISTRY.continuityNote.key);
    this.noteActive = false;
  }
}
