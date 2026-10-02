import type { PassRole } from "@extraction/passRole";
import type { RuntimeSnapshot } from "./types";
import { hasUnsavedChanges, playerSaveNotice, SAVE_PLAYER_TEXT } from "./saveHealth";
import { ROLE_PROBLEM_STATES } from "./roleHealth";
import { mutedMembersText, REPAIR_PLAYER_COPY } from "./pipeline";

// The four things a person does here are Start, Continue, Repair and Author. Repair is
// the odd one: it is the one *missing* step, and the player surface, the HUD chip and the settings
// panel all have to point at the same one. So it is derived once, here, worst-first — and the plain
// consequence comes before the technical line, because "the story will not advance" is the part a
// player can act on.
export type RepairArea = "memory-model" | "model-role" | "cast" | "lore" | "persona" | "save" | "chapter";

export interface RepairStep {
  area: RepairArea;
  /** What will not happen until this is fixed, in the author's words. */
  consequence: string;
  /** Which setting or which named asset, second. */
  detail: string;
  /** The control the settings panel owns for it; null when no panel control fixes it. */
  targetId: string | null;
  /** The wizard can create this one (a card or a lorebook) — never a persona. */
  provisionable: boolean;
  /** The same consequence in player words; null when only an author can see or fix it. */
  player: string | null;
}

export const REPAIR_TARGET_IDS = { memoryModel: "so-extraction-profile" } as const;

export const WI_GATING_TARGET_ID = "so-wi-gating";

const entryCounts = (entries: Array<{ lorebook: string; comment: string }>) => {
  const counts = new Map<string, number>();
  entries.forEach((entry) => counts.set(entry.lorebook, (counts.get(entry.lorebook) ?? 0) + 1));
  return [...counts].map(([lorebook, count]) => `${count} ${count === 1 ? "entry" : "entries"} in ${lorebook}`).join(", ");
};

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
    player: null,
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

const ROLE_PLAYER_COPY: Partial<Record<PassRole, string>> = {
  read: REPAIR_PLAYER_COPY.read,
  synthesis: REPAIR_PLAYER_COPY.synthesis,
};

function roleStep(snapshot: RuntimeSnapshot): RepairStep | null {
  const route = (snapshot.roleRoutes ?? []).find((entry) => ROLE_PROBLEM_STATES.has(entry.state));
  if (!route) return null;
  return {
    area: "model-role", consequence: ROLE_CONSEQUENCES[route.role], detail: route.detail, targetId: roleProfileTargetId(route.role), provisionable: false,
    player: ROLE_PLAYER_COPY[route.role] ?? null,
  };
}

function orphanedLorebookStep(snapshot: RuntimeSnapshot): RepairStep | null {
  const orphans = snapshot.orphanedLorebooks ?? [];
  if (!orphans.length) return null;
  return {
    area: "lore",
    consequence: "A deleted chat left its story memory behind in a lorebook.",
    detail: `Orphaned story-memory lorebook: ${orphans.map((orphan) => `${orphan.name} (${orphan.detail})`).join("; ")}`,
    targetId: null,
    provisionable: false,
    player: null,
  };
}

function memoryModelStep(snapshot: RuntimeSnapshot): RepairStep | null {
  const settings = snapshot.extraction.settings;
  const config = snapshot.extractionHealth?.kind === "config" ? snapshot.extractionHealth.detail : null;
  if (settings.enabled && settings.profileId && !config) return null;
  return {
    area: "memory-model",
    consequence: "The story will not advance on its own until this is set.",
    detail: !settings.enabled ? "Automatic story advancement is off." : settings.profileId ? config ?? "" : "No memory model profile is selected.",
    targetId: REPAIR_TARGET_IDS.memoryModel,
    provisionable: false,
    player: REPAIR_PLAYER_COPY.memoryModel,
  };
}

function requirementSteps(snapshot: RuntimeSnapshot): Array<RepairStep | null> {
  const requirements = snapshot.requirements;
  if (!requirements) return [];
  const muted = requirements.mutedMembers ?? [];
  const hidden = snapshot.loreEvidence?.hiddenBooks ?? [];
  const displaced = requirements.slotConflict;
  return [
    requirements.missingMembers.length ? {
      area: "cast",
      consequence: "The story expects people who are not in this chat, so their scenes never arrive.",
      detail: `Missing from the group: ${requirements.missingMembers.join(", ")}`,
      targetId: null,
      provisionable: true,
      player: REPAIR_PLAYER_COPY.cast,
    } : null,
    muted.length ? {
      area: "cast",
      consequence: mutedMembersText(muted),
      detail: `Muted in the group: ${muted.join(", ")}. Unmute ${muted.length === 1 ? "this member" : "these members"} in the group's member list.`,
      targetId: null,
      provisionable: false,
      player: mutedMembersText(muted),
    } : null,
    requirements.missingLorebooks.length ? {
      area: "lore",
      consequence: "The story reads from lore it cannot see, so nothing it needs to know is in play.",
      detail: `Not selected: ${requirements.missingLorebooks.join(", ")}`,
      targetId: null,
      provisionable: true,
      player: REPAIR_PLAYER_COPY.lore,
    } : null,
    hidden.length ? {
      area: "lore",
      consequence: "Another extension is hiding this story's lorebook from the model.",
      detail: `Hidden from the model: ${hidden.join(", ")}`,
      targetId: null,
      provisionable: false,
      player: null,
    } : null,
    requirements.missingPersonas.length ? {
      area: "persona",
      consequence: "This story is written for a different player character than the one selected.",
      detail: `Missing persona: ${requirements.missingPersonas.join(", ")}`,
      targetId: null,
      provisionable: false,
      player: REPAIR_PLAYER_COPY.persona,
    } : null,
    displaced && snapshot.memory?.wiBook ? {
      area: "lore",
      consequence: "This chat's story memory is not reaching the model, because the chat lorebook slot holds another book.",
      detail: `Chat lorebook: ${displaced.book}`,
      targetId: null,
      provisionable: false,
      player: null,
    } : null,
  ];
}

function laterSteps(snapshot: RuntimeSnapshot): Array<RepairStep | null> {
  const degraded = (snapshot.memory?.chapters ?? []).find((record) => record.status === "degraded");
  return [
    snapshot.saveHealth && hasUnsavedChanges(snapshot.saveHealth)
      ? { area: "save", consequence: "Your last turn is not saved on the server yet.", detail: SAVE_PLAYER_TEXT, targetId: null, provisionable: false, player: playerSaveNotice(snapshot.saveHealth) }
      : null,
    degraded ? {
      area: "chapter", consequence: `Chapter "${degraded.playerTitle}" was sealed without a written summary.`, detail: "Re-seal it from the Chapters panel.",
      targetId: null, provisionable: false, player: null,
    } : null,
  ];
}

export function repairSteps(snapshot: RuntimeSnapshot): RepairStep[] {
  const steps = snapshot.storyId
    ? [memoryModelStep(snapshot), roleStep(snapshot), ...requirementSteps(snapshot), ...laterSteps(snapshot), wiGatingStep(snapshot), orphanedLorebookStep(snapshot)]
    : [wiGatingStep(snapshot), orphanedLorebookStep(snapshot)];
  return steps.filter((step): step is RepairStep => step !== null);
}

export function nextRepairStep(snapshot: RuntimeSnapshot): RepairStep | null {
  return repairSteps(snapshot)[0] ?? null;
}

export function viewerRepairStep(snapshot: RuntimeSnapshot): RepairStep | null {
  if (snapshot.ui?.authorView) return nextRepairStep(snapshot);
  const step = repairSteps(snapshot).find((candidate) => candidate.player !== null);
  return step ? { ...step, consequence: step.player as string } : null;
}
