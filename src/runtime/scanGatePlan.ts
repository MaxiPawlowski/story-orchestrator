import type { NormalizedStoryV2 } from "@engine/index";
import { releasePlan, worldInfoPlan } from "./worldInfoGates";
import { bookKey, entryComment } from "./worldInfoMatch";

// v2.4 plan 05 T13 SPIKE (behind `worldInfo.gatingMode: "scan"`, default "file", never flipped by a
// plan). The file path writes checkpoint world info into shared lorebook files; this computes the
// same end state as a per-scan VIEW instead: every gated entry of every library story is off unless
// the story this chat plays, replayed along its path, switches it on.
export interface ScanGateBook {
  lorebook: string;
  entries: Map<string, boolean>;
}

export type ScanGate = Map<string, ScanGateBook>;

const setEntry = (gate: ScanGate, lorebook: string, comment: string, on: boolean) => {
  const key = bookKey(lorebook);
  if (!key) return;
  const book = gate.get(key) ?? { lorebook, entries: new Map<string, boolean>() };
  book.entries.set(comment, on);
  gate.set(key, book);
};

// = worldInfoPlan(loaded, path) ∪ releasePlan(library, keep = loaded): what the file path leaves
// behind when it applies the loaded story's path and releases everyone else's gated entries. A null
// `loaded` is "no story": every library gated entry off.
export function scanGatePlan(library: unknown[], loaded: NormalizedStoryV2 | null, path: string[]): ScanGate {
  const gate: ScanGate = new Map();
  for (const plan of releasePlan(library, loaded)) for (const comment of plan.disable) setEntry(gate, plan.lorebook, comment, false);
  if (loaded) {
    for (const plan of worldInfoPlan(loaded, path)) {
      for (const comment of plan.disable) setEntry(gate, plan.lorebook, comment, false);
      for (const comment of plan.enable) setEntry(gate, plan.lorebook, comment, true);
    }
  }
  return gate;
}

export interface ScanEntry {
  world: string;
  uid: number;
  comment?: unknown;
  disable?: unknown;
  [key: string]: unknown;
}

export interface ScanGateStats {
  off: number;
  on: number;
  keptForeign: number;
  missingKey: number;
  unmatched: number;
}

export const emptyScanGateStats = (): ScanGateStats => ({ off: 0, on: 0, keptForeign: 0, missingKey: 0, unmatched: 0 });

// Applied to the ENTRIES_LOADED copies (05-H2/H3), so every write here is scan-local. The book is
// indexed once per scan, and each gated comment takes its FIRST entry, as the file path does.
// Off -> `disable = true`, but never by adding a key the copy lacks (05-H5: the timed-effects hash).
// On -> `disable = false` only when the copy still holds the file's resting value (normalised: off);
// a disable some other listener set on an entry that rests ON is left alone (compare-and-set).
export function applyScanGate(arrays: ScanEntry[][], gate: ScanGate, restsOff: (lorebook: string, comment: string) => boolean): ScanGateStats {
  const stats = emptyScanGateStats();
  const byBook = new Map<string, ScanEntry[]>();
  for (const array of arrays) {
    for (const entry of array) {
      if (typeof entry?.world !== "string") continue;
      const key = entry.world.trim().toLowerCase();
      if (!gate.has(key)) continue;
      const list = byBook.get(key);
      if (list) list.push(entry);
      else byBook.set(key, [entry]);
    }
  }
  for (const [key, book] of gate) {
    const entries = byBook.get(key) ?? [];
    for (const [comment, on] of book.entries) {
      const entry = entries.find((candidate) => entryComment(candidate) === comment);
      if (!entry) {
        stats.unmatched += 1;
        continue;
      }
      if (!on) {
        if (!Object.prototype.hasOwnProperty.call(entry, "disable")) stats.missingKey += 1;
        else if (entry.disable !== true) {
          entry.disable = true;
          stats.off += 1;
        }
        continue;
      }
      if (entry.disable !== true) continue;
      if (restsOff(book.lorebook, comment)) {
        entry.disable = false;
        stats.on += 1;
      } else {
        stats.keptForeign += 1;
      }
    }
  }
  return stats;
}

export interface NormalizedLedger {
  [lorebook: string]: string[];
}

export const restsOffIn = (ledger: NormalizedLedger) => {
  const index = new Map(Object.entries(ledger).map(([lorebook, comments]) => [bookKey(lorebook), new Set(comments)]));
  return (lorebook: string, comment: string): boolean => index.get(bookKey(lorebook))?.has(comment) ?? false;
};
