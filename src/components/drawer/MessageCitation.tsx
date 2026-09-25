import { createContext, useContext, type ReactNode } from "react";
import { fingerprintAt, jumpLabel, type ChatJumpIndex } from "@runtime/messageJump";

export interface MessageJump {
  enabled: boolean;
  index: ChatJumpIndex | null;
  onJump: ((messageId: number) => void) | null;
}

export const MessageJumpContext = createContext<MessageJump>({ enabled: false, index: null, onJump: null });

export const MessageJumpProvider = ({ value, children }: { value: MessageJump; children: ReactNode }) => (
  <MessageJumpContext.Provider value={value}>{children}</MessageJumpContext.Provider>
);

const TITLES = {
  same: "Scroll the chat to this message",
  changed: "This message was edited or moved since it was read; it still opens",
  unknown: "No boundary fingerprinted this message, so the index may have shifted",
};

export const MessageCitation = ({ messageId, prefix = "message" }: { messageId: number | undefined; prefix?: "message" | "msg" }) => {
  const jump = useContext(MessageJumpContext);
  if (messageId === undefined || !Number.isFinite(messageId) || messageId < 0) return null;
  if (!jump.enabled || !jump.onJump) return <>{`${prefix} ${messageId}`}</>;
  const fingerprint = fingerprintAt(jump.index, messageId);
  const onJump = jump.onJump;
  return (
    <button type="button" data-so="jump-to-message" data-mesid={messageId} data-fingerprint={fingerprint} className="menu_button text-xs" title={TITLES[fingerprint]} onClick={() => onJump(messageId)}>
      {jumpLabel(messageId, fingerprint)}
    </button>
  );
};
