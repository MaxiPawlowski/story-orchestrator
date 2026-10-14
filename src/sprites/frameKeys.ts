export const MOUTH_FRAME_KEYS = ["talk", "talk2", "mouth_o", "mouth_wide"] as const;
export const FRAME_KEYS = ["blink", ...MOUTH_FRAME_KEYS] as const;
export type MouthFrameKey = typeof MOUTH_FRAME_KEYS[number];
export type FrameKey = typeof FRAME_KEYS[number];
export type AnimationFrames = Partial<Record<FrameKey, string>>;
export const FRAME_KIND_PATTERN = "blink|talk2|talk|mouth_o|mouth_wide";
export const isFrameKey = (value: string): value is FrameKey => (FRAME_KEYS as readonly string[]).includes(value);
export const isMouthFrameKey = (value: string): value is MouthFrameKey => (MOUTH_FRAME_KEYS as readonly string[]).includes(value);
