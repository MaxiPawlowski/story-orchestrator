import { getContext } from "@services/STAPI";
import { log } from "@utils/log";
import type { RuntimeManager } from "../runtimeManager";
import { getGlobalSettings } from "../settingsStore";
import type { TurnBridge } from "../turnBridge";
import { RecommitEdit } from "./recommitEdit";

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
  bridge.setMutationSeam((kind, messageId) => recommit.seam(kind, messageId));
  globalThis.storyOrchestratorSpikes = { recommitEdit: { stats: () => ({ ...recommit.stats }) } };
  return () => {
    bridge.setMutationSeam(null);
    recommit.dispose();
    globalThis.storyOrchestratorSpikes = undefined;
  };
}
