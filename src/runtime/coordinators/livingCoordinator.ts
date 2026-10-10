import { isValidationErrorList, parseStoryV2, type ApplyQueueEntry, type EngineState, type NormalizedStoryV2, type StoryV2 } from "@engine/index";
import type { ModelCall, SchedulerJob } from "@extraction/index";
import type { BranchOutcome, DirectorOutcome } from "@generation/living/direct";
import { branchTarget, hasLiveBranch, markBranched, nextBranchId, stepDivergence, unmarkBranched } from "@generation/living/divergence";
import { compactOps, dropOpsAfter, graphEpoch, livingRaw } from "@generation/living/fold";
import { findFrontier, livingAutonomy } from "@generation/living/frontier";
import { checkDirectorOps } from "@generation/living/plan";
import {
  createDivergenceState, createLivingState, LIVING_OP_CAP, LIVING_PREFETCH_WHY, LIVING_PROPOSAL_LIMIT,
  type DirectorProposal, type DivergenceReading, type DivergenceState, type LivingRuntimeState,
} from "@generation/living/types";
import { beginRun, type RunOwnership } from "../runToken";
import type { LivingInputs } from "../livingInputs";

export { livingAuthorView } from "../livingAuthorView";

type LivingUnit = typeof import("../livingUnit");
const loadUnit = (): Promise<LivingUnit> => import("../livingUnit");

export const LIVING_JOB_PRIORITY: SchedulerJob["priority"] = 3;

export interface LivingLoaded {
  raw: Record<string, unknown>;
  hash: string;
  storyId: string;
}

export interface LivingCoordinatorDeps {
  getStory: () => NormalizedStoryV2 | null;
  getState: () => EngineState | null;
  loaded: () => LivingLoaded | null;
  getLiving: () => LivingRuntimeState | undefined;
  setLiving: (next: LivingRuntimeState) => void;
  setPlayedRaw: (raw: Record<string, unknown>) => void;
  pruneExpansion: (story: NormalizedStoryV2) => number;
  discardUnknownPending: () => ApplyQueueEntry[];
  ensureActive: () => string | null;
  historyFloor: () => number | null;
  enabled: () => boolean;
  branching: () => boolean;
  prefetch: () => boolean;
  authorView: () => boolean;
  sealsOn: () => boolean;
  inputs: () => LivingInputs;
  recentTurns: () => Promise<string[]>;
  askDivergence: (story: NormalizedStoryV2, activeId: string) => Promise<{ none: boolean; p: number } | null>;
  saveRecord: (raw: StoryV2) => { ok: true; id: string; title: string } | { ok: false; reason: string };
  storyIdTaken: (id: string) => boolean;
  model: ModelCall;
  ownership: RunOwnership;
  journal: (summary: string, note: string) => void;
  persist: () => Promise<void>;
  notify: () => void;
}

export type LivingDecision = "accepted" | "rejected";

export interface LivingSaveOutcome {
  ok: boolean;
  id?: string;
  title?: string;
  excluded?: number;
  reason?: string;
}

type ProposalBase = Omit<DirectorProposal, "status" | "anchorId" | "draft" | "ops" | "issues" | "reason" | "attempts">;

const now = () => new Date().toISOString();

const isWaiting = (proposal: DirectorProposal) => proposal.status === "proposed" || proposal.status === "accepted";

const patchProposal = (state: LivingRuntimeState, id: string, patch: Partial<DirectorProposal>): LivingRuntimeState =>
  ({ ...state, proposals: state.proposals.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)) });

const proposalFrom = (outcome: DirectorOutcome | BranchOutcome, base: ProposalBase): DirectorProposal => {
  if (outcome.status === "ok") {
    const status = base.autonomy === "auto" ? "accepted" : "proposed";
    const anchorId = "anchorId" in outcome ? outcome.anchorId : outcome.stubId;
    return { ...base, status, anchorId, draft: outcome.draft, ops: outcome.ops, issues: [], reason: outcome.draft.reason, attempts: outcome.attempts };
  }
  const issues = outcome.status === "capped" ? [outcome.reason] : outcome.issues;
  return { ...base, status: "failed", anchorId: "", draft: null, ops: [], issues, reason: outcome.status, attempts: outcome.status === "capped" ? 0 : outcome.attempts };
};

const capProposals = (proposals: DirectorProposal[]): DirectorProposal[] => {
  const settled = proposals.filter((proposal) => !isWaiting(proposal)).slice(-LIVING_PROPOSAL_LIMIT);
  return proposals.filter((proposal) => isWaiting(proposal) || settled.includes(proposal));
};

export class LivingCoordinator {
  private inFlight = false;

  constructor(private readonly deps: LivingCoordinatorDeps) {}

  private get state(): LivingRuntimeState {
    return this.deps.getLiving() ?? createLivingState();
  }

  private get divergence(): DivergenceState {
    return this.state.divergence ?? createDivergenceState();
  }

  private write(next: LivingRuntimeState) {
    this.deps.setLiving({ ...next, proposals: capProposals(next.proposals) });
  }

  isLiving(): boolean {
    return Boolean(this.deps.getStory()?.living);
  }

  tracks(): boolean {
    return Boolean(this.deps.getLiving()?.authored);
  }

  adopt(mode: "activate" | "hydrate") {
    const loaded = this.deps.loaded();
    const current = this.deps.getLiving();
    if (!loaded) return;
    if (!current?.authored) {
      if (this.isLiving()) this.write({ ...(current ?? createLivingState()), authored: { raw: loaded.raw, hash: loaded.hash } });
      return;
    }
    if (mode !== "hydrate") return;
    const rebuilt = livingRaw(current);
    if (!rebuilt || JSON.stringify(rebuilt) === JSON.stringify(loaded.raw)) return;
    this.deps.journal("living story rebuilt from its history", "the pinned copy did not match the authored story plus the director's operations; the operations win");
    this.deps.setPlayedRaw(rebuilt);
  }

  frontier(): string | null {
    const story = this.deps.getStory();
    const state = this.deps.getState();
    if (!story?.living || !state) return null;
    return findFrontier(story, state.activeCheckpointId)?.frontierId ?? null;
  }

  private waitingNow(): boolean {
    const epoch = graphEpoch(this.state);
    return this.state.proposals.some((proposal) => isWaiting(proposal) && proposal.epoch === epoch);
  }

  private atCap(): boolean {
    return this.state.folded.length + this.state.ops.length >= LIVING_OP_CAP;
  }

  due(): boolean {
    if (!this.deps.enabled() || this.inFlight || !this.isLiving() || !this.state.authored || this.atCap()) return false;
    return Boolean(this.frontier()) && !this.waitingNow();
  }

  schedule(place: (job: SchedulerJob) => unknown): boolean {
    if (!this.due()) return false;
    place({ priority: LIVING_JOB_PRIORITY, reason: `living:${this.frontier() ?? "?"}`, run: async () => { await this.propose(); } });
    return true;
  }

  private autonomy(story: NormalizedStoryV2) {
    return this.deps.authorView() ? livingAutonomy(story) : "auto";
  }

  private async record(outcome: DirectorOutcome | BranchOutcome, base: ProposalBase, run: ReturnType<typeof beginRun>): Promise<DirectorProposal | null> {
    if (!run.stillOwns()) return null;
    if (graphEpoch(this.state) !== base.epoch) {
      this.deps.journal("living director answer discarded", "the story's graph changed while the director wrote; a fresh pass follows");
      return null;
    }
    const proposal = proposalFrom(outcome, base);
    const divergence = base.kind === "branch" && proposal.status !== "failed" ? markBranched(this.divergence, base.frontierId) : this.divergence;
    const lastPass = { boundary: proposal.boundary, frontierId: base.frontierId, at: base.at };
    this.write({ ...this.state, passes: this.state.passes + 1, lastPass, divergence, proposals: [...this.state.proposals, proposal] });
    const what = base.prepared ? "another way forward" : base.kind === "branch" ? "a branch" : "the next turning point";
    const verb = base.autonomy === "auto" ? "wrote" : "proposed";
    this.deps.journal(
      proposal.status === "failed" ? "living director wrote nothing" : `living director ${verb} ${what}`,
      proposal.status === "failed" ? proposal.issues.join("; ") : `after ${base.frontierId}: ${proposal.draft?.anchor.name ?? ""}${base.why ? ` (${base.why})` : ""}`,
    );
    await this.deps.persist();
    if (run.stillOwns()) this.deps.notify();
    return proposal;
  }

  private baseFor(story: NormalizedStoryV2, state: EngineState, frontierId: string): ProposalBase {
    return { id: `liv_p${this.state.passes + 1}`, epoch: graphEpoch(this.state), frontierId, boundary: state.boundary, messageId: state.lastMessageId, autonomy: this.autonomy(story), at: now() };
  }

  async propose(debugResponse?: string | null): Promise<DirectorProposal | null> {
    const story = this.deps.getStory();
    const state = this.deps.getState();
    const loaded = this.deps.loaded();
    const frontierId = this.frontier();
    if (!story?.living || !state || !loaded || !frontierId || this.inFlight) return null;
    const run = beginRun(this.deps.ownership);
    const base = this.baseFor(story, state, frontierId);
    this.inFlight = true;
    try {
      const unit = await loadUnit();
      const outcome = await unit.directNext({
        story, raw: loaded.raw, frontierId, state, sealsOn: this.deps.sealsOn(), inputs: this.deps.inputs(), model: this.deps.model,
        signal: run.signal, debugResponse: debugResponse ?? this.deps.model.planted?.("living") ?? null,
      });
      return await this.record(outcome, base, run);
    } finally {
      this.inFlight = false;
    }
  }

  async checkDivergence(at: { boundary: number; messageId: number }, place: (job: SchedulerJob) => unknown): Promise<boolean> {
    const story = this.deps.getStory();
    const state = this.deps.getState();
    if (!this.deps.branching() || this.inFlight || !story || !state || this.atCap() || this.waitingNow()) return false;
    const activeId = state.activeCheckpointId;
    if (!(story.outgoingByCheckpoint[activeId] ?? []).length || hasLiveBranch(story, activeId) || !branchTarget(story, activeId)) return false;
    const run = beginRun(this.deps.ownership);
    const refused = this.deps.inputs().refused;
    const judged = refused ? null : await this.deps.askDivergence(story, activeId);
    if (!run.stillOwns() || this.deps.getState()?.activeCheckpointId !== activeId) return false;
    const reading: DivergenceReading | null = refused
      ? { source: "refusal", none: true, p: null, boundary: at.boundary }
      : judged ? { source: "judge", none: judged.none, p: judged.p, boundary: at.boundary } : null;
    if (!reading) return false;
    const step = stepDivergence(this.divergence, activeId, reading);
    this.write({ ...this.state, divergence: step.state });
    if (!step.diverged || !step.reason) return false;
    const why = step.reason;
    place({ priority: LIVING_JOB_PRIORITY, reason: `living:branch:${activeId}`, run: async () => { await this.proposeBranch(why); } });
    return true;
  }

  prefetchDue(): boolean {
    const story = this.deps.getStory();
    const state = this.deps.getState();
    if (!this.deps.branching() || !this.deps.prefetch() || this.inFlight || !story || !state || this.atCap() || this.waitingNow()) return false;
    const activeId = state.activeCheckpointId;
    if (state.boundary < 1 || this.divergence.branchedFrom.includes(activeId) || !(story.outgoingByCheckpoint[activeId] ?? []).length) return false;
    return !hasLiveBranch(story, activeId) && Boolean(branchTarget(story, activeId));
  }

  prefetch(place: (job: SchedulerJob) => unknown): boolean {
    if (!this.prefetchDue()) return false;
    const activeId = this.deps.getState()?.activeCheckpointId ?? "?";
    place({ priority: LIVING_JOB_PRIORITY, reason: `living:prefetch:${activeId}`, run: async () => { await this.proposeBranch(LIVING_PREFETCH_WHY, null, true); } });
    return true;
  }

  async proposeBranch(why: string, debugResponse?: string | null, prepared = false): Promise<DirectorProposal | null> {
    const story = this.deps.getStory();
    const state = this.deps.getState();
    const loaded = this.deps.loaded();
    if (!story || !state || !loaded || this.inFlight) return null;
    const sourceId = state.activeCheckpointId;
    const targetId = branchTarget(story, sourceId);
    if (!targetId || hasLiveBranch(story, sourceId)) return null;
    const run = beginRun(this.deps.ownership);
    const base: ProposalBase = { ...this.baseFor(story, state, sourceId), kind: "branch", convergeTo: targetId, why, ...(prepared ? { prepared: true } : {}) };
    this.inFlight = true;
    try {
      const unit = await loadUnit();
      const outcome = await unit.branchNext({
        story, raw: loaded.raw, sourceId, targetId, branchId: nextBranchId(story), state, why, ...(prepared ? { prepared: true } : {}),
        recent: await this.deps.recentTurns(), inputs: this.deps.inputs(),
        model: this.deps.model, signal: run.signal, debugResponse: debugResponse ?? this.deps.model.planted?.("living") ?? null,
      });
      return await this.record(outcome, base, run);
    } finally {
      this.inFlight = false;
    }
  }

  async decide(id: string, status: LivingDecision, edit?: { name?: string; objective?: string }): Promise<boolean> {
    const proposal = this.state.proposals.find((entry) => entry.id === id);
    if (!proposal || proposal.status !== "proposed") return false;
    const run = beginRun(this.deps.ownership);
    if (proposal.epoch !== graphEpoch(this.state)) {
      this.withdraw("the story changed since this was written");
      await this.deps.persist();
      if (run.stillOwns()) this.deps.notify();
      return false;
    }
    const edited = status === "accepted" && edit && proposal.draft ? this.edited(proposal, edit) : proposal;
    if (!edited) return false;
    this.write(patchProposal(this.state, id, { ...edited, status, reason: status === "rejected" ? "rejected by the author" : edited.reason }));
    this.deps.journal(`living ${proposal.kind === "branch" ? "branch" : "turning point"} ${status}`, proposal.draft?.anchor.name ?? id);
    await this.deps.persist();
    if (run.stillOwns()) this.deps.notify();
    return true;
  }

  private edited(proposal: DirectorProposal, edit: { name?: string; objective?: string }): DirectorProposal | null {
    if (!proposal.draft) return null;
    const name = edit.name?.trim() || proposal.draft.anchor.name;
    const objective = edit.objective?.trim() || proposal.draft.anchor.objective;
    const ops = proposal.ops.map((op) => {
      if (op.kind === "add-checkpoint" && op.checkpoint.id === proposal.anchorId) return { ...op, checkpoint: { ...op.checkpoint, name, objective } };
      if (op.kind === "add-stub") return { ...op, checkpoint: { ...op.checkpoint, name: proposal.kind === "branch" ? name : `Toward ${name}`, objective } };
      return op;
    });
    return { ...proposal, ops, draft: { ...proposal.draft, anchor: { ...proposal.draft.anchor, name, objective } } };
  }

  async regenerate(id: string): Promise<DirectorProposal | null> {
    const proposal = this.state.proposals.find((entry) => entry.id === id);
    if (!proposal || !(proposal.status === "proposed" || proposal.status === "failed")) return null;
    const divergence = proposal.kind === "branch" ? unmarkBranched(this.divergence, [proposal.frontierId]) : this.divergence;
    this.write({ ...patchProposal(this.state, id, { status: "rejected", reason: "regenerated" }), divergence });
    return proposal.kind === "branch" ? this.proposeBranch(proposal.why ?? "regenerated by the author", null, proposal.prepared === true) : this.propose();
  }

  private withdraw(reason: string) {
    const withdrawn = this.state.proposals.filter(isWaiting);
    const branches = withdrawn.filter((proposal) => proposal.kind === "branch").map((proposal) => proposal.frontierId);
    this.write({
      ...this.state,
      divergence: branches.length ? unmarkBranched(this.divergence, branches) : this.divergence,
      proposals: this.state.proposals.map((proposal) => (isWaiting(proposal) ? { ...proposal, status: "withdrawn", reason } : proposal)),
    });
  }

  async applyAccepted(at: { boundary: number; messageId: number }): Promise<number> {
    const story = this.deps.getStory();
    const state = this.deps.getState();
    const loaded = this.deps.loaded();
    const accepted = this.state.proposals.filter((proposal) => proposal.status === "accepted");
    if (!story || !state || !loaded || !accepted.length) return 0;
    const run = beginRun(this.deps.ownership);
    const epoch = graphEpoch(this.state);
    let current: LivingRuntimeState = this.state.authored ? this.state : { ...this.state, authored: { raw: loaded.raw, hash: loaded.hash } };
    const applied: string[] = [];
    for (const proposal of accepted) {
      const stale = proposal.epoch !== epoch || applied.length > 0;
      const check = stale ? null : checkDirectorOps({
        raw: loaded.raw, story, frontierId: proposal.frontierId, ops: proposal.ops, values: state.blackboard.values, latched: state.blackboard.latched ?? {},
        ...(proposal.convergeTo ? { convergeTo: proposal.convergeTo } : {}),
      });
      if (!check || check.issues.length) {
        current = patchProposal(current, proposal.id, { status: "withdrawn", reason: check ? check.issues.join("; ") : "the story moved on before it applied" });
        continue;
      }
      const ops = proposal.ops.map((op, index) => ({ ...op, id: `${proposal.id}:${index}`, boundary: at.boundary, messageId: at.messageId, proposalId: proposal.id }));
      current = patchProposal({ ...current, ops: [...current.ops, ...ops] }, proposal.id, { status: "applied", appliedAt: at });
      applied.push(proposal.draft?.anchor.name ?? proposal.anchorId);
    }
    if (!run.stillOwns()) return 0;
    this.write(current);
    if (applied.length) {
      const raw = livingRaw(current);
      if (raw) this.deps.setPlayedRaw(raw);
      this.deps.journal(`the story grew: ${applied.length} director change(s) applied`, applied.join(", "));
    }
    await this.deps.persist();
    if (run.stillOwns()) this.deps.notify();
    return applied.length;
  }

  compact() {
    const floor = this.deps.historyFloor();
    if (floor === null || !this.state.ops.length) return;
    const next = compactOps(this.state, floor);
    if (next !== this.state) this.write(next);
  }

  restoreAfterRollback(boundary: number): number {
    if (!this.tracks()) return 0;
    const { state, dropped } = dropOpsAfter(this.state, boundary);
    const droppedBranches = state.proposals.filter((proposal) => proposal.kind === "branch" && dropped.some((op) => op.proposalId === proposal.id)).map((proposal) => proposal.frontierId);
    const divergence = { ...unmarkBranched(this.divergence, droppedBranches), streak: 0 };
    this.write({ ...state, divergence, epochBumps: state.epochBumps + (dropped.length ? 0 : 1) });
    this.withdraw("a rollback changed the story's future");
    if (!dropped.length) return 0;
    const raw = livingRaw(this.state);
    if (!raw) return 0;
    this.deps.setPlayedRaw(raw);
    const story = this.deps.getStory();
    const pruned = story ? this.deps.pruneExpansion(story) : 0;
    if (pruned) this.deps.setPlayedRaw(raw);
    const discarded = this.deps.discardUnknownPending();
    const lost = this.deps.ensureActive();
    const notes = [
      `${dropped.length} operation(s) after boundary ${boundary} undone`,
      ...(pruned ? [`${pruned} prepared stretch(es) toward them dropped`] : []),
      ...(discarded.length ? [`${discarded.length} pending write(s) for values the graph no longer declares discarded`] : []),
      ...(lost ? [lost] : []),
    ];
    this.deps.journal("living story stepped back", notes.join("; "));
    return dropped.length;
  }

  refold(authored: { raw: Record<string, unknown>; hash: string }): { raw: Record<string, unknown>; story: NormalizedStoryV2 } | { broken: string[] } {
    const raw = livingRaw({ ...this.state, authored });
    const parsed = raw ? parseStoryV2(raw) : null;
    if (!raw || !parsed || isValidationErrorList(parsed)) {
      return { broken: parsed && isValidationErrorList(parsed) ? parsed.slice(0, 4).map((error) => `${error.path}: ${error.message}`) : ["no authored copy"] };
    }
    return { raw, story: parsed };
  }

  commitAuthored(authored: { raw: Record<string, unknown>; hash: string }) {
    this.write({ ...this.state, authored, epochBumps: this.state.epochBumps + 1 });
    this.withdraw("the author updated the story");
  }

  async saveAsStory(options: { includeUnreached: boolean; title?: string }): Promise<LivingSaveOutcome> {
    const story = this.deps.getStory();
    const state = this.deps.getState();
    const loaded = this.deps.loaded();
    if (!story?.living || !state || !loaded) return { ok: false, reason: "this chat is not playing a living story" };
    const run = beginRun(this.deps.ownership);
    const includeUnreached = options.includeUnreached && this.deps.authorView();
    const unit = await loadUnit();
    if (!run.stillOwns()) return { ok: false, reason: "the chat changed before the story was saved" };
    const parsed = parseStoryV2(loaded.raw);
    if (isValidationErrorList(parsed)) return { ok: false, reason: "the played story does not validate" };
    const reached = new Set([...state.visitedPath, state.activeCheckpointId]);
    const title = options.title?.trim() || `${story.title} (played)`;
    const id = unit.livingExportId(loaded.storyId, this.deps.storyIdTaken);
    const projected = unit.projectLivingExport(loaded.raw, parsed, { reached, includeUnreached, id, title, scrub: this.deps.inputs().scrub });
    if (!projected.ok) {
      this.deps.journal("Save as story refused", projected.reason);
      return { ok: false, reason: projected.reason };
    }
    const saved = this.deps.saveRecord(projected.raw);
    if (!saved.ok) return { ok: false, reason: saved.reason };
    this.deps.journal(`saved the run as “${saved.title}”`, `${projected.excluded.length} unreached checkpoint(s) left out${includeUnreached ? " (author kept them)" : ""}`);
    this.deps.notify();
    return { ok: true, id: saved.id, title: saved.title, excluded: projected.excluded.length };
  }
}
