import type { BundledWorkflow, StoryIllustrations } from "@engine/index";

export const withBundle = (current: StoryIllustrations | undefined, bundle: Record<string, BundledWorkflow>): StoryIllustrations | undefined =>
  Object.keys(bundle).length ? { ...current, bundle: { ...current?.bundle, ...bundle } } : current;

export const lapsedBundleCopy = (lapsed: string): string => `The draft changed meanwhile (${lapsed}), so no workflow was copied into the story.`;

export const lapsedStageCopy = (lapsed: string): string => `The draft changed while the wizard worked (${lapsed}), so its answer was dropped. Ask again.`;
