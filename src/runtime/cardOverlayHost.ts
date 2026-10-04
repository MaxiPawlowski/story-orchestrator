import { setStoryExtensionPrompt, clearStoryExtensionPrompt, getPlayerName } from "@services/STAPI";
import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import { cardValues, publicLook } from "@engine/cardFields";
import type { RuntimeManager } from "./runtimeManager";

export function startCardOverlay(manager: RuntimeManager): () => void {
  let previous = "";
  const spec = INJECTION_REGISTRY.cardOverlay;
  const update = () => {
    const snapshot = manager.getSnapshot();
    const story = manager.getStory();
    const enabled = new Set(manager.getEnabledCharacterIds());
    const rows = story && snapshot.ready && manager.getGlobalSettings().sprites.cardOverlay
      ? [...story.roster.filter((member) => enabled.has(member.id)).map((member) => {
        const look = publicLook(cardValues(story, snapshot.blackboard, member.id));
        return look ? `${member.name ?? member.id}: ${look}` : "";
      }), ...(story.player?.card && publicLook(cardValues(story, snapshot.blackboard, "player"))
        ? [`${getPlayerName()}: ${publicLook(cardValues(story, snapshot.blackboard, "player"))}`] : [])].filter(Boolean) : [];
    const text = rows.length ? `Current public state (overrides the character card where they differ):\n${rows.join("\n")}` : "";
    if (text === previous) return;
    previous = text;
    if (text) setStoryExtensionPrompt(spec.key, text, spec.depth);
    else clearStoryExtensionPrompt(spec.key);
  };
  const off = manager.subscribe(update);
  update();
  return () => { off(); clearStoryExtensionPrompt(spec.key); };
}
