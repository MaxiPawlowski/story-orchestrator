import type { NormalizedStoryV2, PrimitiveValue } from "@engine/index";
import { cardValues } from "@engine/cardFields";
import type { SpriteLookIssue } from "@runtime/spriteLookHealth";
import { cardSet, type SpriteSetRule } from "./profile";
import type { SpriteSettings } from "./settings";

export interface LookActor {
  name: string;
  muted: boolean;
  profile: { folder: string };
  rules: SpriteSetRule[];
  generatedLook?: string;
  lookError?: string;
}

export function changedLookIssues(story: NormalizedStoryV2 | null, values: Record<string, PrimitiveValue>,
  settings: SpriteSettings, active: boolean, actors: LookActor[]): SpriteLookIssue[] {
  if (!story || !active) return [];
  return story.roster.flatMap((member) => {
    const fields = cardValues(story, values, member.id, true);
    if (!Object.keys(fields).length) return [];
    const name = member.name ?? member.id;
    const actor = actors.find((actor) => actor.name === name);
    if (actor?.muted || actor && cardSet(actor.rules, fields)) return [];
    if (actor?.generatedLook === JSON.stringify(fields)) return [];
    const reason = actor?.lookError ?? (!actor ? "No installed default expression pack."
      : !settings.onDemand ? "On-demand changed looks are off."
        : !settings.builders[actor.profile.folder] ? "Choose a reference expression pack in Studio." : null);
    return reason ? [{ name, reason }] : [];
  });
}
