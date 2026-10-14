import { nearestKey } from "@utils/levenshtein";
import { GUIDE_TOPICS, GUIDE_TOPIC_IDS, type GuideTopicId } from "./guideTopics";
import type { CopilotStage } from "./types";

export const STAGE_GUIDE_TOPICS: Record<CopilotStage, readonly GuideTopicId[]> = {
  qualities: ["quality-rubric", "latching", "chance-roll", "briefing"],
  checkpoints: ["checkpoints", "objective-agency"],
  transitions: ["gates", "transitions"],
  effects: ["opening-scene", "drives-motives", "requirements", "briefing"],
  provisioning: ["opening-scene", "requirements"],
};

export const renderGuideTopic = (id: GuideTopicId): string => {
  const topic = GUIDE_TOPICS[id];
  return `${topic.title} (${topic.fields})\n${topic.text}`;
};

export const renderStageGuide = (stage: CopilotStage): string =>
  `Author's guide, for this stage:\n${STAGE_GUIDE_TOPICS[stage].map((id) => `- ${GUIDE_TOPICS[id].title}: ${GUIDE_TOPICS[id].text}`).join("\n")}`;

const isTopic = (value: string): value is GuideTopicId => Object.hasOwn(GUIDE_TOPICS, value);

export const PENDING_GUIDE_TOPICS: Readonly<Record<string, string>> = {};

export const readGuide = (topic: unknown): string => {
  const typed = typeof topic === "string" ? topic.trim().toLowerCase() : "";
  if (isTopic(typed)) return renderGuideTopic(typed);
  if (Object.hasOwn(PENDING_GUIDE_TOPICS, typed)) return `Guide topic "${typed}" is kept for ${PENDING_GUIDE_TOPICS[typed]}, which is not in this build yet. Do not author it.`;
  const near = typed ? nearestKey(typed, GUIDE_TOPIC_IDS) : null;
  const known = `Topics: ${GUIDE_TOPIC_IDS.join(", ")}.`;
  if (!typed) return `Name a topic. ${known}`;
  return `No guide topic "${typed}"${near ? ` (did you mean "${near}"?)` : ""}. ${known}`;
};
