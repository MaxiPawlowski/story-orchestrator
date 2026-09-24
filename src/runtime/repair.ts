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

// v2.4 plan 02 T14: a deleted chat's mirror book the reaper did not delete (declined, not provably ours,
// or the deletion could not be confirmed). Last, because it costs the story in play nothing, and shown
// without a story too, because the chat it belonged to is gone.
function orphanedLorebookStep(snapshot: RuntimeSnapshot): RepairStep | null {
  const orphans = snapshot.orphanedLorebooks ?? [];
  if (!orphans.length) return null;
  return {
    area: "lore",
    consequence: "A deleted chat left its story memory behind in a lorebook.",
    detail: `Orphaned story-memory lorebook: ${orphans.map((orphan) => `${orphan.name} (${orphan.detail})`).join("; ")}`,
    targetId: null,
    provisionable: false,
  };
}

export function nextRepairStep(snapshot: RuntimeSnapshot): RepairStep | null {
  if (!snapshot.storyId) return orphanedLorebookStep(snapshot);
  const settings = snapshot.extraction.settings;
  const config = snapshot.extractionHealth?.kind === "config" ? snapshot.extractionHealth.detail : null;
  if (!settings.enabled || !settings.profileId || config) {
    return {
      area: "memory-model",
      consequence: "The story will not advance on its own until this is set.",
      detail: !settings.enabled ? "Automatic story advancement is off." : settings.profileId ? config ?? "" : "No memory model profile is selected.",
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
  // v2.4 plan 05 T12 (D9 shape rule): a story book in the scan view before every other listener and
  // gone after all of them, two loud generations running. No extension is named: there is no allowlist.
  const hidden = snapshot.loreEvidence?.hiddenBooks ?? [];
  if (hidden.length) {
    return {
      area: "lore",
      consequence: "Another extension is hiding this story's lorebook from the model.",
      detail: `Hidden from the model: ${hidden.join(", ")}`,
      targetId: null,
      provisionable: false,
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
  return orphanedLorebookStep(snapshot);
}
