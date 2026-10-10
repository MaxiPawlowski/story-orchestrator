import type { EngineState, NormalizedStoryV2 } from "@engine/index";
import type { SchedulerJob } from "@extraction/index";
import {
  createAgendaProposals, DEFAULT_MEANWHILE_ACCEPT_MODE, hasOpenAgenda, landAcceptedProposals, meanwhileDue, recordMeanwhilePass,
  type MeanwhileAcceptMode, type ProposalLanding,
} from "./agendaProposals";
import { beginRun, type RunOwnership } from "./runToken";
import type { RuntimeExtras } from "./types";

export interface MeanwhileProposer {
  propose(debugResponse?: string): Promise<{ ok: boolean }>;
  decide(id: string, status: "accepted" | "rejected", reason?: string): Promise<boolean>;
}

export interface MeanwhilePortDeps {
  getStory: () => NormalizedStoryV2 | null;
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
  const due = (boundary: number): boolean => {
    const state = deps.getState();
    return Boolean(proposer && state) && meanwhileDue(deps.extras().agendaProposals, { mode: mode(), boundary, openAgenda: hasOpenAgenda(deps.getStory(), state?.blackboard.values ?? {}) });
  };
  return {
    attach(next: MeanwhileProposer | null) { proposer = next; },
    mode,
    due,
    schedule(trigger: string, place: (job: SchedulerJob) => unknown): boolean {
      const state = deps.getState();
      if (!state || !due(state.boundary)) return false;
      const extras = deps.extras();
      extras.agendaProposals = recordMeanwhilePass(extras.agendaProposals ?? createAgendaProposals(), { boundary: state.boundary, messageId: state.lastMessageId, reason: trigger });
      place({
        priority: MEANWHILE_JOB_PRIORITY,
        reason: `meanwhile:${trigger}`,
        run: async () => {
          if (mode() !== "off") await proposer?.propose();
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
