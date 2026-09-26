import { readPromptBuckets, subscribeToHostEvents } from "@services/STAPI";
import { promptBuckets } from "./promptBuckets";

export function attachPromptBuckets(notify: () => void): () => void {
  const detach = promptBuckets.attach({ read: readPromptBuckets, notify });
  const off = subscribeToHostEvents([
    { eventName: "GENERATE_AFTER_DATA", handler: () => { globalThis.setTimeout(() => promptBuckets.refresh(), 0); } },
  ]);
  promptBuckets.refresh();
  return () => {
    off();
    detach();
  };
}
