import { getContext } from "./context";
import { getWorldInfoSettings } from "./worldInfo";
import { log } from "@utils/log";

type Listener = (...args: unknown[]) => unknown;

interface ScanDoneSource {
  on: (event: string, listener: Listener) => unknown;
  off?: (event: string, listener: Listener) => unknown;
  removeListener?: (event: string, listener: Listener) => unknown;
}

// Read-only: world-info.js:5154-5175 emits WORLDINFO_SCAN_DONE once per scan loop with
// new.all/new.successful (this loop), activated.entries (a Map of world.uid), sortedEntries and
// budget.{current, overflowed}. Listeners may change args; this one never does.
export function observeWorldInfoScanDone(handler: (args: unknown) => void): () => void {
  const context = getContext();
  const source = context.eventSource as unknown as ScanDoneSource | undefined;
  const event = context.eventTypes?.WORLDINFO_SCAN_DONE;
  if (!source || !event) return () => undefined;
  const listener: Listener = (args) => {
    try {
      handler(args);
    } catch (error) {
      log.warn("the lore budget observer failed", error);
    }
  };
  source.on(event, listener);
  return () => {
    if (typeof source.off === "function") source.off(event, listener);
    else source.removeListener?.(event, listener);
  };
}

// World-info.js:81 world_info_budget_cap (0 = uncapped), exported through getWorldInfoSettings (:795-812).
export function readWorldInfoBudgetCap(): number | null {
  const value = getWorldInfoSettings().world_info_budget_cap;
  const cap = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(cap) ? cap : null;
}
