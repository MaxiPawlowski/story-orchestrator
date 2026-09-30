import type { PassRole } from "@extraction/passRole";
import type { RuntimeSnapshot } from "./types";
import { hasUnsavedChanges, SAVE_PLAYER_TEXT } from "./saveHealth";
import { ROLE_PROBLEM_STATES } from "./roleHealth";

// The four things a person does here are Start, Continue, Repair and Author. Repair is
// the odd one: it is the one *missing* step, and the player surface, the HUD chip and the settings
// panel all have to point at the same one. So it is derived once, here, worst-first — and the plain
// consequence comes before the technical line, because "the story will not advance" is the part a
// player can act on.
export type RepairArea = "memory-model" | "model-role" | "cast" | "lore" | "persona" | "save" | "chapter";

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

export const WI_GATING_TARGET_ID = "so-wi-gating";

const entryCounts = (entries: Array<{ lorebook: string; comment: string }>) => {
  const counts = new Map<string, number>();
  entries.forEach((entry) => counts.set(entry.lorebook, (counts.get(entry.lorebook) ?? 0) + 1));
  return [...counts].map(([lorebook, count]) => `${count} ${count === 1 ? "entry" : "entries"} in ${lorebook}`).join(", ");
};

// B: install-wide like the orphaned book, so it shows without a story too; last among the
// story's own steps, because the story in play still sees its own lore correctly. Books and counts only:
// a checkpoint entry's name is a spoiler, and this row shows in player mode.
function wiGatingStep(snapshot: RuntimeSnapshot): RepairStep | null {
  const status = snapshot.wiGating;
  if (status?.mode !== "scan" || (!status.drift.length && !status.missingKey.length)) return null;
  const detail = [
    ...(status.drift.length ? [`Switched on outside the story: ${entryCounts(status.drift)}`] : []),
    ...(status.missingKey.length ? [`Cannot be switched off for this chat: ${entryCounts(status.missingKey)}`] : []),
  ].join(" · ");
  return {
    area: "lore",
    consequence: "A story lorebook entry was switched on outside the story; it will show in chats without the story.",
    detail,
    targetId: WI_GATING_TARGET_ID,
    provisionable: false,
  };
}

export const roleProfileTargetId = (role: PassRole): string => `so-role-profile-${role}`;

export const ROLE_CONSEQUENCES: Record<PassRole, string> = {
  read: "The story will not advance on its own until this is fixed.",
  synthesis: "Scene summaries and the story so far stop updating.",
  authoring: "The wizard, the driver's suggestions and the prepared road ahead stop working.",
  director: "Speaker direction falls back to ST's own choice.",
  curator: "The World Info curator stops proposing changes.",
  inner: "Characters stop preparing a private intent before they speak.",
};

function roleStep(snapshot: RuntimeSnapshot): RepairStep | null {
  const route = (snapshot.roleRoutes ?? []).find((entry) => ROLE_PROBLEM_STATES.has(entry.state));
  if (!route) return null;
  return { area: "model-role", consequence: ROLE_CONSEQUENCES[route.role], detail: route.detail, targetId: roleProfileTargetId(route.role), provisionable: false };
}

// A deleted chat's mirror book the reaper did not delete (declined, not provably ours,
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
  if (!snapshot.storyId) return wiGatingStep(snapshot) ?? orphanedLorebookStep(snapshot);
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
  const role = roleStep(snapshot);
  if (role) return role;
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
  // A story book in the scan view before every other listener and
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
  const displaced = requirements.slotConflict;
  if (displaced && snapshot.memory?.wiBook) {
    return {
      area: "lore",
      consequence: "This chat's story memory is not reaching the model, because the chat lorebook slot holds another book.",
      detail: `Chat lorebook: ${displaced.book}`,
      targetId: null,
      provisionable: false,
    };
  }
  if (hasUnsavedChanges(snapshot.saveHealth)) {
    return { area: "save", consequence: "Your last turn is not saved on the server yet.", detail: SAVE_PLAYER_TEXT, targetId: null, provisionable: false };
  }
  const degraded = (snapshot.memory?.chapters ?? []).find((record) => record.status === "degraded");
  if (degraded) {
    const consequence = `Chapter "${degraded.playerTitle}" was sealed without a written summary.`;
    return { area: "chapter", consequence, detail: "Re-seal it from the Chapters panel.", targetId: null, provisionable: false };
  }
  return wiGatingStep(snapshot) ?? orphanedLorebookStep(snapshot);
}
