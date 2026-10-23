import { isRecord } from "@utils/guards";

// Vector Storage: `enabled_world_info` (vectors/index.js:117, 791, 2003-2004); the exclusive lore select reads the
// setting alone (loreExclusive.ts "vectors-wi"), so this one ignores whether the extension is loaded.
export const vectorsWorldInfoOn = (root: unknown): boolean => {
  const vectors = isRecord(root) ? root.vectors : undefined;
  return isRecord(vectors) && vectors.enabled_world_info === true;
};
