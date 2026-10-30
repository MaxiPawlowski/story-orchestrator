import { clearStoryExtensionPrompt, getContext, setStoryExtensionPrompt, subscribeToHostEvents } from "@services/STAPI";
import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import { SWIPE_CONTRAST_CLEARS, swipeContrast } from "./swipeContrast";
import { runtimeManager } from "./runtimeManager";

export function startSwipeContrast(): { arm: (type: string, withheld: boolean) => boolean; dispose: () => void } {
  const spec = INJECTION_REGISTRY.swipeContrast;
  const contrast = swipeContrast({
    enabled: () => runtimeManager.getEffectiveSettings().talk.swipeContrast === true,
    chatId: () => getContext().chatId ?? null,
    ownedChat: () => runtimeManager.getLoadedChatId(),
    rejected: () => {
      const last = (getContext().chat ?? []).at(-1) as { mes?: unknown; is_user?: unknown } | undefined;
      return last && last.is_user !== true && typeof last.mes === "string" ? last.mes : null;
    },
    set: (text) => setStoryExtensionPrompt(spec.key, text, spec.depth),
    clear: () => { clearStoryExtensionPrompt(spec.key); },
  });
  const off = subscribeToHostEvents(SWIPE_CONTRAST_CLEARS.map((eventName) => ({ eventName, handler: (_data: unknown, dryRun?: unknown) => contrast.onEvent(eventName, dryRun) })));
  return {
    arm: contrast.arm,
    dispose: () => {
      off();
      contrast.onEvent("CHAT_CHANGED");
    },
  };
}
