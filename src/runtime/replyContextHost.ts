import { readServedContextWith } from "@services/stHost/servedContextPort";
import { readReplyContext, servedContext } from "@services/stHost/servedContext";
import { contextOverServer, readReplyContextWith } from "./replyContext";

export const startReplyContext = (): (() => void) => {
  const stopServed = readServedContextWith((url) => servedContext(url));
  const stopReply = readReplyContextWith(() => contextOverServer(readReplyContext()));
  return () => { stopServed(); stopReply(); };
};
