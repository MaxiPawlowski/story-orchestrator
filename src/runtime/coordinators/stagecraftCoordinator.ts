import type { EngineState, NormalizedStoryV2 } from "@engine/index";
import { callExtractionModel } from "@extraction/client";
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
import { clearStoryExtensionPrompt, disableWIEntry, enableWIEntry, getContext, loadLorebook, setStoryExtensionPrompt, upsertWIEntry } from "@services/STAPI";
import type { ExtractionRuntimeSettings, StagecraftRuntimeState } from "../types";

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
  warden?: { check: (reply: { speaker: string; text: string }, facts: string[]) => Promise<{ facts: string[]; text: string } | null>; facts: () => string[]; nudgeActive: () => boolean };
  journal: (summary: string, note?: string) => void;
  persist: () => Promise<void>;
  notify: () => void;
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
export class StagecraftCoordinator {
  private inFlight = false;
  private wardenInFlight = false;
  private noteActive = false;

  constructor(private readonly deps: StagecraftCoordinatorDeps) {}

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
    return this.curatorEnabled && !this.inFlight && boundary - this.state.lastRunBoundary >= CURATOR_BOUNDARY_GAP;
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
    if (this.inFlight) return { ran: false, skipped: "in-flight", record: null };
    this.inFlight = true;
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
        debugResponse: debugResponse ?? globalThis.storyOrchestratorDebugCuratorResponse ?? null,
      });
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
      };
      this.patch({ proposals: capProposalRing([...this.state.proposals, record]) });
      this.deps.journal(`World Info curator proposed ${record.ops.length} change(s) at ${checkpoint?.name ?? state.activeCheckpointId}`, record.summary);
      await this.save();
      return { ran: true, record };
    } catch (error) {
      this.patch({ lastError: error instanceof Error ? error.message : "Curator pass failed" });
      await this.save();
      return { ran: true, record: null };
    } finally {
      this.inFlight = false;
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

  // Boundary-applied, like every other effect: an accepted change reaches World Info here and
  // nowhere else, and the allowlist is re-checked at the write edge.
  async applyAccepted(): Promise<number> {
    const story = this.deps.getStory();
    if (!story || !this.state.proposals.some((record) => acceptedOps(record).length)) return 0;
    const messageId = this.deps.getState()?.lastMessageId ?? -1;
    const entries = await this.readScope();
    let applied = 0;
    const proposals: CuratorProposalRecord[] = [];
    for (const record of this.state.proposals) {
      if (!acceptedOps(record).length) {
        proposals.push(record);
        continue;
      }
      const ops: CuratorOpRecord[] = [];
      for (const entry of record.ops) {
        if (entry.status !== "accepted" || isNoteOp(entry.op)) {
          ops.push(entry);
          continue;
        }
        const result = await this.writeOp(story, entry, entries);
        if (result.ok) applied += 1;
        ops.push(result.record);
      }
      proposals.push({ ...record, ops, appliedAt: new Date().toISOString(), messageId });
    }
    this.patch({ proposals });
    if (applied) this.deps.journal(`World Info curator applied ${applied} change(s)`, proposals[proposals.length - 1]?.summary);
    await this.save();
    return applied;
  }

  private async writeOp(story: NormalizedStoryV2, entry: CuratorOpRecord, entries: CuratorEntryView[]): Promise<{ ok: boolean; record: CuratorOpRecord }> {
    const op = entry.op;
    if (isNoteOp(op)) return { ok: false, record: entry };
    if (!isCuratorWritable(story, op.lorebook, op.comment)) {
      const message = isCheckpointGated(story, op.lorebook, op.comment)
        ? `"${op.comment}" is switched by checkpoint effects, which alone decide it`
        : `"${op.lorebook}" is not on this story's stagecraft allowlist`;
      return { ok: false, record: { ...entry, status: "failed", message } };
    }
    const live = entries.find((candidate) => candidate.lorebook.toLowerCase() === op.lorebook.toLowerCase() && candidate.comment.toLowerCase() === op.comment.toLowerCase());
    const preview = previewCuratorOp(op, live);
    if (!preview.ok) return { ok: false, record: { ...entry, status: "failed", message: preview.message } };
    const before = { content: live?.content ?? "", disabled: live?.disabled === true };
    try {
      if (op.kind === "enable" || op.kind === "disable") {
        const found = op.kind === "enable" ? await enableWIEntry(op.lorebook, op.comment) : await disableWIEntry(op.lorebook, op.comment);
        if (!found) return { ok: false, record: { ...entry, status: "failed", message: `"${op.comment}" is not in "${op.lorebook}"` } };
      } else {
        const result = await upsertWIEntry(op.lorebook, op.comment, preview.content ?? "", live?.keys ?? []);
        if (result === "failed") return { ok: false, record: { ...entry, status: "failed", message: `could not write "${op.comment}"` } };
        // upsertWIEntry always re-enables what it writes: keep an entry the author had switched off.
        if (before.disabled) await disableWIEntry(op.lorebook, op.comment);
      }
      return { ok: true, record: { ...entry, status: "applied", message: preview.message, before } };
    } catch (error) {
      return { ok: false, record: { ...entry, status: "failed", message: error instanceof Error ? error.message : "write failed" } };
    }
  }

  // A rollback undoes the story; a curator write made after that point has to go with it. The
  // pre-write content is recorded on the op, so putting it back needs no history of its own.
  async revertAppliedSince(messageId: number): Promise<number> {
    const story = this.deps.getStory();
    const withdrawn = this.settleNotes((op) => op.replyMessageId >= messageId, "reverted");
    const affected = this.state.proposals.filter((record) => record.curator !== "warden" && record.appliedAt && record.messageId >= messageId);
    if (!story || !affected.length) {
      if (withdrawn) await this.save();
      return 0;
    }
    let reverted = 0;
    for (const record of affected) {
      for (const entry of [...record.ops].reverse()) {
        if (isNoteOp(entry.op) || entry.status !== "applied" || !entry.before || !isCuratorWritable(story, entry.op.lorebook, entry.op.comment)) continue;
        if (entry.op.kind === "rewrite" || entry.op.kind === "patch") await upsertWIEntry(entry.op.lorebook, entry.op.comment, entry.before.content);
        if (entry.before.disabled) await disableWIEntry(entry.op.lorebook, entry.op.comment);
        else await enableWIEntry(entry.op.lorebook, entry.op.comment);
        reverted += 1;
      }
    }
    const rolledBack = new Set(affected.map((record) => record.id));
    this.patch({ proposals: this.state.proposals.filter((record) => !rolledBack.has(record.id)) });
    if (reverted) this.deps.journal(`World Info curator changes rolled back (${reverted})`);
    await this.save();
    return reverted;
  }

  // v2.2 plan 05: fire-and-forget after a committed character reply, never a scheduler job. The judge
  // decides which established facts the reply broke; the note itself is composed in code.
  async runWardenPass(replyMessageId: number): Promise<boolean> {
    const settings = this.state.settings;
    const state = this.deps.getState();
    const warden = this.deps.warden;
    if (!warden || !state || !settings.wardenEnabled || settings.wardenAcceptMode === "off" || this.wardenInFlight) return false;
    const reply = readReply(replyMessageId);
    if (!reply) return false;
    const lapsed = this.settleNotes((op, status) => op.replyMessageId < replyMessageId && status !== "applied", "lapsed");
    this.wardenInFlight = true;
    try {
      const facts = warden.facts();
      const note = facts.length ? await warden.check(reply, facts).catch(() => null) : null;
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
        ops: [{ op: { kind: "note", text: note.text, facts: note.facts, replyMessageId }, status: settings.wardenAcceptMode === "auto" ? "accepted" : "pending" }],
        dropped: [],
      };
      this.patch({ proposals: capProposalRing([...this.state.proposals, record]) });
      this.deps.journal(`Continuity warden flagged ${reply.speaker}'s reply`, note.facts.join(" | "));
      await this.save();
      return true;
    } finally {
      this.wardenInFlight = false;
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

  // An accepted note rides exactly one loud generation: set here, cleared when it ends. The author's
  // own nudge wins a shared generation, and the note waits for the next one.
  onGenerationStarted(type: unknown, dryRun: unknown) {
    if (dryRun === true || type === "quiet" || type === "impersonate" || !this.state.settings.wardenEnabled || this.deps.warden?.nudgeActive()) return;
    const record = this.state.proposals.find((candidate) => candidate.curator === "warden" && candidate.ops.some((entry) => entry.status === "accepted"));
    const entry = record?.ops.find((candidate) => candidate.status === "accepted");
    if (!record || !entry || !isNoteOp(entry.op)) return;
    setStoryExtensionPrompt(INJECTION_REGISTRY.continuityNote.key, entry.op.text, INJECTION_REGISTRY.continuityNote.depth);
    this.noteActive = true;
    this.updateOps(record.id, (current) => ({ ...current, appliedAt: new Date().toISOString(), ops: current.ops.map((candidate) => (candidate === entry ? { ...candidate, status: "applied" as const } : candidate)) }));
    this.deps.journal("Continuity note added to this reply's prompt", entry.op.facts.join(" | "));
    void this.save();
  }

  clearContinuityNote() {
    if (!this.noteActive) return;
    clearStoryExtensionPrompt(INJECTION_REGISTRY.continuityNote.key);
    this.noteActive = false;
  }
}
