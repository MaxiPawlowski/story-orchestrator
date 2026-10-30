import type { Quality, Story, ValidationError } from "@engine/index";
import { addCheckQualities } from "@engine/validate/checkRefs";
import { addCodexQualities, readCodex } from "@engine/validate/codex";
import { addLifeQualities, readLife } from "@engine/validate/life";
import { addLivingQualities, readLiving } from "@engine/validate/living";
import { addObservationQualities, readObservations } from "@engine/validate/observations";
import { addRewardQualities, readQuests } from "@engine/validate/quests";

export const compiledQualities = (draft: Story): Quality[] => {
  const raw: Record<string, unknown> = Object.fromEntries(Object.entries(draft));
  const scratch: ValidationError[] = [];
  const living = addLivingQualities(readLiving(raw.living, scratch), []);
  const rewarded = addRewardQualities(living, readQuests(raw.quests, scratch), scratch);
  const lived = addCodexQualities(addLifeQualities(rewarded, readLife(raw, scratch), scratch), readCodex(raw.codex, scratch), scratch);
  return addCheckQualities(addObservationQualities(lived, readObservations(raw.observations, scratch), scratch), draft.checkpoints, scratch);
};
