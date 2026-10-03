export const NO_GROUP_NOTICE = "Stories play in group chats.";
export const NO_GROUP_STATUS = "Stories play in group chats: open a group, or make one for this story";

export interface NoGroupView {
  notice: string;
  storyId: string | null;
  storyTitle: string | null;
}

export interface NoGroupInput {
  chatOpen: boolean;
  groupOpen: boolean;
  chatId: string | null;
  selectedStoryId: string | null;
  titleOf: (storyId: string) => string | null;
}

let refused: { chatId: string; storyId: string } | null = null;

export const noteRefusedForGroup = (chatId: string | null, storyId: string): void => {
  refused = chatId ? { chatId, storyId } : null;
};

export const refusedForGroup = (chatId: string | null): string | null => (chatId && refused?.chatId === chatId ? refused.storyId : null);

export function noGroupView(input: NoGroupInput): NoGroupView | null {
  if (!input.chatOpen || input.groupOpen) return null;
  const storyId = input.selectedStoryId ?? refusedForGroup(input.chatId);
  if (!storyId) return null;
  return { notice: NO_GROUP_NOTICE, storyId, storyTitle: input.titleOf(storyId) };
}
