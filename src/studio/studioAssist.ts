import type { StoryV2 } from "@engine/index";
import { askText, type ModelCall } from "@extraction/modelRoute";
import { ASK_MAX_TOKENS, runAsk } from "@copilot/agent/ask";
import { DRAFT_MAX_TOKENS } from "@copilot/characterTutorial";
import type { KnowledgeShowMe } from "@copilot/knowledge/types";
import type { AskBoxReply } from "@components/studio/AskBox";
import { FEATURES } from "@features/registry";
import type { StudioAskRunner } from "./components/StudioAsk";
import type { WizardHost } from "./components/StudioCopilot";
import { STUDIO_TAB_GUIDE } from "./guideTabs";
import type { StudioTab } from "./StudioModal";

export interface StudioAssist {
  ask: StudioAskRunner;
  draftStep: (prompt: string) => Promise<string>;
}

export const studioAssist = (model: ModelCall, host: WizardHost, backgrounds: () => string[]): StudioAssist => ({
  ask: async (question: string, draft: StoryV2): Promise<AskBoxReply> => {
    const environment = host.environment(draft);
    const result = await runAsk({
      question,
      context: {
        persona: "author", draft, liveState: null,
        lookup: { characters: () => environment.characterNames, lorebooks: () => environment.lorebookNames, groups: () => environment.groupNames, backgrounds },
      },
      model: (prompt) => askText(model, prompt, { role: "authoring", pass: "ask", maxTokens: ASK_MAX_TOKENS }),
    });
    return { status: result.status, answer: result.answer, topics: result.topics.map((topic) => ({ id: topic.id, title: topic.title })), showMe: result.showMe };
  },
  draftStep: (prompt: string) => askText(model, prompt, { role: "authoring", pass: "copilot", maxTokens: DRAFT_MAX_TOKENS }),
});

export type StudioTopicTarget = { tab: StudioTab } | { doc: string } | null;

export const studioTopicTarget = (target: KnowledgeShowMe): StudioTopicTarget => {
  if (target.kind === "studio") {
    const tab = (Object.keys(STUDIO_TAB_GUIDE) as StudioTab[]).find((entry) => STUDIO_TAB_GUIDE[entry]?.some((topic) => topic === target.target));
    return tab ? { tab } : null;
  }
  if (target.kind === "doc") return { doc: target.target.split("#")[0] };
  const feature = FEATURES.find((entry) => entry.id === target.target);
  return feature ? { doc: feature.doc } : null;
};
