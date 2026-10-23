import type { NarrationSheet } from "./deliverySchema";

export const POLISH_MODES = ["shadow", "off"] as const;
export type PolishMode = (typeof POLISH_MODES)[number];

export const STORY_POLISH_KEYS = ["mode", "narration"] as const;

export interface StoryPolish {
  mode?: PolishMode;
  narration?: NarrationSheet;
}

declare module "./schema" {
  interface Story {
    polish?: StoryPolish;
  }
}
