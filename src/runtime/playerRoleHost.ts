import { clearStoryExtensionPrompt, setStoryExtensionPrompt, subscribeToHostEvents } from "@services/STAPI";
import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import { playerRoleBlock } from "./playerSetup";
import { personaRead } from "./playerSetupPort";
import type { RuntimeManager } from "./runtimeManager";

export function startPlayerRole(manager: RuntimeManager): () => void {
  const spec = INJECTION_REGISTRY.playerRole;
  const update = () => {
    const text = manager.getLoadedChatId() ? playerRoleBlock(manager.getStory(), personaRead()) : null;
    if (text) setStoryExtensionPrompt(spec.key, text, spec.depth);
    else clearStoryExtensionPrompt(spec.key);
  };
  const off = manager.subscribe(update);
  const changed = () => { update(); manager.notify(); };
  const events = subscribeToHostEvents([
    { eventName: "PERSONA_CHANGED", handler: changed },
    { eventName: "PERSONA_UPDATED", handler: changed },
    { eventName: "SETTINGS_UPDATED", handler: changed },
  ]);
  update();
  return () => {
    off();
    events();
    clearStoryExtensionPrompt(spec.key);
  };
}
