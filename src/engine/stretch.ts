import type { Checkpoint, CheckpointStretch, NormalizedStory, StretchPace } from "./schema";

export const PLAYER_TURNS_KEY = "player_turns_in_checkpoint";

export const PACE_PULL_AFTER: Record<StretchPace, number> = { brief: 3, unhurried: 6, long: 10 };

export const DEFAULT_STRETCH_PACE: StretchPace = "unhurried";

export const PULL_STEADY_AFTER = 3;

export type PullStage = "gentle" | "steady" | "strong";

export const OPENING_MAX_TURNS = PACE_PULL_AFTER.long;

export const QUIET_WINDOW_TURNS = 3;

type StretchHolder = Pick<Checkpoint, "stretch"> & { type?: Checkpoint["type"] };

export const openStretch = (checkpoint: StretchHolder | null | undefined): CheckpointStretch | null =>
  (checkpoint?.type !== "anchor" && checkpoint?.stretch?.mode === "open" ? checkpoint.stretch : null);

export const isOpenStretch = (checkpoint: StretchHolder | null | undefined): boolean => openStretch(checkpoint) !== null;

export const anchorOpening = (checkpoint: StretchHolder | null | undefined): CheckpointStretch | null =>
  (checkpoint?.type === "anchor" && checkpoint.stretch?.mode === "open" ? checkpoint.stretch : null);

export const openPhase = (checkpoint: StretchHolder | null | undefined, playerTurns: number): CheckpointStretch | null => {
  const opening = anchorOpening(checkpoint);
  return openStretch(checkpoint) ?? (opening && playerTurns < opening.pull_after ? opening : null);
};

export const offersEncounters = (checkpoint: StretchHolder | null | undefined): boolean =>
  openStretch(checkpoint)?.offer?.includes("encounters") === true;

export const playerTurnsBetween = (playerTurnIds: readonly number[], startedMessageId: number, lastMessageId: number): number =>
  playerTurnIds.filter((id) => id > startedMessageId && id <= lastMessageId).length;

export const pullStage = (stretch: CheckpointStretch, playerTurns: number): PullStage | null => {
  if (playerTurns < stretch.pull_after) return null;
  if (stretch.max_turns !== undefined && playerTurns >= stretch.max_turns) return "strong";
  return playerTurns - stretch.pull_after >= PULL_STEADY_AFTER ? "steady" : "gentle";
};

export const stretchDestination = (story: Pick<NormalizedStory, "checkpointById" | "outgoingByCheckpoint">, checkpointId: string): string | null => {
  const stretch = openStretch(story.checkpointById[checkpointId]);
  if (!stretch?.arrive_when) return null;
  const arrive = JSON.stringify(stretch.arrive_when);
  const exit = (story.outgoingByCheckpoint[checkpointId] ?? []).find((transition) => JSON.stringify(transition.gate) === arrive);
  const target = exit ? story.checkpointById[exit.to] : undefined;
  return target ? (target.player_name ?? target.name).trim() || null : null;
};
