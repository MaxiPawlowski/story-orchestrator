import type { EngineState, NormalizedStory } from "@engine/index";
import type { SchedulerJob } from "@extraction/index";
import {
  createAgendaProposals, DEFAULT_MEANWHILE_ACCEPT_MODE, hasOpenAgenda, landAcceptedProposals, meanwhileDue, recordMeanwhilePass, storyTimeOf,
  type MeanwhileAcceptMode, type ProposalLanding,
} from "./agendaProposals";
import { beginRun, type RunOwnership } from "./runToken";
import type { RuntimeExtras } from "./types";

export interface MeanwhileProposer {
  propose(debugResponse?: string): Promise<{ ok: boolean }>;
  decide(id: string, status: "accepted" | "rejected", reason?: string): Promise<boolean>;
}

export interface MeanwhilePortDeps {
  getStory: () => NormalizedStory | null;
  getState: () => EngineState | null;
  extras: () => RuntimeExtras;
  ownership: RunOwnership;
  updateInjection: () => void;
  journal: (summary: string, note: string) => void;
  persist: () => Promise<void>;
  notify: () => void;
}

export const MEANWHILE_JOB_PRIORITY: SchedulerJob["priority"] = 4;

export function createMeanwhilePort(deps: MeanwhilePortDeps) {
  let proposer: MeanwhileProposer | null = null;
  const mode = (): MeanwhileAcceptMode => deps.extras().stagecraft.settings.meanwhileAcceptMode ?? DEFAULT_MEANWHILE_ACCEPT_MODE;
  const due = (boundary: number, event = true): boolean => {
    const state = deps.getState();
    const values = state?.blackboard.values ?? {};
    const input = { mode: mode(), boundary, openAgenda: hasOpenAgenda(deps.getStory(), values), storyTime: storyTimeOf(values), event };
    return Boolean(proposer && state) && meanwhileDue(deps.extras().agendaProposals, input);
  };
  return {
    attach(next: MeanwhileProposer | null) { proposer = next; },
    mode,
    due,
    schedule(trigger: string, place: (job: SchedulerJob) => unknown): boolean {
      const state = deps.getState();
      if (!state || !due(state.boundary)) return false;
      const extras = deps.extras();
      const storyTime = storyTimeOf(state.blackboard.values);
      const pass = { boundary: state.boundary, messageId: state.lastMessageId, reason: trigger, ...(storyTime !== undefined ? { storyTime } : {}) };
      extras.agendaProposals = recordMeanwhilePass(extras.agendaProposals ?? createAgendaProposals(), pass);
      place({
        priority: MEANWHILE_JOB_PRIORITY,
        reason: `meanwhile:${trigger}`,
        run: async () => {
          if (mode() === "off" || !proposer) return;
          await proposer.propose();
          if (mode() !== "auto") return;
          const waiting = (deps.extras().agendaProposals?.proposals ?? []).filter((proposal) => proposal.status === "proposed");
          for (const proposal of waiting) await proposer.decide(proposal.id, "accepted", "accepted automatically");
        },
      });
      return true;
    },
    async land(at: ProposalLanding): Promise<number> {
      const run = beginRun(deps.ownership);
      const extras = deps.extras();
      const current = extras.agendaProposals;
      if (!current) return 0;
      const next = landAcceptedProposals(current, at);
      if (next === current) return 0;
      const landed = next.proposals.filter((proposal, index) => proposal !== current.proposals[index]);
      extras.agendaProposals = next;
      deps.updateInjection();
      deps.journal(`${landed.length} meanwhile event(s) landed`, landed.map((proposal) => `${proposal.memberId}: ${proposal.text}`).join("\n"));
      await deps.persist();
      if (run.stillOwns()) deps.notify();
      return landed.length;
    },
    decide(id: string, status: "accepted" | "rejected", reason?: string): Promise<boolean> {
      return proposer ? proposer.decide(id, status, reason) : Promise.resolve(false);
    },
  };
}
