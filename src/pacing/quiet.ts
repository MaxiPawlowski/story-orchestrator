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

type Values = Readonly<Record<string, PrimitiveValue>>;

const blank = (value: PrimitiveValue | undefined | null): boolean => value === undefined || value === null;

const moves = (before: PrimitiveValue | undefined, after: PrimitiveValue | undefined): boolean =>
  (blank(before) || blank(after) ? Boolean(blank(before) ? after : before) : before !== after);

const windowSnapshots = (input: QuietInput, windowStart: number): Values[] | null => {
  const state = input.state;
  if (!state) return null;
  const visit = input.log.filter((entry) => entry.before.activeCheckpointId === state.activeCheckpointId && entry.before.checkpointStartedMessageId === state.checkpointStartedMessageId);
  if (!visit.length) return null;
  const settled = visit.filter((entry) => entry.context.lastMessageId < windowStart);
  const base = settled.length ? settled[settled.length - 1].after.blackboard.values : visit[0].before.blackboard.values;
  const inside = visit.filter((entry) => entry.context.lastMessageId >= windowStart);
  return [base, ...inside.flatMap((entry) => [entry.before.blackboard.values, entry.after.blackboard.values]), state.blackboard.values];
};

export const quietRead = (input: QuietInput): QuietRead | null => {
  const { story, state } = input;
  const stretch = story && state ? openStretch(story.checkpointById[state.activeCheckpointId]) : null;
  if (!story || !state || !stretch) return null;
  const inVisit = input.playerTurnIds.filter((id) => id > state.checkpointStartedMessageId && id <= state.lastMessageId);
  const playerTurns = inVisit.length;
  if (playerTurns < stretch.pull_after) return { holds: false, playerTurns, moved: [] };
  const window = Math.max(1, input.window ?? QUIET_WINDOW_TURNS);
  const snapshots = windowSnapshots(input, inVisit[Math.max(0, playerTurns - window)]);
  if (!snapshots) return { holds: false, playerTurns, moved: [] };
  const moved = watchedQualities(story, state.activeCheckpointId)
    .filter((key) => snapshots.slice(1).some((values, index) => moves(snapshots[index][key], values[key])));
  return { holds: moved.length === 0, playerTurns, moved };
};
