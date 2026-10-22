export const CUE_KEY_PREFIX = "cue_";
export const TOPIC_KEY_PREFIX = "topic_";
export const isCueKey = (key: string): boolean => key.startsWith(CUE_KEY_PREFIX);
export const isTopicKey = (key: string): boolean => key.startsWith(TOPIC_KEY_PREFIX);
