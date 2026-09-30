import { isRecord } from "@utils/guards";
import { readStageDirection } from "./direction";
import type { SpriteActivation, SpriteSettings } from "./settings";

interface StoryWithCheckpoints {
  checkpoints: ReadonlyArray<{ effects?: unknown }>;
}

export function storyDirectsStage(story: StoryWithCheckpoints | null | undefined): boolean {
  return Boolean(story?.checkpoints.some((checkpoint) => isRecord(checkpoint.effects) && readStageDirection(checkpoint.effects.stage) !== null));
}

export function spriteActivation(settings: Pick<SpriteSettings, "enabled" | "explicit">, storyDirects: boolean): SpriteActivation {
  if (settings.explicit) return settings.enabled ? "user-on" : "user-off";
  return storyDirects ? "story" : "off";
}

export const spritesActive = (activation: SpriteActivation): boolean => activation === "user-on" || activation === "story";

export const userSpriteChoice = (enabled: boolean): Pick<SpriteSettings, "enabled" | "explicit"> => ({ enabled, explicit: true });

export const storySpriteChoice = (): Pick<SpriteSettings, "enabled" | "explicit"> => ({ enabled: false, explicit: false });
