export const boundStoryForEmptyChat = (root: Record<string, unknown>, groupId: unknown, chat: unknown): string | null => {
  if (typeof groupId !== "string" && typeof groupId !== "number") return null;
  if (!Array.isArray(chat) || chat.length !== 0) return null;
  return readGroupStories(root)[String(groupId)] ?? null;
};

export const readGroupStories = (root: Record<string, unknown>): Record<string, string> => {
  const bindings = root.groupStories;
  if (!bindings || typeof bindings !== "object" || Array.isArray(bindings)) return {};
  return Object.fromEntries(Object.entries(bindings as Record<string, unknown>)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim() !== ""));
};

export const bindGroupStory = (bindings: Record<string, string>, groupId: string, storyId: string | null): Record<string, string> => {
  const { [groupId]: _dropped, ...rest } = bindings;
  return storyId && storyId.trim() ? { ...rest, [groupId]: storyId } : rest;
};

export const heldGroupBinding = (stored: Record<string, unknown> | null, write: { groupId: string; storyId: string | null }): string | null => {
  if (stored === null) return "the server's settings could not be read back";
  const held = readGroupStories(stored)[write.groupId] ?? null;
  return held === write.storyId ? null : `the server binds this group to ${held ?? "no story"}`;
};
