import type { GateNode } from "./schema";
import { CUE_KEY_PREFIX, TOPIC_KEY_PREFIX } from "./cueKeys";

export { CUE_KEY_PREFIX, TOPIC_KEY_PREFIX, isCueKey, isTopicKey } from "./cueKeys";
export const CUES_MAX = 12;
export const CUE_TEXT_MAX = 160;
export const CUE_WINDOW_DEFAULT = 3;
export const CUE_WINDOW_MAX = 20;
export const CUE_MAX_OFFERS_DEFAULT = 3;
export const CUE_MAX_OFFERS_LIMIT = 5;
export const CUE_MEMBER_GAP = 2;
export const OFFERS_PER_GENERATION = 1;
export const TOPICS_MAX = 6;
export const TOPIC_KEYS_MAX = 8;
export const TOPIC_TIERS_MAX = 3;
export const NORMS_MAX = 8;
export const CUE_PRIORITY = { cue: 0, norm: 15, echo: 20, topic: 30 } as const;

export type CueKind = "remark" | "reaction";
export type CueLane = "must" | "may";

export interface MemberCue {
  id: string;
  kind: CueKind;
  when: GateNode;
  cue: string;
  lane?: CueLane;
  priority?: number;
  window?: number;
  repeat?: { cooldown: number };
  landed_when?: GateNode;
  max_offers?: number;
}

export interface TopicTier {
  cue: string;
  when?: GateNode;
}

export interface MemberTopic {
  id: string;
  keys: string[];
  tiers: TopicTier[];
  priority?: number;
}

export interface StoryNorm {
  id: string;
  label: string;
  broken_when: GateNode;
  noticed_by: string[];
  cue: string;
  priority?: number;
  checkpoints?: string[];
}

export const cueAtKey = (member: string, id: string): string => `${CUE_KEY_PREFIX}${member}_${id}_at`;
export const cueLandedKey = (member: string, id: string): string => `${CUE_KEY_PREFIX}${member}_${id}_landed`;
export const normAtKey = (id: string): string => `${CUE_KEY_PREFIX}norm_${id}_at`;
export const normSeenKey = (id: string, member: string): string => `${CUE_KEY_PREFIX}norm_${id}_${member}_at`;
export const topicKey = (member: string, id: string): string => `${TOPIC_KEY_PREFIX}${member}_${id}`;
