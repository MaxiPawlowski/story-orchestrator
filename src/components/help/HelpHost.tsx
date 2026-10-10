import { GUIDE_TOPIC_IDS, GUIDE_TOPICS } from "@copilot/guideTopics";
import type { KnowledgeShowMe } from "@copilot/knowledge/types";
import { authorGuideDoc, FEATURES, guideUrl, HOME_PAGE, visibleFeatures, type FeatureWhere } from "@features/registry";
import type { AskOutcome } from "@runtime/askHost";
import { getGlobalSettings } from "@runtime/settingsStore";
import { AskBox, type AskBoxReply } from "@components/studio/AskBox";
import { canShow, HelpPanel, type HelpGuideTopic } from "./HelpPanel";

export type HelpAsk = (question: string) => Promise<AskOutcome>;

export interface HelpHostProps {
  authorView: boolean;
  onShowMe: (where: FeatureWhere) => void;
  onOpenDoc?: (doc?: string) => void;
  onClose: () => void;
  ask?: HelpAsk;
}

const guideTopics = (): HelpGuideTopic[] => GUIDE_TOPIC_IDS.map((id) => ({ id, title: GUIDE_TOPICS[id].title, text: GUIDE_TOPICS[id].text, doc: authorGuideDoc(id) }));

export const toAskView = (outcome: AskOutcome): AskBoxReply => (outcome.ok
  ? { status: outcome.result.status, answer: outcome.result.answer, topics: outcome.result.topics.map((topic) => ({ id: topic.id, title: topic.title })), showMe: outcome.result.showMe }
  : { error: outcome.reason });

const featureWhere = (target: KnowledgeShowMe): FeatureWhere | null => (target.kind === "feature" ? FEATURES.find((feature) => feature.id === target.target)?.where ?? null : null);

const docOf = (target: KnowledgeShowMe) => target.target.split("#")[0];

export default function HelpHost({ authorView, onShowMe, onOpenDoc, onClose, ask }: HelpHostProps) {
  const settings = getGlobalSettings();
  const showable = (target: KnowledgeShowMe) => {
    if (target.kind === "doc") return Boolean(onOpenDoc || guideUrl(docOf(target)));
    const where = featureWhere(target);
    return Boolean(where && canShow(where));
  };
  const show = (target: KnowledgeShowMe) => {
    const where = featureWhere(target);
    if (where) onShowMe(where);
    else if (target.kind === "doc" && onOpenDoc) onOpenDoc(docOf(target));
    else if (target.kind === "doc") window.open(guideUrl(docOf(target)) ?? "", "_blank", "noopener");
  };
  const askBox = ask && settings.copilot.ask
    ? <AskBox persona={authorView ? "author" : "player"} onAsk={async (question) => toAskView(await ask(question))} onShowMe={show} canShow={showable} />
    : null;
  return (
    <HelpPanel
      features={visibleFeatures(authorView)}
      isOn={(feature) => (feature.isOn ? feature.isOn(settings) : null)}
      homePage={HOME_PAGE}
      guideTopics={authorView ? guideTopics() : []}
      onShowMe={onShowMe}
      onOpenDoc={onOpenDoc}
      onClose={onClose}
      ask={askBox}
    />
  );
}
