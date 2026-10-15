import { clearStoryExtensionPrompt, setStoryExtensionPrompt } from "@services/STAPI";
import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import type { RuntimeManager } from "./runtimeManager";

export function startCheckOutcome(manager: RuntimeManager): () => void {
  const spec = INJECTION_REGISTRY.checkOutcome;
  const update = () => {
    const block = manager.getLoadedChatId() && !manager.turnBlocksHeld() ? manager.game.outcomeBlock() : null;
    const shown = block ? manager.memoryActions.restingText(block) : null;
    const text = shown && (shown === block || shown.split("\n").some((line) => line.startsWith("- "))) ? shown : null;
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
