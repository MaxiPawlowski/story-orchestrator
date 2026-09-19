import type { EngineState, NormalizedStoryV2 } from "@engine/index";
import { callExtractionModel } from "@extraction/client";
import {
  buildWiCuratorPrompt,
  curatorHasScope,
  curatorLorebooks,
  entriesForScope,
  isCheckpointGated,
  isCuratorWritable,
  parseCuratorResponse,
  planCuratorProposal,
  previewCuratorOp,
  CURATOR_PROPOSAL_LIMIT,
  type CuratorEntryView,
  type CuratorPassOutcome,
  type CuratorOp,
  type CuratorOpRecord,
  type CuratorProposalRecord,
} from "@stagecraft/index";
import { disableWIEntry, enableWIEntry, loadLorebook, upsertWIEntry } from "@services/STAPI";
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
  journal: (summary: string, note?: string) => void;
  persist: () => Promise<void>;
  notify: () => void;
}

const acceptedOps = (record: CuratorProposalRecord) => record.ops.filter((entry) => entry.status === "accepted");

// Owns extras.stagecraft: the World Info curator's off-path pass, the review ring the author acts
// on, and the boundary write. It holds no engine or memory dependency **by construction** — a
// curator can never move the blackboard or a memory tier (spec addendum §Stagecraft).
export class StagecraftCoordinator {
  private inFlight = false;

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
      const prompt = buildWiCuratorPrompt({
        storyTitle: story.title,
        checkpointName: checkpoint?.name ?? state.activeCheckpointId,
        objective: checkpoint?.objective ?? "",
        canon: this.deps.getCanon(),
        openArcs: this.deps.getOpenArcs(),
        entries,
      });
      const response = await callExtractionModel(prompt, {
        profileId: this.deps.getExtractionSettings().profileId,
        debugResponse: debugResponse ?? globalThis.storyOrchestratorDebugCuratorResponse ?? null,
      });
      const proposal = parseCuratorResponse(response, entries);
      const plan = planCuratorProposal(proposal, entries);
      this.patch({
        lastRunBoundary: state.boundary,
        lastError: null,
        lastPass: { at: new Date().toISOString(), reason, prompt, rawResponse: response, proposed: plan.records.length, dropped: plan.dropped },
      });
      if (!plan.records.length && !plan.dropped.length) {
        await this.save();
        return { ran: true, record: null };
      }
      const mode = this.state.settings.acceptMode;
      const record: CuratorProposalRecord = {
        id: `wi-${state.boundary}-${state.lastMessageId}`,
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
      this.patch({ proposals: [...this.state.proposals, record].slice(-CURATOR_PROPOSAL_LIMIT) });
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
        if (entry.status !== "accepted") {
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
    const affected = this.state.proposals.filter((record) => record.appliedAt && record.messageId >= messageId);
    if (!story || !affected.length) return 0;
    let reverted = 0;
    for (const record of affected) {
      for (const entry of [...record.ops].reverse()) {
        if (entry.status !== "applied" || !entry.before || !isCuratorWritable(story, entry.op.lorebook, entry.op.comment)) continue;
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
}
