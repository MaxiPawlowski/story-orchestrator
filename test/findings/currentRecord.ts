import type { EngineState } from "../../src/engine/engine";

export const currentEngineState = (over: Partial<EngineState> = {}): EngineState => ({
  blackboard: { values: {}, versions: {}, latched: {} },
  activeCheckpointId: "start",
  visitedAnchors: ["start"],
  visitedPath: ["start"],
  boundary: 0,
  checkpointStartedBoundary: 0,
  checkpointStartedAt: 0,
  checkpointStartedMessageId: -1,
  lastMessageId: -1,
  chatLength: 0,
  ...over,
});

/** A stored record with every field v2.5 plan 11 requires, so `isCurrentRecord` reads it. */
export const currentRecord = (storyId: string, over: Record<string, unknown> = {}) => {
  const engineState = currentEngineState();
  return {
    storyId,
    storyTitle: "S",
    pinnedStory: { id: storyId },
    playedVersion: 1,
    contentHashAtLoad: "h",
    engineState,
    engineHistory: { from: { boundary: 0, messageId: -1 }, base: engineState, log: [] },
    extras: {},
    ...over,
  };
};
