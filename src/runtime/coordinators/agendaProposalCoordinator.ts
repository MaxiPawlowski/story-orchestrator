import type { EngineState, NormalizedStoryV2 } from "@engine/index";
import { askText, type ModelCall } from "@extraction/modelRoute";
import { fnv1a } from "../hash";
import { createAgendaProposals, PROPOSAL_RING_CAP, type AgendaProposalsState, type MeanwhileProposal } from "../agendaProposals";
import { buildMeanwhilePrompt, parseMeanwhile, type MeanwhileParse } from "../meanwhilePrompt";
import { beginRun, type RunOwnership } from "../runToken";

export const MEANWHILE_MAX_TOKENS = 300;

export interface AgendaProposalDeps {
  getStory: () => NormalizedStoryV2 | null;
  getState: () => EngineState | null;
  getProposals: () => AgendaProposalsState | undefined;
  setProposals: (next: AgendaProposalsState) => void;
  window: (from: number, to: number) => Array<{ speaker: string; text: string }>;
  model: () => ModelCall;
  ownership: RunOwnership;
  journal: (summary: string, note: string) => void;
  updateInjection: () => void;
  persist: () => Promise<void>;
  notify: () => void;
}

export type ProposeOutcome = { ok: true; added: MeanwhileProposal[]; refused: MeanwhileParse["refused"] } | { ok: false; reason: string };

export class AgendaProposalCoordinator {
  constructor(private readonly deps: AgendaProposalDeps) {}

  private get state(): AgendaProposalsState {
    return this.deps.getProposals() ?? createAgendaProposals();
  }

  async propose(debugResponse?: string): Promise<ProposeOutcome> {
    const story = this.deps.getStory();
    const state = this.deps.getState();
    if (!story?.life?.members.some((member) => member.agenda.length) || !state) return { ok: false, reason: "this story has no agendas" };
    const window = { from: Math.max(0, state.lastMessageId - 7), to: state.lastMessageId };
    const run = beginRun(this.deps.ownership, window);
    const prompt = buildMeanwhilePrompt(story, state.blackboard.values, this.deps.window(window.from, window.to));
    const reply = await askText(this.deps.model(), prompt, { role: "curator", pass: "curator", maxTokens: MEANWHILE_MAX_TOKENS, signal: run.signal, debugResponse });
    if (!run.stillOwns()) return { ok: false, reason: `the chat moved on (${run.lapsed()})` };
    const parsed = parseMeanwhile(reply, story);
    const added = parsed.proposals.map((proposal): MeanwhileProposal => ({
      ...proposal, id: fnv1a(`${state.boundary}:${proposal.memberId}:${proposal.agendaId}:${proposal.text}`), public: false,
      reason: "proposed by the meanwhile curator", sourceWindow: window, boundary: state.boundary, status: "proposed",
    }));
    const known = new Set(this.state.proposals.map((proposal) => proposal.id));
    this.deps.setProposals({ proposals: [...this.state.proposals, ...added.filter((proposal) => !known.has(proposal.id))].slice(-PROPOSAL_RING_CAP) });
    if (parsed.refused.length) this.deps.journal(`${parsed.refused.length} meanwhile line(s) refused`, parsed.refused.map((entry) => `${entry.reason}: ${entry.line}`).join("\n"));
    await this.deps.persist();
    if (run.stillOwns()) this.deps.notify();
    return { ok: true, added, refused: parsed.refused };
  }

  async decide(id: string, status: "accepted" | "rejected", reason = ""): Promise<boolean> {
    const run = beginRun(this.deps.ownership);
    const proposal = this.state.proposals.find((entry) => entry.id === id && entry.status === "proposed");
    if (!proposal) return false;
    this.deps.setProposals({ proposals: this.state.proposals.map((entry) => (entry === proposal ? { ...entry, status, ...(reason ? { decision: reason } : {}) } : entry)) });
    if (status === "rejected") this.deps.journal(`Meanwhile event rejected for ${proposal.memberId}`, reason || proposal.text);
    this.deps.updateInjection();
    await this.deps.persist();
    if (run.stillOwns()) this.deps.notify();
    return true;
  }
}
