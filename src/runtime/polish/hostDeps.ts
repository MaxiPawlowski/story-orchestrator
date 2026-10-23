import type { MemoryCoordinator } from "../coordinators/memoryCoordinator";
import { resolveFeatures } from "../featureResolve";
import type { ManagerPort } from "../managerWiring";
import { enabledCharacterIds } from "../roster";
import { getGlobalSettings } from "../settingsStore";
import type { PolishHostDeps } from "./types";

export const POLISH_HOLD_MS = 45000;

export const polishHostDeps = ({ port, memory }: { port: ManagerPort; memory: MemoryCoordinator }): PolishHostDeps => {
  const { view, lifecycle } = port;
  return {
    story: () => port.loaded()?.story ?? null, state: view.getState, chatId: () => view.hosts.chat.chatId(), rows: () => view.hosts.chat.chatRows(),
    enabledIds: () => enabledCharacterIds(view.getStory(), view.hosts.roster), resting: () => memory.injector.restingFilter(),
    feature: () => resolveFeatures(getGlobalSettings(), port.loaded()?.story ?? null, port.extras().overrides).polish,
    ring: () => port.extras().polish ?? [], setRing: (next) => { port.extras().polish = next; },
    persist: lifecycle.persist, notify: lifecycle.notify, ownership: lifecycle.ownership, model: lifecycle.model,
  };
};
