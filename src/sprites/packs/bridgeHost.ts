import { listInstalledPacks, servedFileHash } from "@services/stHost/visualPacks";
import { contentHash } from "../builder/recipes";
import { createVisualBridge, type VisualBridge } from "./bridge";

let bridge: VisualBridge | null = null;

export const visualBridge = (): VisualBridge => bridge ??= createVisualBridge({
  list: listInstalledPacks, fileHash: servedFileHash, textHash: (text) => contentHash(new TextEncoder().encode(text)),
});
