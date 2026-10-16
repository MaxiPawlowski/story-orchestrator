import { hostMessageId } from "./turnBridge";

export const onReplyReceived = (handler: (messageId: number) => void) => (messageId: unknown) => {
  const id = hostMessageId(messageId);
  if (id !== null) handler(id);
};
