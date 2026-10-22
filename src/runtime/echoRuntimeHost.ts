import { enabledCharacterIds } from "./roster";
import { resolveFeatures } from "./featureResolve";
import { getGlobalSettings } from "./settingsStore";
import { createEchoRuntime, type EchoRuntime } from "./echoRuntime";
import type { CuePort } from "./cuePort";
import type { ManagerPort } from "./managerWiring";
import type { MemoryCoordinator } from "./coordinators/memoryCoordinator";

export const startEchoRuntime = (port: ManagerPort, memory: MemoryCoordinator, cues: CuePort): EchoRuntime => {
  const { view, engine, lifecycle } = port;
  return createEchoRuntime({
    story: () => port.loaded()?.story ?? null, storyId: () => port.loaded()?.record.id, log: () => (port.loaded() ? engine.stateLog : []),
    values: () => view.getState()?.blackboard.values ?? null, extras: port.extras, chatId: () => (view.hosts.chat.chatId() ? String(view.hosts.chat.chatId()) : null),
    enabledIds: () => enabledCharacterIds(view.getStory(), view.hosts.roster),
    enabled: () => resolveFeatures(getGlobalSettings(), port.loaded()?.story ?? null, port.extras().overrides).echoes.enabled,
    refuses: (text, rosterId) => memory.injector.refuses(text, rosterId), receipts: () => cues.receipts(),
    historyFloor: () => (port.loaded() ? engine.historyFrom().messageId : null), persist: () => { void lifecycle.persist(); },
    notify: () => lifecycle.notify(), journal: (summary, note) => port.journal("author", summary, note),
  });
};
