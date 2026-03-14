import {
  retainChatSessionBridge,
  releaseChatSessionBridge,
  subscribeToChatSessionBridge,
  type ChatSessionBridgeListener,
} from "@controllers/chatSessionBridge";

export const subscribeWithRetainedChatSessionBridge = (
  listener: ChatSessionBridgeListener,
  warnLabel: string,
): (() => void) => {
  retainChatSessionBridge();
  const unsubscribe = subscribeToChatSessionBridge(listener);
  let active = true;

  return () => {
    if (!active) return;
    active = false;

    try {
      unsubscribe();
    } catch (err) {
      console.warn(`${warnLabel} failed to unsubscribe bridge listener`, err);
    }

    try {
      releaseChatSessionBridge();
    } catch (err) {
      console.warn(`${warnLabel} failed to release bridge listener`, err);
    }
  };
};
