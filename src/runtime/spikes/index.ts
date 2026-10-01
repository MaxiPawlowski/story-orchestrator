import { getContext } from "@services/STAPI";
import type { RuntimeManager } from "../runtimeManager";
import { getGlobalSettings } from "../settingsStore";
import { publishSpikeDebug } from "../spikeDebug";
import type { TurnBridge } from "../turnBridge";
import { chatStore, SwipeBack } from "./swipeBack";

const openChat = () => {
  const context = getContext();
  return { id: String(context.chatId ?? ""), rows: Array.isArray(context.chat) ? context.chat : [] };
};

export function installSpikes(bridge: TurnBridge, manager: RuntimeManager): () => void {
  const swipe = new SwipeBack({ host: manager, store: chatStore, enabled: () => getGlobalSettings().spikes.swipeBackCache, chat: openChat });
  bridge.setMutationSeam((kind, messageId) => swipe.seam(kind, messageId));
  const unpublish = publishSpikeDebug({ swipeBackCache: { stats: () => ({ ...swipe.stats }) } });
  return () => {
    bridge.setMutationSeam(null);
    swipe.dispose();
    unpublish();
  };
}
