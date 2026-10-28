import { subscribeToHostEventFirst, subscribeToHostEvents } from "@services/STAPI";
import { onReplyReceived } from "./replyReceived";
import { createReplyRepairs } from "./replyRepairs";

export const replyRepairs = createReplyRepairs((run) => {
  const first = subscribeToHostEventFirst("MESSAGE_RECEIVED", onReplyReceived(run));
  const offPlace = subscribeToHostEvents([{ eventName: "GENERATION_STARTED", handler: first.place }]);
  return () => {
    offPlace();
    first.off();
  };
});
