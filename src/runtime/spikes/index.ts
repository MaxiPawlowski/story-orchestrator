import { getContext } from "@services/STAPI";
import { log } from "@utils/log";
import type { RuntimeManager } from "../runtimeManager";
import { getGlobalSettings } from "../settingsStore";
import { publishSpikeDebug } from "../spikeDebug";
import type { TurnBridge } from "../turnBridge";
import { RecommitEdit } from "./recommitEdit";
import { chatStore, SwipeBack } from "./swipeBack";

const openChat = () => {
  const context = getContext();
  return { id: String(context.chatId ?? ""), rows: Array.isArray(context.chat) ? context.chat : [] };
};

export function installSpikes(bridge: TurnBridge, manager: RuntimeManager): () => void {
  const recommit = new RecommitEdit({
    host: manager,
    enabled: () => getGlobalSettings().spikes.recommitEdit,
    chat: openChat,
    read: async (messageId) => {
      try {
        await manager.runExtractionNow(undefined, `recommit:${messageId}`);
      } catch (error) {
        log.warn("SP2 re-commit read failed", error);
      }
    },
  });
  const swipe = new SwipeBack({ host: manager, store: chatStore, enabled: () => getGlobalSettings().spikes.swipeBackCache, chat: openChat });
  bridge.setMutationSeam((kind, messageId) => recommit.seam(kind, messageId) ?? swipe.seam(kind, messageId));
  const unpublish = publishSpikeDebug({ recommitEdit: { stats: () => ({ ...recommit.stats }) }, swipeBackCache: { stats: () => ({ ...swipe.stats }) } });
  return () => {
    bridge.setMutationSeam(null);
    recommit.dispose();
    swipe.dispose();
    unpublish();
  };
}
