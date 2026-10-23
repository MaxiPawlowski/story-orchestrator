import { getActiveCharacterId, getActiveGroup, getContext } from "@services/STAPI";
import type { RuntimeManager } from "../runtimeManager";
import { getGlobalSettings } from "../settingsStore";
import { publishSpikeDebug } from "../spikeDebug";
import { installSpikeSeams } from "../spikeSeams";
import type { TurnBridge } from "../turnBridge";
import { EditReread, p95 } from "./editReread";
import { readEdited } from "./editRereadHost";
import { chatStore, SwipeBack } from "./swipeBack";
import { ThoughtCarry } from "./thoughtCarry";

const openChat = () => {
  const context = getContext();
  return { id: String(context.chatId ?? ""), rows: Array.isArray(context.chat) ? context.chat : [] };
};

const restage = (manager: RuntimeManager) => (type: string) => {
  manager.commitContinuityNote(false);
  manager.onGenerationStarted(type);
  const drafted = getActiveCharacterId();
  if (!getActiveGroup() || drafted === undefined || drafted === null) return;
  manager.clearPrivateInjection();
  manager.onMemberDrafted(Number(drafted));
};

export function installSpikes(bridge: TurnBridge, manager: RuntimeManager): () => void {
  const edit = new EditReread({
    host: manager,
    enabled: () => getGlobalSettings().spikes.editReread,
    chat: openChat,
    reread: (messageId, run) => readEdited(manager, messageId, run),
    journal: (summary, detail) => manager.noteRecap(summary, detail),
    restage: restage(manager),
  });
  const swipe = new SwipeBack({ host: manager, store: chatStore, enabled: () => getGlobalSettings().spikes.swipeBackCache, chat: openChat });
  bridge.setMutationSeam((kind, messageId, entered) => edit.seam(kind, messageId, entered) ?? (entered ? null : swipe.seam(kind, messageId)));
  const thought = new ThoughtCarry(() => getGlobalSettings().spikes.thoughtCarry);
  const polish = { release: null as (() => void) | null, stopped: false };
  void import("../polish/install").then(({ installPolish }) => { if (!polish.stopped) polish.release = installPolish(bridge, manager); });
  const releaseHold = installSpikeSeams({ hold: (type) => edit.hold(type), ownsReread: () => edit.ownsReread(), carry: (input) => thought.carry(input) });
  const unpublish = publishSpikeDebug({
    swipeBackCache: { stats: () => ({ ...swipe.stats }) },
    editReread: { stats: () => ({ ...edit.stats, holdMs: [...edit.stats.holdMs], holdP95Ms: p95(edit.stats.holdMs) }) },
    thoughtCarry: { stats: () => ({ ...thought.stats }) },
  });
  return () => {
    polish.stopped = true;
    polish.release?.();
    bridge.setMutationSeam(null);
    releaseHold();
    edit.dispose();
    swipe.dispose();
    unpublish();
  };
}
