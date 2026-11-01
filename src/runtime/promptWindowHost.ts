import { getContext, subscribeToHostEvents } from "@services/STAPI";
import { isRecord } from "@utils/guards";
import { withholds, type GenerationLifecycleSnapshot } from "./generationLifecycle";
import { requestPromptText } from "./prefixDriftPort";
import { oldestInWindow, promptWindow } from "./promptWindow";

export function attachPromptWindow(snapshot: () => GenerationLifecycleSnapshot): () => void {
  const off = subscribeToHostEvents([
    {
      eventName: "GENERATE_AFTER_DATA",
      handler: (payload: unknown, dryRun: unknown) => {
        const open = snapshot().outermost;
        if (dryRun === true || !isRecord(payload) || open === null || withholds(open.type)) return;
        const text = requestPromptText(payload);
        if (text) promptWindow.observe(oldestInWindow(text, getContext().chat ?? []));
      },
    },
    { eventName: "CHAT_CHANGED", handler: () => promptWindow.reset() },
  ]);
  return () => {
    off();
    promptWindow.reset();
  };
}
