import type { HostScannableEntry } from "./hostTypes";
import { getScannableEntries } from "./worldInfoActivate";
import { LOADED_ARRAYS, observeWorldInfoScans } from "./worldInfoEvidence";

export interface ScanGatingHandle {
  reassert: () => void;
  dispose: () => void;
  ordered: boolean;
  scans: () => number;
}

// v2.4 plan 05 T13 spike. The handler is SYNCHRONOUS and runs last on WORLDINFO_ENTRIES_LOADED
// (re-placed at every generation, 05-H11), over the per-call copies (05-H2/H3): what it changes is
// what this one scan sees, and no lorebook file is written.
export function installScanGating(apply: (arrays: HostScannableEntry[][]) => void): ScanGatingHandle {
  let seen = 0;
  const observation = observeWorldInfoScans({
    loadedLast: (payload) => {
      seen += 1;
      try {
        apply(LOADED_ARRAYS.map((key) => payload[key]));
      } catch (error) {
        console.warn("[Story Orchestrator] scan-time world info gating failed for this scan", error);
      }
    },
  });
  return { reassert: observation.reassert, dispose: observation.dispose, ordered: observation.ordered, scans: () => seen };
}

// The `wiScanGating` capability: `present` only when the handler was seen running on a probe scan.
// Kept out of CAPABILITY_IDS on purpose: it describes a default-off spike, not the install.
export async function probeScanGating(handle: ScanGatingHandle): Promise<{ state: "present" | "absent" | "error"; detail: string }> {
  if (!handle.ordered) return { state: "absent", detail: "this SillyTavern cannot order event listeners (no makeFirst/makeLast)" };
  const before = handle.scans();
  try {
    await getScannableEntries();
  } catch (error) {
    return { state: "error", detail: error instanceof Error ? error.message : "the probe scan failed" };
  }
  return handle.scans() > before
    ? { state: "present", detail: "the handler ran on a probe scan" }
    : { state: "absent", detail: "getSortedEntries emitted no WORLDINFO_ENTRIES_LOADED the handler saw" };
}
