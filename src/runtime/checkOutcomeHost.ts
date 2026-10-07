import { clearStoryExtensionPrompt, setStoryExtensionPrompt } from "@services/STAPI";
import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import type { RuntimeManager } from "./runtimeManager";

export function startCheckOutcome(manager: RuntimeManager): () => void {
  const spec = INJECTION_REGISTRY.checkOutcome;
  const update = () => {
    const text = manager.getLoadedChatId() ? manager.game.outcomeBlock() : null;
    if (text) setStoryExtensionPrompt(spec.key, text, spec.depth);
    else clearStoryExtensionPrompt(spec.key);
  };
  const off = manager.subscribe(update);
  update();
  return () => {
    off();
    clearStoryExtensionPrompt(spec.key);
  };
}
