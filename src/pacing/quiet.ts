import {
  gateKeys, openStretch, PLAYER_TURNS_KEY, QUIET_WINDOW_TURNS,
  type BoundaryLogEntry, type EngineState, type NormalizedStoryV2, type PrimitiveValue,
} from "@engine/index";

const COUNTERS: readonly string[] = ["message_count", "messages_in_checkpoint", "elapsed", PLAYER_TURNS_KEY];

export interface QuietRead {
  holds: boolean;
  playerTurns: number;
  moved: string[];
}

export interface QuietInput {
  story: Pick<NormalizedStoryV2, "checkpointById" | "outgoingByCheckpoint"> | null;
  state: Pick<EngineState, "activeCheckpointId" | "checkpointStartedMessageId" | "lastMessageId" | "blackboard"> | null;
  log: readonly BoundaryLogEntry[];
  playerTurnIds: readonly number[];
  window?: number;
}

export const watchedQualities = (story: Pick<NormalizedStoryV2, "outgoingByCheckpoint">, checkpointId: string): string[] =>
  [...new Set((story.outgoingByCheckpoint[checkpointId] ?? []).flatMap((transition) => gateKeys(transition.gate)))].filter((key) => !COUNTERS.includes(key));

const moves = (before: PrimitiveValue | undefined, after: PrimitiveValue | undefined): boolean => (before == null ? Boolean(after) : before !== after);

const baselineValues = (input: QuietInput, windowStart: number): Record<string, PrimitiveValue> | null => {
  const state = input.state;
  if (!state) return null;
  const visit = input.log.filter((entry) => entry.before.activeCheckpointId === state.activeCheckpointId && entry.before.checkpointStartedMessageId === state.checkpointStartedMessageId);
  if (!visit.length) return null;
  const settled = visit.filter((entry) => entry.context.lastMessageId < windowStart);
  return (settled.length ? settled[settled.length - 1].after : visit[0].before).blackboard.values;
};

export const quietRead = (input: QuietInput): QuietRead | null => {
  const { story, state } = input;
  const stretch = story && state ? openStretch(story.checkpointById[state.activeCheckpointId]) : null;
  if (!story || !state || !stretch) return null;
  const inVisit = input.playerTurnIds.filter((id) => id > state.checkpointStartedMessageId && id <= state.lastMessageId);
  const playerTurns = inVisit.length;
  if (playerTurns < stretch.pull_after) return { holds: false, playerTurns, moved: [] };
  const window = Math.max(1, input.window ?? QUIET_WINDOW_TURNS);
  const baseline = baselineValues(input, inVisit[Math.max(0, playerTurns - window)]);
  if (!baseline) return { holds: false, playerTurns, moved: [] };
  const now = state.blackboard.values;
  const moved = watchedQualities(story, state.activeCheckpointId).filter((key) => moves(baseline[key], now[key]));
  return { holds: moved.length === 0, playerTurns, moved };
};
