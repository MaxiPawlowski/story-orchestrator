import { getContext, observeNextSettingsSave, readServerExtensionSettings } from "@services/STAPI";
import { bindGroupStory, heldGroupBinding, readGroupStories } from "./groupStoryBinding";
import { createSettingsWriteEvidence, recordSettingsWrite, type LibrarySaveEvidence } from "./librarySave";
import { SETTINGS_ROOT_KEY, settingsRoot, writableSettingsRoot } from "./settingsRoot";

export interface OpenGroup {
  id: string;
  name: string;
}

export const openGroup = (): OpenGroup | null => {
  const ctx = getContext();
  const id = typeof ctx.groupId === "string" || typeof ctx.groupId === "number" ? String(ctx.groupId) : "";
  if (!id) return null;
  const group = ctx.groups.find((entry) => String(entry.id) === id);
  return { id, name: typeof group?.name === "string" && group.name ? group.name : id };
};

export const groupStoryBinding = (groupId: string): string | null => readGroupStories(settingsRoot())[groupId] ?? null;

const confirmBinding = createSettingsWriteEvidence<{ groupId: string; storyId: string | null }, Record<string, unknown>>({
  observe: () => observeNextSettingsSave(),
  readBack: () => readServerExtensionSettings(SETTINGS_ROOT_KEY),
}, heldGroupBinding);

export function setGroupStoryBinding(groupId: string, storyId: string | null): Promise<LibrarySaveEvidence> | null {
  const root = writableSettingsRoot();
  root.groupStories = bindGroupStory(readGroupStories(root), groupId, storyId);
  const write = { groupId, storyId: storyId && storyId.trim() ? storyId : null };
  const evidence = recordSettingsWrite("group story binding not confirmed", `groupStories.${groupId}`, () => confirmBinding(write));
  getContext().saveSettingsDebounced();
  return evidence;
}
