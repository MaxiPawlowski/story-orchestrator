import type { PromptHost } from "./hostPorts";

export const scanningPromptHost = (seam: PromptHost, scanMemory: () => boolean): PromptHost => ({
  setStoryExtensionPrompt: (key, text, depth) => seam.setStoryExtensionPrompt(key, text, depth, scanMemory()),
  clearStoryExtensionPrompt: (key) => seam.clearStoryExtensionPrompt(key),
});
