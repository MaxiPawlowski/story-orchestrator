import type { RuntimeSnapshot } from "./types";
import { hasUnsavedChanges, SAVE_PLAYER_TEXT } from "./saveHealth";

// v2.3 plan 09. The four things a person does here are Start, Continue, Repair and Author. Repair is
// the odd one: it is the one *missing* step, and the player surface, the HUD chip and the settings
// panel all have to point at the same one. So it is derived once, here, worst-first — and the plain
// consequence comes before the technical line, because "the story will not advance" is the part a
// player can act on.
export type RepairArea = "memory-model" | "cast" | "lore" | "persona" | "save";

export interface RepairStep {
  area: RepairArea;
  /** What will not happen until this is fixed, in the player's words. */
  consequence: string;
  /** Which setting or which named asset, second. */
  detail: string;
  /** The control the settings panel owns for it; null when no panel control fixes it. */
  targetId: string | null;
  /** The wizard can create this one (a card or a lorebook) — never a persona. */
  provisionable: boolean;
}

export const REPAIR_TARGET_IDS = { memoryModel: "so-extraction-profile" } as const;

export function nextRepairStep(snapshot: RuntimeSnapshot): RepairStep | null {
  if (!snapshot.storyId) return null;
  const settings = snapshot.extraction.settings;
  if (!settings.enabled || !settings.profileId) {
    return {
      area: "memory-model",
      consequence: "The story will not advance on its own until this is set.",
      detail: settings.enabled ? "No memory model profile is selected." : "Automatic story advancement is off.",
      targetId: REPAIR_TARGET_IDS.memoryModel,
      provisionable: false,
    };
  }
  const requirements = snapshot.requirements;
  if (requirements.missingMembers.length) {
    return {
      area: "cast",
      consequence: "The story expects people who are not in this chat, so their scenes never arrive.",
      detail: `Missing from the group: ${requirements.missingMembers.join(", ")}`,
      targetId: null,
      provisionable: true,
    };
  }
  if (requirements.missingLorebooks.length) {
    return {
      area: "lore",
      consequence: "The story reads from lore it cannot see, so nothing it needs to know is in play.",
      detail: `Not selected: ${requirements.missingLorebooks.join(", ")}`,
      targetId: null,
      provisionable: true,
    };
  }
  if (requirements.missingPersonas.length) {
    return {
      area: "persona",
      consequence: "This story is written for a different player character than the one selected.",
      detail: `Missing persona: ${requirements.missingPersonas.join(", ")}`,
      targetId: null,
      provisionable: false,
    };
  }
  if (hasUnsavedChanges(snapshot.saveHealth)) {
    return { area: "save", consequence: "Your last turn is not saved on the server yet.", detail: SAVE_PLAYER_TEXT, targetId: null, provisionable: false };
  }
  return null;
}
