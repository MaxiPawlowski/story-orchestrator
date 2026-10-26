import { getContext, subscribeToHostEvents } from "@services/STAPI";
import { isRecord } from "@utils/guards";
import type { GenerationLifecycleSnapshot } from "./generationLifecycle";
import { prefixDrift, replyKey, requestPromptText } from "./prefixDriftPort";

export function attachPrefixDrift(snapshot: () => GenerationLifecycleSnapshot): () => void {
  globalThis.storyOrchestratorPrefixDrift = prefixDrift.handle();
  const off = subscribeToHostEvents([
    {
      eventName: "GENERATE_AFTER_DATA",
      handler: (payload: unknown, dryRun: unknown) => {
        if (dryRun === true || !isRecord(payload)) return;
        const open = snapshot();
        if (open.outermost === null) return;
        const text = requestPromptText(payload);
        if (!text) return;
        const ctx = getContext();
        const chid = open.draftedChid;
        const member = chid === null ? null : String((ctx.characters ?? [])[chid]?.name ?? `#${chid}`);
        void prefixDrift.observe(replyKey(ctx.chatId ? String(ctx.chatId) : null, member, open.outermost.type), "reply", text);
      },
    },
  ]);
  return () => {
    off();
    prefixDrift.reset();
    Reflect.deleteProperty(globalThis, "storyOrchestratorPrefixDrift");
  };
}
