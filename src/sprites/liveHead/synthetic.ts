import * as data from "./syntheticHead.json";
import { loadHeadManifest, manifestRef } from "./manifest";

export const syntheticHead = loadHeadManifest((data as { default?: unknown }).default ?? data);
export const syntheticRef = manifestRef(syntheticHead);
