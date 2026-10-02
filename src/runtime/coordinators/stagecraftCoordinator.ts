import type { EngineState, NormalizedStoryV2 } from "@engine/index";
import { failureClass } from "@extraction/breaker";
import { askText, type ModelCall } from "@extraction/modelRoute";
import { maxTokensForInput } from "@extraction/callBudget";
import { cleanWindowMessage } from "@extraction/windowHygiene";
import {
  buildWiCuratorPrompt, curatorHasScope, curatorLorebooks, decidedOp, declinedOps, entriesForScope, isCheckpointGated,
  isNoteOp, capProposalRing, parseCuratorResponse, planCuratorProposal, type CuratorEntryView, type CuratorPassOutcome,
  type CuratorOp, type CuratorOpRecord, type CuratorOpStatus, type CuratorProposalRecord, type WardenNoteOp,
  forgetDecline, mergeDeclined, rememberDecline, standingDeclines,
  anyWardenFamily, composeWardenNote, newestCarriedNote, wardenFlagJournal, wardenNoteJournal, wardenNoteOps,
  wardenReason, wardenSummary, withdrawRemovedRules, type WardenCheckFinding, type WardenCheckInput,
  type WardenFamiliesActive, type WriteAheadCounts,
} from "@stagecraft/index";
import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import { beginRun, type RunGuard, type RunOwnership, type RunToken } from "../runToken";
import type { ChatHost, CuratorWiHost, PlayerHost, PromptHost } from "../hostPorts";
import type { StagecraftRuntimeState } from "../types";
import type { SpikeSettings } from "../settingsModel";
import type { EstablishedFact } from "../continuity";
import { CuratorWriter } from "../curatorWriter";
import { withholds } from "../generationLifecycle";
import { log } from "@utils/log";

// One curator pass every few boundaries at most: the reply path never waits for it, and a story that
// moves fast should not fund a model call per turn.
export const CURATOR_BOUNDARY_GAP = 4;

export interface StagecraftCoordinatorDeps {
  getStory: () => NormalizedStoryV2 | null;
  getState: () => EngineState | null;
  getStagecraft: () => StagecraftRuntimeState;
  setStagecraft: (next: StagecraftRuntimeState) => void;
  model: ModelCall;
  getCanon: () => string;
  getOpenArcs: () => string[];
  filterEntries?: (entries: CuratorEntryView[], context: { checkpoint: { name: string; objective: string }; canon: string; openThreads: string[] }) => Promise<CuratorEntryView[]>;
  warden?: {
    check: (input: WardenCheckInput) => Promise<WardenCheckFinding[] | null>;
    facts: () => EstablishedFact[];
    families?: () => Omit<WardenFamiliesActive, "continuity">;
    lore?: (replyMessageId: number) => NonNullable<WardenCheckInput["lore"]>;
    nudgeActive: () => boolean;
  };
  journal: (summary: string, note?: string) => void;
  spikes?: () => SpikeSettings;
  persist: () => Promise<void>;
  notify: () => void;
  // A curator pass reads the world, awaits a model for seconds, then writes
  // through `setStagecraft` — which resolves to whatever chat is current when the promise lands,
  // not the one the work belongs to. The token is minted before the awaits and checked at the
  // write edge. Optional so an existing caller keeps today's behaviour until it supplies one.
  ownership: RunOwnership;
  hosts: { prompt: PromptHost; chat: Pick<ChatHost, "chatRows">; player: PlayerHost; curator: CuratorWiHost };
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
const readReply = (chat: unknown[], messageId: number): { speaker: string; text: string } | null => {
  const raw = chat[messageId] as { name?: unknown } | undefined;
  const message = cleanWindowMessage(raw);
  if (!message.keep || message.isUser) return null;
  return { speaker: typeof raw?.name === "string" && raw.name ? raw.name : "Narrator", text: message.text };
};

const playerWroteBetween = (chat: unknown[], after: number, upTo: number): boolean => {
  for (let index = after + 1; index <= Math.min(upTo, chat.length - 1); index += 1) {
    const message = cleanWindowMessage(chat[index]);
    if (message.keep && message.isUser) return true;
  }
  return false;
};

const readPlayerLine = (chat: unknown[], replyMessageId: number): string | null => {
  for (let index = Math.min(replyMessageId, chat.length) - 1; index >= 0; index -= 1) {
    const message = cleanWindowMessage(chat[index]);
    if (message.keep && message.isUser) return message.text;
  }
  return null;
};

// Owns extras.stagecraft: the World Info curator's off-path pass, the review ring the author acts
// on, and the boundary write. It holds no engine or memory dependency **by construction** — a
// curator can never move the blackboard or a memory tier (spec addendum §Stagecraft).
interface PassHold {
  token: RunToken | undefined;
}

export class StagecraftCoordinator {
  private curatorHold: PassHold | null = null;
  private wardenHold: PassHold | null = null;
  private noteActive = false;
  private carriedNote: { recordId: string; indices: number[] } | null = null;
  private applying: Promise<unknown> = Promise.resolve();
  private readonly writer: CuratorWriter;

  constructor(private readonly deps: StagecraftCoordinatorDeps) {
    this.writer = new CuratorWriter({
      getStory: () => deps.getStory(), state: () => this.state, patch: (next) => this.patch(next), updateOps: (id, update) => this.updateOps(id, update),
      save: () => this.save(), journal: (summary) => deps.journal(summary), ownership: () => deps.ownership, host: () => deps.hosts.curator,
    });
  }

  /** A pass holds the coordinator only while its own world is still open — a slow pass started
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

  private spikesOn(): boolean {
    const flags = this.deps.spikes?.();
    return Boolean(flags?.sp8CuratorTiers);
  }

  private async spikeModules() {
    return { tiers: this.spikesOn() ? await import("@stagecraft/curatorTiers") : null };
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
      const loaded = await this.deps.hosts.curator.loadLorebook(lorebook);
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
      const declined = mergeDeclined(declinedOps(this.state.proposals, state.activeCheckpointId, state.checkpointStartedBoundary ?? 0, { rejected: false }),
          standingDeclines(this.state.declines ?? [], entries, state.boundary));
      const spikes = this.spikesOn() ? await this.spikeModules() : { tiers: null };
      const prompt = buildWiCuratorPrompt({ storyTitle: story.title, checkpointName, objective, canon, openArcs, entries: shown, declined });
      const response = await askText(this.deps.model, prompt, {
        role: "curator", pass: "curator",
        maxTokens: maxTokensForInput("curator", prompt),
        ...(this.deps.ownership.signal ? { signal: this.deps.ownership.signal() } : {}),
        debugResponse: debugResponse ?? null,
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
      const planned = planCuratorProposal(proposal, shown, { mode: this.state.settings.acceptMode, declined });
      const plan = spikes.tiers ? spikes.tiers.refuseProtected(planned, shown) : planned;
      this.patch({
        lastRunBoundary: state.boundary,
        lastError: null,
        lastPass: { at: new Date().toISOString(), reason, prompt, rawResponse: response,
            proposed: plan.records.length, dropped: plan.dropped,
            ...(shown.length < entries.length ? { focus: { shown: shown.length, total: entries.length } } : {}) },
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
        ops: spikes.tiers ? spikes.tiers.routeByTier(plan.records, shown, mode) : plan.records.map((entry) => (mode === "auto" ? { ...entry, status: "accepted" as const } : entry)),
        dropped: plan.dropped,
        refused: plan.refused,
        provenance: { source: "curator", messageId: state.lastMessageId, boundary: state.boundary,
            pass: `wi-curator:${reason}`, inputs: shown.map((entry) => ({ store: "memory" as const,
            id: `${entry.lorebook}#${entry.comment}` })), validity: "live" },
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
    const proposed = this.state.proposals.find((record) => record.id === id)?.ops[index];
    this.updateOps(id, (record) => ({
      ...record,
      ops: record.ops.map((entry, entryIndex) => (entryIndex === index ? { ...entry, status, op: decidedOp(entry, status, op) } : entry)),
    }));
    this.recordDeclines(proposed ? [proposed] : [], status);
    await this.save();
  }

  async decideProposal(id: string, status: "accepted" | "rejected") {
    this.recordDeclines(this.state.proposals.find((record) => record.id === id)?.ops.filter((entry) => entry.status === "pending") ?? [], status);
    this.updateOps(id, (record) => ({ ...record, ops: record.ops.map((entry) => (entry.status === "pending" ? { ...entry, status, op: decidedOp(entry, status) } : entry)) }));
    await this.save();
  }

  private recordDeclines(proposed: CuratorOpRecord[], status: "accepted" | "rejected") {
    const boundary = this.deps.getState()?.boundary ?? 0;
    const current = this.state.declines ?? [];
    const declines = proposed.reduce((list, entry) => (status === "rejected" ? rememberDecline(list, entry, boundary) : forgetDecline(list, entry.op)), current);
    if (declines !== current) this.patch({ declines });
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
    const guard = this.deps.spikes?.().sp8CuratorTiers ? (await import("@stagecraft/curatorTiers")).protectedRefusal : undefined;
    if (run.lapsed()) return 0;
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
        const result = await this.writer.writeOp(story, entry, run, messageId, async (pending) => this.writer.markWriteAhead(record.id, index, pending), guard);
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

  reconcileWriteAhead(): Promise<WriteAheadCounts> { return this.writer.reconcileWriteAhead(); }

  revertAppliedSince(messageId: number): Promise<number> {
    return this.writer.revertAppliedSince(messageId, this.settleNotes((op) => op.replyMessageId >= messageId, "reverted"));
  }

  // Fire-and-forget after a committed character reply, never a scheduler job. The judge
  // decides which established facts the reply broke; the note itself is composed in code.
  private activeFamilies(): WardenFamiliesActive {
    const extra = this.deps.warden?.families?.() ?? { agency: false, houseRules: [] };
    const continuity = this.state.settings.wardenEnabled;
    return { continuity, agency: extra.agency, houseRules: extra.houseRules, lore: continuity && extra.lore === true };
  }

  // A story swap that drops a rule withdraws the unapplied notes that named it.
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
    const reply = readReply(this.deps.hosts.chat.chatRows(), replyMessageId);
    if (!reply) return false;
    const rows = this.deps.hosts.chat.chatRows();
    const moved = (op: WardenNoteOp) => op.replyMessageId < replyMessageId && playerWroteBetween(rows, op.replyMessageId, replyMessageId);
    const lapsed = this.settleNotes((op, status) => moved(op) && status !== "applied", "lapsed") + this.withdrawRemovedRules();
    if (this.busy(this.wardenHold)) {
      if (lapsed) await this.save();
      return false;
    }
    const token = this.deps.ownership.mint();
    const hold: PassHold = { token };
    this.wardenHold = hold;
    try {
      const established = families.continuity ? warden.facts() : [];
      const playerLine = families.agency ? readPlayerLine(this.deps.hosts.chat.chatRows(), replyMessageId) : null;
      const input: WardenCheckInput = { reply, facts: established.map((fact) => fact.text),
          agency: playerLine !== null ? { player: this.deps.hosts.player.getPlayerName(),
          message: playerLine } : null, houseRules: families.houseRules };
      const lore = families.lore ? warden.lore?.(replyMessageId) ?? [] : [];
      if (lore.length) input.lore = lore;
      const asks = input.facts.length > 0 || input.agency !== null || input.houseRules.length > 0 || lore.length > 0;
      const findings = asks ? await warden.check(input).catch((error: unknown) => {
        log.warn("continuity warden: the check failed", error);
        return null;
      }) : null;
      const owned = token ? this.deps.ownership.check(token) : undefined;
      if (owned && owned.ok === false) return false;
      if (!findings?.length || readReply(this.deps.hosts.chat.chatRows(), replyMessageId)?.text !== reply.text) {
        if (lapsed) await this.save();
        return false;
      }
      const record: CuratorProposalRecord = {
        id: uniqueRecordId(`warden-${state.boundary}-${replyMessageId}`, this.state.proposals),
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
        provenance: { source: "curator", messageId: replyMessageId, boundary: state.boundary,
            pass: "continuity-warden", inputs: [{ store: "memory" as const, id: `reply:${replyMessageId}` }],
            validity: "live" },
      };
      this.patch({ proposals: capProposalRing([...this.state.proposals, record]) });
      this.deps.journal(...wardenFlagJournal(reply.speaker, findings));
      await this.save();
      return true;
    } finally {
      if (this.wardenHold === hold) this.wardenHold = null;
    }
  }

  // A note is about one reply: once the player has written again and a newer reply came, an unapplied
  // one is moot ("lapsed"); a group round's later replies never lapse it. A rollback past its reply
  // withdraws it whatever its state ("reverted").
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
  // generation closes with its own reply. The author's own nudge wins a shared generation,
  // and the note waits for the next one.
  onGenerationStarted(type: unknown, dryRun: unknown) {
    const settings = this.state.settings;
    if (dryRun === true || withholds(type) || settings.wardenAcceptMode === "off" || this.deps.warden?.nudgeActive()) return;
    this.withdrawRemovedRules();
    const active = this.activeFamilies();
    const carried = newestCarriedNote(this.state.proposals, active);
    if (!carried) return;
    const ops = carried.indices.map((index) => carried.record.ops[index].op).filter(isNoteOp);
    this.deps.hosts.prompt.setStoryExtensionPrompt(INJECTION_REGISTRY.continuityNote.key, composeWardenNote(ops), INJECTION_REGISTRY.continuityNote.depth);
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
    this.deps.hosts.prompt.clearStoryExtensionPrompt(INJECTION_REGISTRY.continuityNote.key);
    this.noteActive = false;
  }
}
