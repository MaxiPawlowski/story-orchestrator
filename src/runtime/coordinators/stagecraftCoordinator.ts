import type { EngineState, NormalizedStoryV2 } from "@engine/index";
import { callExtractionModel } from "@extraction/client";
import { maxTokensForInput } from "@extraction/callBudget";
import {
  buildWiCuratorPrompt,
  curatorHasScope,
  curatorLorebooks,
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
} from "@stagecraft/index";
import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import type { RunOwnership, RunToken } from "../runToken";
import {
  clearStoryExtensionPrompt, disableWIEntry, enableWIEntry, getContext, loadLorebook, readWIEntry, readWIEntryAt,
  restoreWIEntryAt, setStoryExtensionPrompt, upsertWIEntry, type WIEntryTarget,
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
  warden?: { check: (reply: { speaker: string; text: string }, facts: string[]) => Promise<{ facts: string[]; text: string } | null>; facts: () => EstablishedFact[]; nudgeActive: () => boolean };
  journal: (summary: string, note?: string) => void;
  persist: () => Promise<void>;
  notify: () => void;
  // v2.3 plan 03 (R1). A curator pass reads the world, awaits a model for seconds, then writes
  // through `setStagecraft` — which resolves to whatever chat is current when the promise lands,
  // not the one the work belongs to. The token is minted before the awaits and checked at the
  // write edge. Optional so an existing caller keeps today's behaviour until it supplies one.
  ownership?: RunOwnership;
}

const acceptedOps = (record: CuratorProposalRecord) => record.ops.filter((entry) => entry.status === "accepted" && !isNoteOp(entry.op));

// The reply the warden reads is the one at its own id, never "the last message": by the time the
// judge answers, the player may already have written.
const readReply = (messageId: number): { speaker: string; text: string } | null => {
  const chat = getContext().chat;
  const message = Array.isArray(chat) ? (chat[messageId] as { name?: unknown; mes?: unknown; is_user?: unknown; is_system?: unknown } | undefined) : undefined;
  if (!message || message.is_user === true || message.is_system === true || typeof message.mes !== "string" || !message.mes.trim()) return null;
  return { speaker: typeof message.name === "string" && message.name ? message.name : "Narrator", text: message.mes };
};

// Owns extras.stagecraft: the World Info curator's off-path pass, the review ring the author acts
// on, and the boundary write. It holds no engine or memory dependency **by construction** — a
// curator can never move the blackboard or a memory tier (spec addendum §Stagecraft).
const RETAINED_OP_STATUSES = new Set(["applied", "revert-failed", "externally-edited"]);

// V10: an op recorded with an entry uid is reverted by that uid, so a rename after the write does not
// lose the entry. Records from before the uid was recorded keep the name + comment address.
const uidTarget = (entry: CuratorOpRecord): WIEntryTarget | null =>
  entry.target?.uid !== undefined ? { lorebookFileId: entry.target.lorebookFileId, uid: entry.target.uid } : null;

interface PassHold {
  token: RunToken | undefined;
}

export class StagecraftCoordinator {
  private curatorHold: PassHold | null = null;
  private wardenHold: PassHold | null = null;
  private noteActive = false;
  private carriedNote: { recordId: string; index: number } | null = null;

  constructor(private readonly deps: StagecraftCoordinatorDeps) {}

  /** V3: a pass holds the coordinator only while its own world is still open — a slow pass started
   *  in another chat used to block this chat's pass until its model call returned to be discarded. */
  private busy(hold: PassHold | null): boolean {
    return hold !== null && (!hold.token || this.deps.ownership?.check(hold.token).ok !== false);
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
    const token = this.deps.ownership?.mint();
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
      const prompt = buildWiCuratorPrompt({ storyTitle: story.title, checkpointName, objective, canon, openArcs, entries: shown });
      const response = await callExtractionModel(prompt, {
        profileId: this.deps.getExtractionSettings().profileId,
        maxTokens: maxTokensForInput("curator", prompt),
        ...(this.deps.ownership?.signal ? { signal: this.deps.ownership.signal() } : {}),
        debugResponse: debugResponse ?? globalThis.storyOrchestratorDebugCuratorResponse ?? null,
      });
      // The write edge. Everything above was read from, or computed for, the world the token
      // names; if that world moved while the model was thinking, this result belongs to it and
      // not to whatever is open now.
      const owned = token ? this.deps.ownership?.check(token) : undefined;
      if (owned && owned.ok === false) {
        this.deps.journal(`World Info curator result discarded (${owned.reason})`, owned.detail);
        return { ran: true, record: null, discarded: owned.reason };
      }
      const proposal = parseCuratorResponse(response, shown);
      const plan = planCuratorProposal(proposal, shown);
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
        id: `wi-${state.boundary}-${state.lastMessageId}`,
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
      const owned = token ? this.deps.ownership?.check(token) : undefined;
      if (owned && owned.ok === false) return { ran: true, record: null, discarded: owned.reason };
      this.patch({ lastError: error instanceof Error ? error.message : "Curator pass failed" });
      await this.save();
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
      ops: record.ops.map((entry, entryIndex) => (entryIndex === index ? { ...entry, status, ...(op ? { op } : {}) } : entry)),
    }));
    await this.save();
  }

  async decideProposal(id: string, status: "accepted" | "rejected") {
    this.updateOps(id, (record) => ({ ...record, ops: record.ops.map((entry) => (entry.status === "pending" ? { ...entry, status } : entry)) }));
    await this.save();
  }

  // The record is a tiny WAL. Persist it before a host write, then the applied row after: a crash in
  // between leaves a pending row with before/after, not an unrecorded file mutation.
  private async markWriteAhead(proposalId: string, index: number, entry: CuratorOpRecord) {
    this.updateOps(proposalId, (record) => ({ ...record, ops: record.ops.map((item, at) => at === index ? entry : item) }));
    await this.save();
  }

  // Boundary-applied, like every other effect: an accepted change reaches World Info here and
  // nowhere else, and the allowlist is re-checked at the write edge.
  async applyAccepted(): Promise<number> {
    const story = this.deps.getStory();
    if (!story || !this.state.proposals.some((record) => acceptedOps(record).length)) return 0;
    // These ops reach a real lorebook FILE, shared by every chat that uses the book, so a boundary
    // commit that outlives its chat does not merely record something in the wrong place — it edits
    // a file another story is reading. The token is checked inside the loop, before each write.
    const token = this.deps.ownership?.mint();
    const messageId = this.deps.getState()?.lastMessageId ?? -1;
    const entries = await this.readScope();
    let applied = 0;
    const proposals: CuratorProposalRecord[] = [];
    for (const record of [...this.state.proposals]) {
      if (!acceptedOps(record).length) {
        proposals.push(record);
        continue;
      }
      const ops: CuratorOpRecord[] = [];
      for (let index = 0; index < record.ops.length; index += 1) {
        const entry = record.ops[index];
        if (entry.status !== "accepted" || isNoteOp(entry.op)) {
          ops.push(entry);
          continue;
        }
        const beforeWrite = token ? this.deps.ownership?.check(token) : undefined;
        if (beforeWrite && beforeWrite.ok === false) return applied;
        const result = await this.writeOp(story, entry, entries, async (pending) => this.markWriteAhead(record.id, index, pending));
        if (result.ok) applied += 1;
        ops.push(result.record);
      }
      proposals.push({ ...record, ops, appliedAt: new Date().toISOString(), messageId });
    }
    const owned = token ? this.deps.ownership?.check(token) : undefined;
    if (owned && owned.ok === false) return applied;
    this.patch({ proposals });
    if (applied) this.deps.journal(`World Info curator applied ${applied} change(s)`, proposals[proposals.length - 1]?.summary);
    await this.save();
    return applied;
  }

  private async writeOp(story: NormalizedStoryV2, entry: CuratorOpRecord, entries: CuratorEntryView[], beforeHostWrite: (pending: CuratorOpRecord) => Promise<void>): Promise<{ ok: boolean; record: CuratorOpRecord }> {
    const op = entry.op;
    if (isNoteOp(op)) return { ok: false, record: entry };
    if (!isCuratorWritable(story, op.lorebook, op.comment)) {
      const message = isCheckpointGated(story, op.lorebook, op.comment)
        ? `"${op.comment}" is switched by checkpoint effects, which alone decide it`
        : `"${op.lorebook}" is not on this story's stagecraft allowlist`;
      return { ok: false, record: { ...entry, status: "failed", message } };
    }
    // v2.3 plan 04 (R2). The before-image comes from the WRITE EDGE, not from a batch read taken
    // before the loop: two ops in one batch can address the same entry, and the second one's
    // before-image is the first one's after-image, not what the book held when the batch started.
    const liveRead = await readWIEntry(op.lorebook, op.comment);
    const live = liveRead
      ? { ...(entries.find((candidate) => candidate.lorebook.toLowerCase() === op.lorebook.toLowerCase() && candidate.comment.toLowerCase() === op.comment.toLowerCase()) ?? { lorebook: op.lorebook, comment: op.comment, keys: [] }), content: liveRead.content, disabled: liveRead.disabled }
      : entries.find((candidate) => candidate.lorebook.toLowerCase() === op.lorebook.toLowerCase() && candidate.comment.toLowerCase() === op.comment.toLowerCase());
    const preview = previewCuratorOp(op, live);
    if (!preview.ok) return { ok: false, record: { ...entry, status: "failed", message: preview.message } };
    const before = { content: liveRead?.content ?? live?.content ?? "", disabled: liveRead?.disabled ?? live?.disabled === true, ...(liveRead?.uid !== undefined ? { uid: liveRead.uid } : {}) };
    const target = { lorebookFileId: lorebookFileId(op.lorebook), ...(liveRead?.uid !== undefined ? { uid: liveRead.uid } : {}) };
    const after = op.kind === "enable" || op.kind === "disable"
      ? { content: before.content, disabled: op.kind === "disable" }
      : { content: preview.content ?? "", disabled: before.disabled };
    const pending: CuratorOpRecord = { ...entry, before, after, target, writeAhead: { status: "pending", at: new Date().toISOString() } };
    await beforeHostWrite(pending);
    try {
      if (op.kind === "enable" || op.kind === "disable") {
        const toggled = op.kind === "enable" ? await enableWIEntry(op.lorebook, op.comment) : await disableWIEntry(op.lorebook, op.comment);
        if (!toggled.ok) return { ok: false, record: { ...pending, status: "failed", message: toggled.reason, writeAhead: undefined } };
        return { ok: true, record: { ...pending, status: "applied", message: preview.message, writeAhead: undefined } };
      }
      const result = await upsertWIEntry(op.lorebook, op.comment, preview.content ?? "", live?.keys ?? []);
      if (result === "failed") return { ok: false, record: { ...pending, status: "failed", message: `could not write "${op.comment}"`, writeAhead: undefined } };
      // upsertWIEntry always re-enables what it writes: keep an entry the author had switched off.
      const kept = before.disabled ? await disableWIEntry(op.lorebook, op.comment) : null;
      if (kept && !kept.ok) return { ok: false, record: { ...pending, status: "failed", message: `wrote "${op.comment}" but could not keep it switched off: ${kept.reason}`, writeAhead: undefined } };
      return { ok: true, record: { ...pending, status: "applied", message: preview.message, writeAhead: undefined } };
    } catch (error) {
      return { ok: false, record: { ...pending, status: "failed", message: error instanceof Error ? error.message : "write failed", writeAhead: undefined } };
    }
  }

  // A rollback undoes the story; a curator write made after that point has to go with it. The
  // pre-write content is recorded on the op, so putting it back needs no history of its own.
  async revertAppliedSince(messageId: number): Promise<number> {
    const story = this.deps.getStory();
    const token = this.deps.ownership?.mint();
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
        const owned = token ? this.deps.ownership?.check(token) : undefined;
        if (owned && owned.ok === false) { ops.unshift(entry); continue; }
        if (isNoteOp(entry.op) || entry.status !== "applied" || !entry.before || !isCuratorWritable(story, entry.op.lorebook, entry.op.comment)) {
          ops.unshift(entry);
          continue;
        }
        // Compare-and-set: the entry has to still hold what this op wrote. If it does not, someone
        // else edited the book after us and putting our before-image back would silently undo them.
        const at = uidTarget(entry);
        const current: { content: string; disabled: boolean; comment?: string } | null = at ? await readWIEntryAt(at) : await readWIEntry(entry.op.lorebook, entry.op.comment);
        if (current?.comment !== undefined && current.comment !== entry.op.comment && !isCuratorWritable(story, entry.op.lorebook, current.comment)) {
          ops.unshift({ ...entry, status: "externally-edited", message: `"${entry.op.comment}" is now "${current.comment}", which the curator may not write, so it was left alone` });
          continue;
        }
        if (current && entry.after && (current.content !== entry.after.content || current.disabled !== entry.after.disabled)) {
          ops.unshift({ ...entry, status: "externally-edited", message: `"${entry.op.comment}" changed after this write, so it was left alone` });
          continue;
        }
        const restored = await this.restoreBefore(entry);
        if (restored) reverted += 1;
        else ops.unshift({ ...entry, status: "revert-failed", message: `could not restore "${entry.op.comment}"; the entry it would restore is kept for a retry` });
      }
      if (!ops.some((kept) => RETAINED_OP_STATUSES.has(kept.status))) settled.add(record.id);
      updates.push({ id: record.id, ops });
    }
    const byId = new Map(updates.map((update) => [update.id, update.ops]));
    this.patch({ proposals: this.state.proposals.filter((record) => !settled.has(record.id)).map((record) => (byId.has(record.id) ? { ...record, ops: byId.get(record.id)! } : record)) });
    if (reverted) this.deps.journal(`World Info curator changes rolled back (${reverted})`);
    await this.save();
    return reverted;
  }

  // One inverse host call, checked. `false` means the host refused or could not find the entry;
  // the caller keeps the record and its before-image rather than reporting a revert that did not
  // happen.
  private async restoreBefore(entry: CuratorOpRecord): Promise<boolean> {
    const { op, before } = entry;
    if (!before || isNoteOp(op)) return false;
    const at = uidTarget(entry);
    try {
      if (at) return (await restoreWIEntryAt(at, before)).ok;
      const written = await upsertWIEntry(op.lorebook, op.comment, before.content);
      if (written === "failed") return false;
      const toggled = before.disabled ? await disableWIEntry(op.lorebook, op.comment) : await enableWIEntry(op.lorebook, op.comment);
      return toggled.ok;
    } catch {
      return false;
    }
  }

  // v2.2 plan 05: fire-and-forget after a committed character reply, never a scheduler job. The judge
  // decides which established facts the reply broke; the note itself is composed in code.
  async runWardenPass(replyMessageId: number): Promise<boolean> {
    const settings = this.state.settings;
    const state = this.deps.getState();
    const warden = this.deps.warden;
    if (!warden || !state || !settings.wardenEnabled || settings.wardenAcceptMode === "off") return false;
    const reply = readReply(replyMessageId);
    if (!reply) return false;
    // The lapse happens before the in-flight guard: a newer reply supersedes an older unapplied note
    // whether or not this pass gets to ask, or a slow judge call leaves the stale note to inject.
    const lapsed = this.settleNotes((op, status) => op.replyMessageId < replyMessageId && status !== "applied", "lapsed");
    if (this.busy(this.wardenHold)) {
      if (lapsed) await this.save();
      return false;
    }
    const token = this.deps.ownership?.mint();
    const hold: PassHold = { token };
    this.wardenHold = hold;
    try {
      const established = warden.facts();
      const facts = established.map((fact) => fact.text);
      const note = facts.length ? await warden.check(reply, facts).catch(() => null) : null;
      // The reply-text comparison below catches an edit. It does not catch a chat switch landing on
      // a message with the same index and the same text, which is what the token is for.
      const owned = token ? this.deps.ownership?.check(token) : undefined;
      if (owned && owned.ok === false) return false;
      if (!note || readReply(replyMessageId)?.text !== reply.text) {
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
        reason: "continuity",
        summary: `${reply.speaker}'s reply contradicts ${note.facts.length === 1 ? "an established fact" : `${note.facts.length} established facts`}`,
        mode: settings.wardenAcceptMode,
        ops: [{
          op: { kind: "note", text: note.text, facts: note.facts, replyMessageId, sources: established.filter((fact) => note.facts.includes(fact.text)) },
          status: settings.wardenAcceptMode === "auto" ? "accepted" : "pending",
        }],
        dropped: [],
        // The warden read a reply against the fact list it was handed, so both travel as inputs and
        // the card can send the author back to the fact that was broken.
        provenance: { source: "curator", messageId: replyMessageId, boundary: state.boundary, pass: "continuity-warden", inputs: [{ store: "memory" as const, id: `reply:${replyMessageId}` }], validity: "live" },
      };
      this.patch({ proposals: capProposalRing([...this.state.proposals, record]) });
      this.deps.journal(`Continuity warden flagged ${reply.speaker}'s reply`, note.facts.join(" | "));
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
    if (dryRun === true || type === "quiet" || type === "impersonate" || !settings.wardenEnabled || settings.wardenAcceptMode === "off" || this.deps.warden?.nudgeActive()) return;
    const record = this.state.proposals.find((candidate) => candidate.curator === "warden" && candidate.ops.some((entry) => entry.status === "accepted"));
    const index = record ? record.ops.findIndex((candidate) => candidate.status === "accepted") : -1;
    const entry = record?.ops[index];
    if (!record || !entry || !isNoteOp(entry.op)) return;
    setStoryExtensionPrompt(INJECTION_REGISTRY.continuityNote.key, entry.op.text, INJECTION_REGISTRY.continuityNote.depth);
    this.noteActive = true;
    this.carriedNote = { recordId: record.id, index };
    this.deps.journal("Continuity note added to this reply's prompt", entry.op.facts.join(" | "));
  }

  // A stopped or reply-less generation leaves the note accepted, so it rides the next loud one.
  commitNote(rendered: boolean) {
    const carried = this.carriedNote;
    this.clearContinuityNote();
    if (!rendered || !carried) return;
    this.updateOps(carried.recordId, (current) => ({
      ...current,
      appliedAt: new Date().toISOString(),
      ops: current.ops.map((candidate, index) => (index === carried.index && candidate.status === "accepted" ? { ...candidate, status: "applied" as const } : candidate)),
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
