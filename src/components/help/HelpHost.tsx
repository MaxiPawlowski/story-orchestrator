import { GUIDE_TOPIC_IDS, GUIDE_TOPICS } from "@copilot/guideTopics";
import { authorGuideDoc, HOME_PAGE, visibleFeatures, type FeatureWhere } from "@features/registry";
import { getGlobalSettings } from "@runtime/settingsStore";
import { HelpPanel, type HelpGuideTopic } from "./HelpPanel";

export interface HelpHostProps {
  authorView: boolean;
  onShowMe: (where: FeatureWhere) => void;
  onClose: () => void;
}

const guideTopics = (): HelpGuideTopic[] => GUIDE_TOPIC_IDS.map((id) => ({ id, title: GUIDE_TOPICS[id].title, text: GUIDE_TOPICS[id].text, doc: authorGuideDoc(id) }));

export default function HelpHost({ authorView, onShowMe, onClose }: HelpHostProps) {
  const settings = getGlobalSettings();
  return (
    <HelpPanel
      features={visibleFeatures(authorView)}
      isOn={(feature) => (feature.isOn ? feature.isOn(settings) : null)}
      homePage={HOME_PAGE}
      guideTopics={authorView ? guideTopics() : []}
      onShowMe={onShowMe}
      onClose={onClose}
    />
  );
}
