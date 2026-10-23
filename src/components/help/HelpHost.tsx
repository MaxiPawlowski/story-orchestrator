import { useEffect, useState } from "react";
import { GUIDE_TOPIC_IDS, GUIDE_TOPICS } from "@copilot/guideTopics";
import type { KnowledgeShowMe } from "@copilot/knowledge/types";
import { authorGuideDoc, FEATURES, guideUrl, HOME_PAGE, visibleFeatures, type Feature, type FeatureWhere } from "@features/registry";
import { helpWhere } from "@features/where";
import { findingsByFeature, helpFeatureState } from "@runtime/helpFeatureState";
import { showMeRenders, UNKNOWN_HOST, type ShowMeHostFacts } from "@runtime/showMeRenders";
import { repairIntent } from "@runtime/workspaceRoutes";
import type { RuntimeSnapshot } from "@runtime/types";
import type { AskOutcome } from "@runtime/askHost";
import { getGlobalSettings } from "@runtime/settingsStore";
import { AskBox, type AskBoxReply } from "@components/studio/AskBox";
import { requestTour } from "@guide/tour/request";
import { canShow, HelpPanel, type HelpGuideTopic } from "./HelpPanel";
import { readShowMeHostFacts } from "./helpHostFacts";

export type HelpAsk = (question: string) => Promise<AskOutcome>;

export interface HelpHostProps {
  authorView: boolean;
  snapshot?: RuntimeSnapshot;
  onShowMe: (where: FeatureWhere) => void;
  onOpenDoc?: (doc?: string) => void;
  onClose: () => void;
  ask?: HelpAsk;
}

const SETUP_WHERE: FeatureWhere = { selector: "#so-setup", label: "This story › Play › Setup", surface: "drawer", workspace: repairIntent() };

const guideTopics = (): HelpGuideTopic[] => GUIDE_TOPIC_IDS.map((id) => ({ id, title: GUIDE_TOPICS[id].title, text: GUIDE_TOPICS[id].text, doc: authorGuideDoc(id) }));

export const toAskView = (outcome: AskOutcome): AskBoxReply => (outcome.ok
  ? { status: outcome.result.status, answer: outcome.result.answer, topics: outcome.result.topics.map((topic) => ({ id: topic.id, title: topic.title })), showMe: outcome.result.showMe }
  : { error: outcome.reason });

const featureWhere = (target: KnowledgeShowMe): FeatureWhere | null => (target.kind === "feature" ? FEATURES.find((feature) => feature.id === target.target)?.where ?? null : null);

const docOf = (target: KnowledgeShowMe) => target.target.split("#")[0];

export default function HelpHost({ authorView, snapshot, onShowMe, onOpenDoc, onClose, ask }: HelpHostProps) {
  const settings = getGlobalSettings();
  const [host, setHost] = useState<ShowMeHostFacts>(UNKNOWN_HOST);
  const judgeEnabled = settings.judge.enabled;
  useEffect(() => {
    let live = true;
    void readShowMeHostFacts(judgeEnabled).then((facts) => { if (live) setHost(facts); });
    return () => { live = false; };
  }, [judgeEnabled]);
  const findings = snapshot ? findingsByFeature(snapshot) : null;
  const placed = (where: FeatureWhere) => {
    const shown = helpWhere(where, !snapshot || snapshot.ready);
    return shown && showMeRenders(shown, { snapshot: snapshot ?? null, authorView, settings, host }) ? shown : null;
  };
  const showable = (target: KnowledgeShowMe) => {
    if (target.kind === "doc") return Boolean(onOpenDoc || guideUrl(docOf(target)));
    const where = featureWhere(target);
    const shown = where && placed(where);
    return Boolean(shown && canShow(shown));
  };
  const show = (target: KnowledgeShowMe) => {
    const where = featureWhere(target);
    const shown = where && placed(where);
    if (shown) onShowMe(shown);
    else if (target.kind === "doc" && onOpenDoc) onOpenDoc(docOf(target));
    else if (target.kind === "doc") window.open(guideUrl(docOf(target)) ?? "", "_blank", "noopener");
  };
  const askBox = ask && settings.copilot.ask
    ? <AskBox persona={authorView ? "author" : "player"} onAsk={async (question) => toAskView(await ask(question))} onShowMe={show} canShow={showable} />
    : null;
  return (
    <HelpPanel
      features={visibleFeatures(authorView)}
      stateOf={(feature) => helpFeatureState(feature, snapshot ?? null, settings)}
      whereOf={(feature: Feature) => placed(feature.where)}
      findingsOf={(feature) => (findings?.get(feature.id) ?? []).map((step) => ({ check: step.check, text: step.consequence }))}
      onOpenSetup={() => onShowMe(SETUP_WHERE)}
      homePage={HOME_PAGE}
      guideTopics={authorView ? guideTopics() : []}
      onShowMe={onShowMe}
      onOpenDoc={onOpenDoc}
      onClose={onClose}
      onTour={() => { if (requestTour()) onClose(); }}
      ask={askBox}
    />
  );
}
