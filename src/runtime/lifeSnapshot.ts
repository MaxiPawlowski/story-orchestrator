import type { BoundaryLogEntry, EngineState, NormalizedStoryV2 } from "@engine/index";
import type { LifeAuthorRow } from "@engine/life/lines";
import type { LabelAuthorRow } from "@engine/life/labels";
import type { AxisStep } from "@engine/life/beats";
import type { StoryTimeRow } from "@engine/life/clock";
import { gameLayer } from "@engine/validate/gameLayer";
import { scopeDropped } from "@extraction/scope";
import type { ScopeSourceContext } from "@extraction/scopeSources";
import type { AgendaProposalsState, MeanwhileProposal } from "./agendaProposals";

export interface LifeAuthorView {
  rows: LifeAuthorRow[];
  scopeOverflow: string[];
  proposals: MeanwhileProposal[];
  labels?: LabelAuthorRow[];
  history?: Record<string, AxisStep[]>;
  clock?: StoryTimeRow | null;
}

export const lifeAuthorSlice = (
  story: NormalizedStoryV2 | null, state: EngineState | null, authorView: boolean, proposals?: AgendaProposalsState, scopeContext?: ScopeSourceContext,
  log: readonly BoundaryLogEntry[] = [],
): LifeAuthorView | null => {
  const layer = story?.life && state && authorView ? gameLayer() : null;
  if (!story || !state || !layer) return null;
  return {
    rows: layer.life.lifeAuthorRows(story, state.blackboard.values),
    scopeOverflow: scopeDropped(story, state, "relationship", scopeContext),
    proposals: proposals?.proposals ?? [],
    labels: layer.life.labelAuthorRows(story, state.blackboard.values, log),
    history: layer.life.axisHistory(story, log),
    clock: layer.life.storyTimeRow(story, state.blackboard.values, log),
  };
};
