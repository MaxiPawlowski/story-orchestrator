export const boundStoryForEmptyChat = (root: Record<string, unknown>, groupId: unknown, chat: unknown): string | null => {
  if (typeof groupId !== "string" && typeof groupId !== "number") return null;
  if (!Array.isArray(chat) || chat.length !== 0) return null;
  const bindings = root.groupStories;
  if (!bindings || typeof bindings !== "object" || Array.isArray(bindings)) return null;
  const storyId = (bindings as Record<string, unknown>)[String(groupId)];
  return typeof storyId === "string" && storyId.trim() ? storyId : null;
};
