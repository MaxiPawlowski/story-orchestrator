import { getContext } from "./context";
import type { HostEntriesLoaded, HostScannableEntry } from "./hostTypes";

export type { HostEntriesLoaded } from "./hostTypes";

type Listener = (...args: unknown[]) => unknown;

interface OrderedEventSource {
  on: (event: string, listener: Listener) => unknown;
  off?: (event: string, listener: Listener) => unknown;
  removeListener?: (event: string, listener: Listener) => unknown;
  makeFirst?: (event: string, listener: Listener) => void;
  makeLast?: (event: string, listener: Listener) => void;
}

export interface WorldInfoScanObservers {
  activated?: (entries: HostScannableEntry[]) => void;
  loadedFirst?: (payload: HostEntriesLoaded) => void;
  loadedLast?: (payload: HostEntriesLoaded) => void;
}

export interface WorldInfoScanObservation {
  /** Re-places the first/last observers; listener order is decided only at call time (05-H11). */
  reassert: () => void;
  /** Whether this host can order listeners at all; without it first/last mean nothing. */
  ordered: boolean;
  dispose: () => void;
}

export const LOADED_ARRAYS = ["globalLore", "characterLore", "chatLore", "personaLore"] as const;

const isEntriesLoaded = (value: unknown): value is HostEntriesLoaded =>
  Boolean(value) && typeof value === "object" && LOADED_ARRAYS.every((key) => Array.isArray((value as Record<string, unknown>)[key]));

export const loadedEntries = (payload: HostEntriesLoaded): HostScannableEntry[] => LOADED_ARRAYS.flatMap((key) => payload[key]);

// v2.4 plan 05 T12. Read-only: nothing here writes, so there is no WriteResult. WORLD_INFO_ACTIVATED
// fires only for a non-dry scan that activated something (05-H1); WORLDINFO_ENTRIES_LOADED carries
// the per-call arrays before ST sorts them (05-H2), so a first and a last observer see what every
// other listener did to them in between.
export function observeWorldInfoScans(observers: WorldInfoScanObservers): WorldInfoScanObservation {
  const context = getContext();
  const source = context.eventSource as unknown as OrderedEventSource | undefined;
  const activatedEvent = context.eventTypes?.WORLD_INFO_ACTIVATED;
  const loadedEvent = context.eventTypes?.WORLDINFO_ENTRIES_LOADED;
  if (!source) return { reassert: () => undefined, ordered: false, dispose: () => undefined };
  const ordered = typeof source.makeFirst === "function" && typeof source.makeLast === "function";
  const onActivated: Listener = (entries) => { if (Array.isArray(entries)) observers.activated?.(entries as HostScannableEntry[]); };
  const onFirst: Listener = (payload) => { if (isEntriesLoaded(payload)) observers.loadedFirst?.(payload); };
  const onLast: Listener = (payload) => { if (isEntriesLoaded(payload)) observers.loadedLast?.(payload); };
  const placed: Array<[string, Listener]> = [];
  if (activatedEvent && observers.activated) {
    source.on(activatedEvent, onActivated);
    placed.push([activatedEvent, onActivated]);
  }
  const reassert = () => {
    if (!loadedEvent || !ordered) return;
    if (observers.loadedFirst) source.makeFirst!(loadedEvent, onFirst);
    if (observers.loadedLast) source.makeLast!(loadedEvent, onLast);
  };
  if (loadedEvent && ordered) {
    if (observers.loadedFirst) placed.push([loadedEvent, onFirst]);
    if (observers.loadedLast) placed.push([loadedEvent, onLast]);
    reassert();
  }
  const dispose = () => {
    for (const [event, listener] of placed.splice(0)) {
      try {
        if (typeof source.off === "function") source.off(event, listener);
        else source.removeListener?.(event, listener);
      } catch (error) {
        console.warn("[Story Orchestrator] a world info observer failed to detach", error);
      }
    }
  };
  return { reassert, ordered, dispose };
}
