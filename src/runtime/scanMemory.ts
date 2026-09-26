import type { PromptHost } from "./hostPorts";

// Every prompt write asks the seam for scan while the install switch is on; the seam grants it only to
// the keys the injection registry marks scannable, so private knowledge and the ledger never scan.
export const scanningPromptHost = (seam: PromptHost, scanMemory: () => boolean): PromptHost => ({
  setStoryExtensionPrompt: (key, text, depth) => seam.setStoryExtensionPrompt(key, text, depth, scanMemory()),
  clearStoryExtensionPrompt: (key) => seam.clearStoryExtensionPrompt(key),
});
