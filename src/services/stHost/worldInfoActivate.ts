import { getContext } from "./context";
import type { HostScannableEntry } from "./hostTypes";
import { worldInfoModule } from "./modules";
import { couldNot, wrote, type WriteResult } from "@utils/writeResult";

export type { HostScannableEntry } from "./hostTypes";

// What the next World Info scan will iterate, in the scan's own shape: a forced
// object is added to the activated set as-is (world-info.js:4886-4889), so it must be one of these.
export async function getScannableEntries(): Promise<HostScannableEntry[]> {
  if (typeof worldInfoModule.getSortedEntries !== "function") return [];
  const entries = await worldInfoModule.getSortedEntries();
  return Array.isArray(entries) ? entries.filter((entry) => typeof entry?.world === "string" && typeof entry?.uid === "number") : [];
}

// Queues entries for the next scan only: the map is static and cleared at the end of any
// checkWorldInfo, dry runs included (world-info.js:203, :1020-1029, :5275). Nothing is written.
export async function forceActivateEntries(entries: HostScannableEntry[]): Promise<WriteResult<{ entries: number }>> {
  const context = getContext();
  const eventName = context.eventTypes?.WORLDINFO_FORCE_ACTIVATE;
  if (!eventName) return couldNot("this SillyTavern has no force-activate event");
  if (!entries.length) return wrote({ entries: 0 });
  await context.eventSource.emit(eventName, entries);
  return wrote({ entries: entries.length });
}

export interface HostScanBuffer {
  messages: string[];
  depth: number;
  caseSensitive: boolean;
  matchWholeWords: boolean;
}

interface ScanRow {
  mes?: unknown;
  name?: unknown;
  is_system?: unknown;
}

export function readScanBuffer(generationType?: string): HostScanBuffer {
  const settings = worldInfoModule.getWorldInfoSettings() as Record<string, unknown>;
  const rows = (getContext().chat as ScanRow[]).filter((row) => row && !row.is_system);
  if (generationType === "swipe") rows.pop();
  const names = settings.world_info_include_names !== false;
  return {
    messages: rows.map((row) => {
      const text = typeof row.mes === "string" ? row.mes : "";
      return names ? `${typeof row.name === "string" ? row.name : ""}: ${text}` : text;
    }).reverse(),
    depth: typeof settings.world_info_depth === "number" ? settings.world_info_depth : 2,
    caseSensitive: settings.world_info_case_sensitive === true,
    matchWholeWords: settings.world_info_match_whole_words === true,
  };
}

export function draftedCardName(): string | null {
  const context = getContext();
  const id = context.characterId;
  if (id === undefined || id === null || id === "") return null;
  const name = context.characters[Number(id)]?.name;
  return typeof name === "string" && name.trim() ? name : null;
}
