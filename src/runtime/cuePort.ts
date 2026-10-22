import type { CuesState, OfferLapse, OfferProvider, OfferReceipt } from "@engine/life/offers";
import type { CueRuntime, CuesAuthorView, OfferProviderId, OfferRegistry } from "./cueRuntime";
import type { ManagerPort } from "./managerWiring";
import type { MemoryCoordinator } from "./coordinators/memoryCoordinator";

declare module "./types" {
  interface RuntimeExtras {
    cues?: CuesState;
  }
  interface RuntimeSnapshot {
    cuesAuthor?: CuesAuthorView | null;
  }
}

export type { CuesAuthorView, OfferProviderId };

export interface CuePort extends CueRuntime {
  addOfferProvider: (id: OfferProviderId, provider: OfferProvider) => void;
  onLapse: (id: OfferProviderId, listener: (lapse: OfferLapse) => void) => void;
  receipts: () => readonly OfferReceipt[];
  lapses: () => readonly OfferLapse[];
}

export function createCuePort(port: ManagerPort, memory: MemoryCoordinator): CuePort {
  const registry: OfferRegistry = { providers: new Map(), lapseListeners: new Map() };
  const cues: CuePort = {
    addOfferProvider: (id, provider) => { registry.providers.set(id, provider); },
    onLapse: (id, listener) => { registry.lapseListeners.set(id, listener); },
    receipts: () => port.extras().cues?.receipts ?? [],
    lapses: () => port.extras().cues?.lapses ?? [],
    active: () => false, perDraft: () => false, lines: () => [], draft: () => undefined, staged: () => undefined, opened: () => undefined, settle: () => undefined,
    evidence: () => undefined, onBoundary: () => undefined, authorView: () => null,
  };
  void import("./cueRuntimeHost").then(({ startCueRuntime }) => { Object.assign(cues, startCueRuntime(port, memory, registry)); if (cues.active()) memory.updateInjection(); }, () => undefined);
  return cues;
}
