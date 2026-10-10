import type { PassRole } from "@extraction/passRole";
import type { RuntimeSnapshot } from "./types";
import type { Check, CheckFinding } from "./checks";
import { hasUnsavedChanges, playerSaveNotice, SAVE_PLAYER_TEXT } from "./saveHealth";
import { ROLE_OUTAGE_STATES, ROLE_PROBLEM_STATES } from "./roleHealth";
import { mutedMembersText, REPAIR_PLAYER_COPY, TRANSPORT_PLAYER_TEXT } from "./pipeline";

export const REPAIR_TARGET_IDS = { memoryModel: "so-extraction-profile" } as const;

export const WI_GATING_TARGET_ID = "so-wi-gating";

export const STORY_LORE_TARGET_ID = "so-story-lore-global";

export const roleProfileTargetId = (role: PassRole): string => `so-role-profile-${role}`;

export const ROLE_CONSEQUENCES: Record<PassRole, string> = {
  read: "The story will not advance on its own until this is fixed.",
  synthesis: "Scene summaries and the story so far stop updating.",
  authoring: "The wizard, the driver's suggestions and the prepared road ahead stop working.",
  director: "Speaker direction falls back to ST's own choice.",
  curator: "The World Info curator stops proposing changes.",
  inner: "Characters stop preparing a private intent before they speak.",
  lore: "The curator stops proposing new lorebook entries.",
};

const ROLE_PLAYER_COPY: Partial<Record<PassRole, string>> = {
  read: REPAIR_PLAYER_COPY.read,
  synthesis: REPAIR_PLAYER_COPY.synthesis,
};

type Requirements = RuntimeSnapshot["requirements"];

export const provisionableMissing = (requirements: Requirements) => ({
  personas: requirements.missingPersonas,
  members: requirements.absentMembers ?? requirements.missingMembers,
  lorebooks: requirements.absentLorebooks ?? requirements.missingLorebooks,
});

const MISSING_CAST = "The story expects people who are not in this chat, so their scenes never arrive.";
const MISSING_LORE = "The story reads from lore it cannot see, so nothing it needs to know is in play.";
const them = (names: string[], one: string, many: string) => (names.length === 1 ? one : many);
const quoted = (names: string[]) => names.map((name) => `"${name}"`).join(", ");

const requirementsOf = (snapshot: RuntimeSnapshot): Requirements | null => snapshot.requirements ?? null;

export const castAbsent = (requirements: Requirements): CheckFinding | null => {
  const absent = provisionableMissing(requirements).members;
  return absent.length ? { consequence: MISSING_CAST, detail: `No card on this install: ${absent.join(", ")}`, provisionable: true, player: REPAIR_PLAYER_COPY.cast } : null;
};

export const castUnbound = (requirements: Requirements): CheckFinding | null => {
  const absent = provisionableMissing(requirements).members;
  const unbound = requirements.missingMembers.filter((member) => !absent.includes(member));
  if (!unbound.length) return null;
  return {
    consequence: MISSING_CAST,
    detail: `Not in the group: ${unbound.join(", ")}. ${them(unbound, "The card exists", "The cards exist")}, so ${them(unbound, "add it", "add them")} back to the group.`,
    player: REPAIR_PLAYER_COPY.cast,
    action: { kind: "add-members", members: unbound, label: `Add ${unbound.join(", ")} back to the group` },
    target: { kind: "group-members" },
  };
};

export const castMuted = (requirements: Requirements): CheckFinding | null => {
  const muted = requirements.mutedMembers ?? [];
  if (!muted.length) return null;
  return {
    consequence: mutedMembersText(muted),
    detail: `Muted in the group: ${muted.join(", ")}. Unmute ${them(muted, "this member", "these members")} in the group's member list.`,
    player: mutedMembersText(muted),
    action: { kind: "unmute-members", members: muted, label: `Unmute ${muted.join(", ")}` },
    target: { kind: "group-members" },
  };
};

export const loreAbsent = (requirements: Requirements): CheckFinding | null => {
  const absent = provisionableMissing(requirements).lorebooks;
  return absent.length ? { consequence: MISSING_LORE, detail: `No lorebook on this install: ${absent.join(", ")}`, provisionable: true, player: REPAIR_PLAYER_COPY.lore } : null;
};

export const loreUnscanned = (requirements: Requirements): CheckFinding | null => {
  const absent = provisionableMissing(requirements).lorebooks;
  const unscanned = requirements.missingLorebooks.filter((book) => !absent.includes(book));
  if (!unscanned.length) return null;
  return {
    consequence: MISSING_LORE,
    detail: `${unscanned.join(", ")} ${them(unscanned, "exists", "exist")} on this install but this chat does not scan ${them(unscanned, "it", "them")}. ` +
      "A story's own lorebooks load with the story in the chats that play it; on this install SillyTavern does not let them be added at scan time, " +
      `so select ${them(unscanned, "it", "them")} in World Info.`,
    player: REPAIR_PLAYER_COPY.lore,
  };
};

export const personaAbsent = (requirements: Requirements): CheckFinding | null => {
  const absent = requirements.absentPersonas ?? [];
  if (!absent.length) return null;
  return {
    consequence: `This story requires the persona ${quoted(absent)}, which does not exist on this install, so it never starts.`,
    detail: `No persona called ${quoted(absent)} on this install. Personas are never created by the wizard: remove the requirement from the story, or create ` +
      `${them(absent, "that persona", "those personas")} in SillyTavern's Persona Management.`,
    player: REPAIR_PLAYER_COPY.persona,
    action: { kind: "remove-personas", members: absent, label: `Remove the ${quoted(absent)} persona requirement` },
  };
};

export const personaUnselected = (requirements: Requirements): CheckFinding | null => {
  const absent = requirements.absentPersonas ?? [];
  const unselected = requirements.missingPersonas.filter((name) => !absent.includes(name));
  if (!unselected.length) return null;
  return {
    consequence: `This story is written for the persona ${quoted(unselected)}, and a different one is selected.`,
    detail: `Missing persona: ${unselected.join(", ")}. Select it in Persona Management.`,
    player: REPAIR_PLAYER_COPY.persona,
  };
};

const fromRequirements = (read: (requirements: Requirements) => CheckFinding | null) => (snapshot: RuntimeSnapshot): CheckFinding | null => {
  const requirements = requirementsOf(snapshot);
  return requirements ? read(requirements) : null;
};

const entryCounts = (entries: Array<{ lorebook: string; comment: string }>) => {
  const counts = new Map<string, number>();
  entries.forEach((entry) => counts.set(entry.lorebook, (counts.get(entry.lorebook) ?? 0) + 1));
  return [...counts].map(([lorebook, count]) => `${count} ${count === 1 ? "entry" : "entries"} in ${lorebook}`).join(", ");
};

const story = (id: string, area: Check["area"], audience: Check["audience"], detect: Check["detect"], feature?: string): Check =>
  ({ id, area, scope: "story", audience, severity: "blocks", detect, ...(feature ? { feature } : {}) });

export const MEMORY_MODEL_CHECK = story("memory-model", "memory-model", "player", (snapshot) => {
  const settings = snapshot.extraction.settings;
  const config = snapshot.extractionHealth?.kind === "config" ? snapshot.extractionHealth.detail : null;
  if (settings.enabled && settings.profileId && !config) return null;
  return {
    consequence: "The story will not advance on its own until this is set.",
    detail: !settings.enabled ? "Automatic story advancement is off." : settings.profileId ? config ?? "" : "No memory model profile is selected.",
    target: { kind: "setting", id: REPAIR_TARGET_IDS.memoryModel },
    player: REPAIR_PLAYER_COPY.memoryModel,
  };
}, "memory");

export const MODEL_ROLE_CHECK = story("model-role", "model-role", "player", (snapshot) => {
  const route = (snapshot.roleRoutes ?? []).find((entry) => ROLE_PROBLEM_STATES.has(entry.state));
  if (!route) return null;
  return { consequence: ROLE_CONSEQUENCES[route.role], detail: route.detail, target: { kind: "setting", id: roleProfileTargetId(route.role) }, player: ROLE_PLAYER_COPY[route.role] ?? null };
}, "models-per-task");

export const ROLE_OUTAGE_CONSEQUENCES: Record<PassRole, string> = {
  read: "The story is not advancing on its own while this model is not answering. It is retried on its own, and the chat stays playable.",
  synthesis: "Scene summaries and the story so far pause until this model answers again.",
  authoring: "The wizard, the driver's suggestions and the prepared road ahead pause until this model answers again.",
  director: "Speaker direction falls back to ST's own choice until this model answers again.",
  curator: "The World Info curator pauses until this model answers again.",
  inner: "Characters skip their private intent until this model answers again.",
  lore: "The curator stops proposing new lorebook entries until this model answers again.",
};

const ROLE_OUTAGE_PLAYER_COPY: Partial<Record<PassRole, string>> = {
  read: TRANSPORT_PLAYER_TEXT,
  synthesis: "The story so far pauses until the model answers again.",
};

const STAND_IN_PLAYER_TEXT = "A model the story uses is not answering, so another one is standing in until it is back.";

export const MODEL_ROLE_OUTAGE_CHECK: Check = {
  id: "model-role-outage", area: "model-role", scope: "story", audience: "player", severity: "degrades", feature: "models-per-task",
  detect: (snapshot) => {
    const route = (snapshot.roleRoutes ?? []).find((entry) => ROLE_OUTAGE_STATES.has(entry.state));
    if (!route) return null;
    return route.fallback ? {
      consequence: `${route.label} is not answering, so ${route.fallback} stands in until it answers again.`,
      detail: route.detail,
      target: { kind: "setting", id: roleProfileTargetId(route.role) },
      player: route.role === "read" || route.role === "synthesis" ? STAND_IN_PLAYER_TEXT : null,
    } : {
      consequence: ROLE_OUTAGE_CONSEQUENCES[route.role],
      detail: route.detail,
      target: { kind: "setting", id: roleProfileTargetId(route.role) },
      player: ROLE_OUTAGE_PLAYER_COPY[route.role] ?? null,
    };
  },
};

export const MODEL_CHECKS: readonly Check[] = [MEMORY_MODEL_CHECK, MODEL_ROLE_CHECK, MODEL_ROLE_OUTAGE_CHECK];

export const REQUIREMENT_CHECKS: readonly Check[] = [
  story("cast-absent", "cast", "player", fromRequirements(castAbsent), "stories"),
  story("cast-unbound", "cast", "player", fromRequirements(castUnbound), "stories"),
  story("cast-muted", "cast", "player", fromRequirements(castMuted), "stories"),
  story("lore-absent", "lore", "player", fromRequirements(loreAbsent), "story-lorebooks"),
  story("lore-unscanned", "lore", "player", fromRequirements(loreUnscanned), "story-lorebooks"),
  story("lore-hidden", "lore", "author", (snapshot) => {
    const hidden = snapshot.requirements ? snapshot.loreEvidence?.hiddenBooks ?? [] : [];
    return hidden.length ? { consequence: "Another extension is hiding this story's lorebook from the model.", detail: `Hidden from the model: ${hidden.join(", ")}` } : null;
  }, "story-lorebooks"),
  story("persona-absent", "persona", "player", fromRequirements(personaAbsent), "stories"),
  story("persona-unselected", "persona", "player", (snapshot) => {
    const finding = fromRequirements(personaUnselected)(snapshot);
    return finding && snapshot.playerSetup?.beforeFirstMessage ? { ...finding, action: { kind: "open-player-setup", label: "Open the start page" } } : finding;
  }, "stories"),
  story("memory-slot-taken", "lore", "author", (snapshot) => {
    const displaced = snapshot.requirements?.slotConflict;
    return displaced && snapshot.memory?.wiBook ? {
      consequence: "This chat's story memory is not reaching the model, because the chat lorebook slot holds another book.",
      detail: `Chat lorebook: ${displaced.book}`,
    } : null;
  }, "memory-lore"),
  story("save-unconfirmed", "save", "player", (snapshot) => (snapshot.saveHealth && hasUnsavedChanges(snapshot.saveHealth)
    ? { consequence: "Your last turn is not saved on the server yet.", detail: SAVE_PLAYER_TEXT, player: playerSaveNotice(snapshot.saveHealth) }
    : null)),
];

const degrades = (check: Omit<Check, "severity">): Check => ({ ...check, severity: "degrades" });

export const IMAGE_TARGET_ID = "so-image-settings";

export const IMAGE_CHECKS: readonly Check[] = [
  degrades({
    id: "images-on-no-service", area: "image", scope: "install", audience: "author", feature: "images",
    detect: (snapshot) => {
      const health = snapshot.imageHealth;
      const wants = Boolean(snapshot.imageStory && (snapshot.imageStory.checkpoints || snapshot.imageStory.scenes));
      if (!health?.enabled || health.automation === "manual" || !wants || health.service !== "absent") return null;
      return {
        consequence: "This story asks for pictures, but nothing can draw them, so it plays without them.",
        detail: health.detail,
        target: { kind: "setting", id: IMAGE_TARGET_ID },
      };
    },
  }),
  degrades({
    id: "image-model-missing", area: "image", scope: "install", audience: "author", feature: "images",
    detect: (snapshot) => {
      const missing = snapshot.imageHealth?.missingModels ?? [];
      return missing.length ? {
        consequence: "A picture type has no model on this ComfyUI that it can use, so those pictures are not drawn.",
        detail: `${missing.join("; ")}. Choose the model under Picture types; a type picks a model by itself only when exactly one installed model fits its recipe family.`,
        target: { kind: "setting", id: IMAGE_TARGET_ID },
      } : null;
    },
  }),
  degrades({
    id: "image-model-retired", area: "image", scope: "install", audience: "author", feature: "images",
    detect: (snapshot) => {
      const retired = snapshot.imageRetired ?? [];
      return retired.length ? {
        consequence: "A picture setting chose a model Story Orchestrator no longer supports, so it now uses the default SDXL model.",
        detail: `Replaced with the default: ${retired.map((entry) => `${entry.where} (${entry.was})`).join(", ")}. FLUX is no longer supported; `
          + "backgrounds use the SDXL wide picture type. Pick another model under Picture types, or dismiss this row.",
        target: { kind: "setting", id: IMAGE_TARGET_ID },
      } : null;
    },
  }),
  degrades({
    id: "story-workflow-missing", area: "image", scope: "story", audience: "player",
    detect: (snapshot) => {
      const health = snapshot.imageHealth?.storyWorkflows;
      const missing = [...health?.missing ?? [], ...(health?.missingNodes ?? []).map((node) => `node ${node}`)];
      const copy = "Some pictures use your own image settings.";
      return missing.length ? { consequence: copy, detail: `Missing: ${missing.join(", ")}.`, player: copy } : null;
    },
  }),
];

export const INFO_SETUP_CHECKS: readonly Check[] = [
  {
    id: "look-sprites-missing", area: "image", scope: "story", audience: "author", severity: "info", feature: "sprite-builder",
    detect: (snapshot) => {
      const issues = snapshot.spriteLookIssues ?? [];
      return issues.length ? {
        consequence: "A character's changed appearance has no matching sprites, so the stage keeps an older look.",
        detail: issues.map((issue) => `${issue.name}: ${issue.reason}`).join(" · "),
        target: { kind: "setting", id: "so-sprite-on-demand" },
      } : null;
    },
  },
  {
    id: "gpu-broker-no-text-model", area: "image", scope: "install", audience: "author", severity: "info", feature: "images",
    detect: (snapshot) => (snapshot.imageHealth?.broker === "none" ? {
      consequence: "The GPU broker is installed but shares no text model, so image renders never pause a local model.",
      detail: "Adapter: none; images pass through.",
    } : null),
  },
];

export const DEGRADING_SETUP_CHECKS: readonly Check[] = [
  degrades({
    id: "chapter-unsummarized", area: "chapter", scope: "story", audience: "author", feature: "chapters",
    detect: (snapshot) => {
      const degraded = (snapshot.memory?.chapters ?? []).find((record) => record.status === "degraded");
      return degraded ? { consequence: `Chapter "${degraded.playerTitle}" was sealed without a written summary.`, detail: "Re-seal it from the Chapters panel." } : null;
    },
  }),
  degrades({
    id: "wi-gating-drift", area: "lore", scope: "install", audience: "author", feature: "lorebook-switching",
    detect: (snapshot) => {
      const status = snapshot.wiGating;
      if (status?.mode !== "scan" || (!status.drift.length && !status.missingKey.length)) return null;
      return {
        consequence: "A story lorebook entry was switched on outside the story; it will show in chats without the story.",
        detail: [
          ...(status.drift.length ? [`Switched on outside the story: ${entryCounts(status.drift)}`] : []),
          ...(status.missingKey.length ? [`Cannot be switched off for this chat: ${entryCounts(status.missingKey)}`] : []),
        ].join(" · "),
        target: { kind: "setting", id: WI_GATING_TARGET_ID },
      };
    },
  }),
  degrades({
    id: "story-lore-global", area: "lore", scope: "install", audience: "author", feature: "story-lorebooks",
    detect: (snapshot) => {
      const books = snapshot.globalStoryLore ?? [];
      return books.length ? {
        consequence: "Story lorebooks are switched on for every chat, so their entries reach chats that play other stories.",
        detail: `Selected for every chat: ${books.join(", ")}`,
        target: { kind: "setting", id: STORY_LORE_TARGET_ID },
      } : null;
    },
  }),
  degrades({
    id: "orphaned-lorebooks", area: "lore", scope: "install", audience: "author", feature: "memory-lore",
    detect: (snapshot) => {
      const orphans = snapshot.orphanedLorebooks ?? [];
      return orphans.length ? {
        consequence: "A deleted chat left its story memory behind in a lorebook.",
        detail: orphans.map((orphan) => `${orphan.label ? `${orphan.label[0].toUpperCase()}${orphan.label.slice(1)}` : "A deleted chat"}: ${orphan.detail}. Lorebook: ${orphan.name}`).join("; "),
      } : null;
    },
  }),
  degrades({
    id: "styles-missing", area: "display", scope: "install", audience: "player", feature: "capabilities",
    detect: (snapshot) => (snapshot.stylesMissing ? {
      consequence: "Story Orchestrator's panels show without their layout, so some controls can be hard to read or reach.",
      detail: "The extension's stylesheet did not load when the page started (the browser console names the error). Reload the page; "
        + "if it keeps happening, the extension's files on the server are incomplete, so reinstall or update it.",
      player: "Story Orchestrator's panels did not load their layout. Reload the page to fix it.",
    } : null),
  }),
];
