import { observeNextSave, readServerBoundary } from "@services/STAPI";
import type { SaveEvidenceDeps } from "./saveEvidence";
import type { SaveHealth } from "./saveHealth";

export { recordSaveEvidence } from "./saveEvidence";

// The host half of the save evidence, split out on 2026-09-22: `saveEvidence.ts` holds the decision
// and was importing the host seam for this one factory, which made the whole module untestable under
// jest (a test cannot import `@services/STAPI`, whose host modules use top-level await). The pure
// module is now pure, which is the invariant the coordinators already follow.
export const saveEvidenceDeps = (
  get: () => SaveHealth,
  set: (health: SaveHealth) => void,
  journal: (summary: string, note: string) => void,
  now: () => string = () => new Date().toISOString(),
): SaveEvidenceDeps => ({ health: get, observe: () => observeNextSave(), readBack: () => readServerBoundary(), onWrite: set, journal, now });
