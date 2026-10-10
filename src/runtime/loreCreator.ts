import type { EngineState, NormalizedStoryV2 } from "@engine/index";
import { failureClass } from "@extraction/breaker";
import { askText, type ModelCall } from "@extraction/modelRoute";
import { maxTokensForInput } from "@extraction/callBudget";
import {
  buildCreateCandidatePrompt, capProposalRing, createCapFor, curatorHasScope, curatorLorebooks, entriesForScope, isCreateOp, isCuratorHidden, newEntriesText, planCreateProposal,
  type CreateEligibility, type CuratorEntryView, type CuratorPassOutcome, type CuratorProposalRecord,
} from "@stagecraft/index";
import type { CuratorWiHost } from "./hostPorts";
import type { RunOwnership, RunToken } from "./runToken";
import type { StagecraftRuntimeState } from "./types";

export type LoreCreateSkip = "disabled" | "no-scope" | "in-flight" | "cap-reached" | "few-facts" | "not-measured";

export interface LoreCreateOutcome {
  ran: boolean;
  skipped?: LoreCreateSkip;
  record: CuratorProposalRecord | null;
  discarded?: CuratorPassOutcome["discarded"];
}

export interface LoreCreatorDeps {
  getStory: () => NormalizedStoryV2 | null;
  getState: () => EngineState | null;
  state: () => StagecraftRuntimeState;
  patch: (next: Partial<StagecraftRuntimeState>) => void;
  save: () => Promise<void>;
  journal: (summary: string, note?: string) => void;
  ownership: () => RunOwnership;
  model: ModelCall;
  getCanon: () => string;
  getOpenArcs: () => string[];
  host: () => Pick<CuratorWiHost, "loadLorebook">;
  uniqueId: (base: string) => string;
  lore?: {
    facts: () => string[];
    roster: () => string[];
    eligibility: () => CreateEligibility;
  };
}

// The Lore-creation role's own pass: a new keyed entry for something play has established,
// proposed only. Every card waits for the author (no accept mode takes one), and contract B
// refuses a title or first key that fewer than two live facts name.
export class LoreCreator {
  private hold: { token: RunToken } | null = null;

  constructor(private readonly deps: LoreCreatorDeps) {}

  pendingCreates(): number {
    return this.deps.state().proposals.reduce((sum, record) => sum + record.ops.filter((entry) => isCreateOp(entry.op) && (entry.status === "pending" || entry.status === "accepted")).length, 0);
  }

  private skip(): LoreCreateSkip | null {
    const story = this.deps.getStory();
    const { settings, created } = this.deps.state();
    if (!story || !this.deps.getState() || !this.deps.lore || !settings.curatorEnabled || !settings.createEnabled || settings.acceptMode === "off") return "disabled";
    if (!curatorHasScope(story)) return "no-scope";
    if (this.hold && this.deps.ownership().check(this.hold.token).ok !== false) return "in-flight";
    if ((created ?? []).length + this.pendingCreates() >= createCapFor(story)) return "cap-reached";
    if (this.deps.lore.facts().length < 2) return "few-facts";
    return null;
  }

  private async readBooks(story: NormalizedStoryV2): Promise<{ shown: CuratorEntryView[]; hidden: CuratorEntryView[] }> {
    const views: CuratorEntryView[] = [];
    for (const lorebook of curatorLorebooks(story)) {
      const loaded = await this.deps.host().loadLorebook(lorebook);
      if (loaded?.entries) views.push(...entriesForScope(lorebook, Object.values(loaded.entries)));
    }
    const hidden = views.filter((view) => isCuratorHidden(story, view.lorebook, view.comment));
    return { shown: views.filter((view) => !hidden.includes(view)), hidden };
  }

  private declined(state: EngineState) {
    return this.deps.state().proposals.filter((record) => record.checkpointId === state.activeCheckpointId && record.boundary >= (state.checkpointStartedBoundary ?? 0))
      .flatMap((record) => record.ops.flatMap((entry) => (entry.status === "rejected" && isCreateOp(entry.op) ? [entry.op] : [])));
  }

  async run(reason = "curator", debugResponse?: string): Promise<LoreCreateOutcome> {
    const skipped = this.skip();
    const story = this.deps.getStory();
    const state = this.deps.getState();
    const lore = this.deps.lore;
    if (skipped || !story || !state || !lore) return { ran: false, skipped: skipped ?? "disabled", record: null };
    const eligibility = lore.eligibility();
    if (this.deps.state().settings.createRequireMeasured && eligibility.state !== "measured") {
      const refused = { at: new Date().toISOString(), reason: `refused: ${eligibility.detail}`, prompt: "", rawResponse: "", proposed: 0, dropped: [] };
      this.deps.patch({ lastCreateBoundary: state.boundary, lastCreatePass: refused });
      this.deps.journal("Lore creation refused before any call: its route is not measured", eligibility.detail);
      await this.deps.save();
      return { ran: false, skipped: "not-measured", record: null };
    }
    const ownership = this.deps.ownership();
    const hold = { token: ownership.mint() };
    this.hold = hold;
    try {
      const { shown: scoped, hidden } = await this.readBooks(story);
      const checkpoint = story.checkpointById[state.activeCheckpointId];
      const context = { allowlist: curatorLorebooks(story), entries: scoped, hidden, roster: lore.roster(), facts: lore.facts() };
      const prompt = buildCreateCandidatePrompt({
        storyTitle: story.title, checkpointName: checkpoint?.name ?? state.activeCheckpointId, objective: checkpoint?.objective ?? "",
        canon: this.deps.getCanon(), openArcs: this.deps.getOpenArcs(), entries: scoped,
      }, context);
      const response = await askText(this.deps.model, prompt, {
        role: "lore", pass: "loreCreate", maxTokens: maxTokensForInput("curator", prompt),
        ...(ownership.signal ? { signal: ownership.signal() } : {}), debugResponse: debugResponse ?? null,
      });
      const owned = ownership.check(hold.token);
      if (owned.ok === false) {
        this.deps.journal(`Lore creation result discarded (${owned.reason})`, owned.detail);
        return { ran: true, record: null, discarded: owned.reason };
      }
      const used = (this.deps.state().created ?? []).length + this.pendingCreates();
      const plan = planCreateProposal(response, context, { story, cap: createCapFor(story), used, declined: this.declined(state) });
      const audit = { at: new Date().toISOString(), reason, prompt, rawResponse: response, proposed: plan.records.length, dropped: plan.dropped };
      this.deps.patch({ lastCreateBoundary: state.boundary, lastCreatePass: audit });
      if (!plan.records.length && !plan.dropped.length) {
        await this.deps.save();
        return { ran: true, record: null };
      }
      const titles = plan.records.flatMap((entry) => (isCreateOp(entry.op) ? [`"${entry.op.comment}"`] : []));
      const record: CuratorProposalRecord = {
        id: this.deps.uniqueId(`lore-${state.boundary}-${state.lastMessageId}`), curator: "wi", at: new Date().toISOString(),
        boundary: state.boundary, messageId: state.lastMessageId, checkpointId: state.activeCheckpointId, reason: "lore creation",
        summary: titles.length ? `New lorebook entries proposed: ${titles.join(", ")}` : "No new entry survived the checks",
        mode: "review", ops: plan.records, dropped: plan.dropped, refused: plan.refused,
        provenance: { source: "curator", messageId: state.lastMessageId, boundary: state.boundary, pass: "lore-create", validity: "live" },
      };
      this.deps.patch({ proposals: capProposalRing([...this.deps.state().proposals, record]) });
      this.deps.journal(`Lore creation proposed ${newEntriesText(titles.length)} (${eligibility.state})`, record.summary);
      await this.deps.save();
      return { ran: true, record };
    } catch (error) {
      const owned = ownership.check(hold.token);
      if (owned.ok === false) return { ran: true, record: null, discarded: owned.reason };
      this.deps.patch({ lastError: error instanceof Error ? error.message : "Lore creation failed" });
      await this.deps.save();
      if (failureClass(error) === "transport") throw error;
      return { ran: true, record: null };
    } finally {
      if (this.hold === hold) this.hold = null;
    }
  }
}
