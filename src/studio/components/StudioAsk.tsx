import React from "react";
import type { StoryV2 } from "@engine/index";
import type { KnowledgeShowMe } from "@copilot/knowledge/types";
import AskBox, { type AskBoxReply } from "@components/studio/AskBox";
import { useDraftStore } from "../draft";

export type StudioAskRunner = (question: string, draft: StoryV2) => Promise<AskBoxReply>;

export interface StudioAskProps {
  ask?: StudioAskRunner;
  onShowTopic?: (target: KnowledgeShowMe) => void;
}

export const STUDIO_ASK_TEXT = {
  unavailable: "Ask needs an authoring model: pick a memory model profile, and keep Ask questions on under Setup.",
  intro: "Ask about Story Orchestrator, SillyTavern or this draft: how a field works, why a gate never opens, what to fix. It only reads.",
} as const;

const StudioAsk: React.FC<StudioAskProps> = ({ ask, onShowTopic }) => {
  if (!ask) return <div data-so="studio-ask-unavailable" role="status" className="st-subpanel rounded p-3 text-sm st-muted">{STUDIO_ASK_TEXT.unavailable}</div>;
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] st-muted">{STUDIO_ASK_TEXT.intro}</div>
      <AskBox id="so-studio-ask" persona="author" onAsk={(question) => ask(question, useDraftStore.getState().draft)} onShowMe={onShowTopic} />
    </div>
  );
};

export default StudioAsk;
