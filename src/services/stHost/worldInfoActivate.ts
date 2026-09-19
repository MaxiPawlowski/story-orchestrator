import { getContext } from "./context";
import type { HostScannableEntry } from "./hostTypes";
import { worldInfoModule } from "./modules";

export type { HostScannableEntry } from "./hostTypes";

// v2.2 plan 04. What the next World Info scan will iterate, in the scan's own shape: a forced
// object is added to the activated set as-is (world-info.js:4886-4889), so it must be one of these.
export async function getScannableEntries(): Promise<HostScannableEntry[]> {
  if (typeof worldInfoModule.getSortedEntries !== "function") return [];
  const entries = await worldInfoModule.getSortedEntries();
  return Array.isArray(entries) ? entries.filter((entry) => typeof entry?.world === "string" && typeof entry?.uid === "number") : [];
}

// Queues entries for the next scan only: the map is static and cleared at the end of any
// checkWorldInfo, dry runs included (world-info.js:203, :1020-1029, :5275). Nothing is written.
export async function forceActivateEntries(entries: HostScannableEntry[]): Promise<boolean> {
  const context = getContext();
  const eventName = context.eventTypes?.WORLDINFO_FORCE_ACTIVATE;
  if (!eventName || !entries.length) return false;
  await context.eventSource.emit(eventName, entries);
  return true;
}
