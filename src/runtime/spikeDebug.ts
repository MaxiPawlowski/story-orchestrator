type SpikeDebugHandle = NonNullable<typeof globalThis.storyOrchestratorSpikes>;

export const publishSpikeDebug = (part: SpikeDebugHandle): (() => void) => {
  globalThis.storyOrchestratorSpikes = { ...globalThis.storyOrchestratorSpikes, ...part };
  return () => {
    const current: Record<string, unknown> = { ...globalThis.storyOrchestratorSpikes };
    for (const [key, value] of Object.entries(part)) if (current[key] === value) delete current[key];
    globalThis.storyOrchestratorSpikes = Object.keys(current).length > 0 ? (current as SpikeDebugHandle) : undefined;
  };
};
