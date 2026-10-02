export const NO_CHAT_NOTICE = "No chat is open. A story you import is saved to the library; open a chat to play it.";

let savedWithoutChat: string | null = null;

export const noteSavedWithoutChat = (sentence: string | null): void => {
  savedWithoutChat = sentence;
};

export const noChatView = (open: boolean): { notice: string } | null => (open ? null : { notice: savedWithoutChat ?? NO_CHAT_NOTICE });
