import type { EngineState, NormalizedStoryV2 } from "@engine/index";
import type { LifeAuthorRow } from "@engine/life/lines";
import { gameLayer } from "@engine/validate/gameLayer";
import { scopeDropped } from "@extraction/scope";
import type { ScopeSourceContext } from "@extraction/scopeSources";
import type { AgendaProposalsState, MeanwhileProposal } from "./agendaProposals";

export interface LifeAuthorView {
  rows: LifeAuthorRow[];
  scopeOverflow: string[];
  proposals: MeanwhileProposal[];
}

export const lifeAuthorSlice = (
  story: NormalizedStoryV2 | null, state: EngineState | null, authorView: boolean, proposals?: AgendaProposalsState, scopeContext?: ScopeSourceContext,
): LifeAuthorView | null => {
  const layer = story?.life && state && authorView ? gameLayer() : null;
  if (!story || !state || !layer) return null;
  return {
    rows: layer.life.lifeAuthorRows(story, state.blackboard.values),
    scopeOverflow: scopeDropped(story, state, "relationship", scopeContext),
    proposals: proposals?.proposals ?? [],
  };
};
