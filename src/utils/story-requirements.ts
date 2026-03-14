import type { StoryRequirementsState } from "@store/requirementsState";
import type { NormalizedStory } from "@utils/story-validator";
import { normalizeName } from "@utils/string";

export interface LorebookEntryLike {
  comment?: string | null;
}

export interface LorebookLike {
  entries?: Record<number, LorebookEntryLike> | null;
}

export interface GroupLike {
  id?: unknown;
  members?: unknown[];
}

export interface RequirementsContextLike {
  chatId?: unknown;
  groupId?: unknown;
  groups?: GroupLike[];
  name1?: string | null;
}

export interface WorldInfoSettingsLike {
  world_info?: {
    globalSelect?: string[];
  } | null;
}

export const buildRequirementsState = (
  story: NormalizedStory | null,
  input: Omit<StoryRequirementsState, "requirementsReady">,
): StoryRequirementsState => ({
  ...input,
  requirementsReady: Boolean(
    story
    && input.personaDefined
    && input.groupChatSelected
    && input.missingGroupMembers.length === 0
    && input.worldLoreEntriesPresent
    && input.globalLoreBookPresent,
  ),
});

export const computeGlobalLoreStatus = (
  story: NormalizedStory | null,
  settings: WorldInfoSettingsLike | null | undefined,
): { globalMissing: string[]; globalLoreBookPresent: boolean } => {
  const lorebook = story?.global_lorebook;
  if (!lorebook) return { globalMissing: [], globalLoreBookPresent: true };
  const globalSelect = settings?.world_info?.globalSelect ?? [];
  const found = globalSelect.some((entry) => entry.trim().toLowerCase() === lorebook.toLowerCase());
  const globalMissing = found ? [] : [lorebook];
  return { globalMissing, globalLoreBookPresent: globalMissing.length === 0 };
};

export const getChatContextKey = (context: RequirementsContextLike | null | undefined): string => {
  const chatId = context?.chatId == null ? "" : String(context.chatId).trim();
  const groupId = context?.groupId == null ? "" : String(context.groupId).trim();
  return `${chatId}::${groupId}`;
};

export const extractWorldInfoKeys = (story: NormalizedStory | null): string[] => {
  if (!story) return [];
  const keys = new Set<string>();
  for (const checkpoint of story.checkpoints) {
    const worldInfo = checkpoint.world_info;
    if (!worldInfo) continue;
    for (const name of [...(worldInfo.activate ?? []), ...(worldInfo.deactivate ?? [])]) {
      if (name) keys.add(name);
    }
  }
  return Array.from(keys);
};

export const extractRoleNames = (story: NormalizedStory | null): { names: string[]; normalized: string[] } => {
  if (!story?.roles) return { names: [], normalized: [] };
  const names = Object.values(story.roles)
    .filter((name): name is string => typeof name === "string" && Boolean(name.trim()))
    .map((name) => name.trim());
  return {
    names,
    normalized: names
      .map((name) => normalizeName(name, { stripExtension: true }))
      .filter(Boolean),
  };
};

export const computeMissingGroupMembers = (
  context: RequirementsContextLike | null | undefined,
  requiredRoleNames: string[],
  requiredRoleNamesNormalized: string[],
  resolveGroupMemberName: (member: unknown) => string,
): string[] => {
  if (!requiredRoleNames.length) return [];
  const groupId = context?.groupId?.toString().trim();
  if (!groupId) return requiredRoleNames.slice();
  const groups = context?.groups ?? [];
  const currentGroup = groups.find((group) => group?.id?.toString().trim() === groupId);
  if (!currentGroup?.members?.length) return requiredRoleNames.slice();

  const groupMembers = currentGroup.members
    .map((member) => normalizeName(resolveGroupMemberName(member), { stripExtension: true }))
    .filter(Boolean);

  return requiredRoleNamesNormalized
    .map((normalized, index) => groupMembers.includes(normalized) ? null : requiredRoleNames[index])
    .filter(Boolean) as string[];
};

export const collectMissingLoreEntries = (
  requiredWorldInfoKeys: string[],
  lorebook: LorebookLike | null | undefined,
): string[] => {
  if (!requiredWorldInfoKeys.length) return [];
  if (!lorebook?.entries) return requiredWorldInfoKeys.slice();
  const seen = new Set(
    Object.values(lorebook.entries)
      .map((entry) => entry?.comment?.trim().toLowerCase())
      .filter(Boolean),
  );
  return requiredWorldInfoKeys.filter((name) => !seen.has(name.toLowerCase()));
};
