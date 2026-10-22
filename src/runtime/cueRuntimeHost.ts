import { enabledCharacterIds } from "./roster";
import { resolveFeatures } from "./featureResolve";
import { getGlobalSettings } from "./settingsStore";
import { createCueRuntime, type CuePortDeps, type CueRuntime, type OfferRegistry } from "./cueRuntime";
import type { ManagerPort } from "./managerWiring";
import type { MemoryCoordinator } from "./coordinators/memoryCoordinator";

export const wiredCueDeps = (port: ManagerPort, memory: MemoryCoordinator): CuePortDeps => {
  const { view, engine, lifecycle } = port;
  return {
    story: () => port.loaded()?.story ?? null, state: () => (port.loaded() ? engine.serialize() : null), lastEntry: () => engine.stateLog.at(-1), extras: port.extras,
    chatId: () => (view.hosts.chat.chatId() ? String(view.hosts.chat.chatId()) : null), rows: () => view.hosts.chat.chatRows(),
    enabledIds: () => enabledCharacterIds(view.getStory(), view.hosts.roster),
    enabled: () => resolveFeatures(getGlobalSettings(), port.loaded()?.story ?? null, port.extras().overrides).cues.enabled,
    refuses: (text, rosterId) => memory.injector.refuses(text, rosterId), appliedBlock: () => memory.injector.appliedEpistemicBlock(),
    historyFloor: () => (port.loaded() ? engine.historyFrom().messageId : null), persist: () => { void lifecycle.persist(); },
    notify: () => { memory.updateInjection(); lifecycle.notify(); }, journal: (summary, note) => port.journal("author", summary, note),
  };
};

export const startCueRuntime = (port: ManagerPort, memory: MemoryCoordinator, registry: OfferRegistry): CueRuntime => createCueRuntime(wiredCueDeps(port, memory), registry);
