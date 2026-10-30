export const NO_GROUP_NOTICE = "Stories play in group chats.";
export const NO_GROUP_STATUS = "Stories play in group chats: open a group, or make one for this story";
export const NO_GROUP_PICK = "This is a one-on-one chat. Open a group chat, or pick a story in the library and make a group for it here.";

export interface PlayEmptyState {
  kind: "no-chat" | "no-group" | "no-story";
  heading: string;
  text: string;
}

export const PLAY_EMPTY: Record<PlayEmptyState["kind"], PlayEmptyState> = {
  "no-chat": { kind: "no-chat", heading: "No chat open", text: "Open a group chat to play a story." },
  "no-group": { kind: "no-group", heading: NO_GROUP_NOTICE.replace(/\.$/, ""), text: NO_GROUP_PICK },
  "no-story": { kind: "no-story", heading: "No story in this chat", text: "Choose a story for this chat." },
};

export const playEmptyState = (snapshot: { ready: boolean; noChat?: unknown; noGroup?: NoGroupView | null }): PlayEmptyState | null =>
  (snapshot.ready ? null : snapshot.noChat ? PLAY_EMPTY["no-chat"] : snapshot.noGroup ? PLAY_EMPTY["no-group"] : PLAY_EMPTY["no-story"]);

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
  return { notice: NO_GROUP_NOTICE, storyId, storyTitle: storyId ? input.titleOf(storyId) : null };
}
