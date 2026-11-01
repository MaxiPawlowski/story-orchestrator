import {
  PACE_PULL_AFTER, PLAYER_REF, QUIET_WINDOW_TURNS, isOpenStretch, openPhase,
  type BoundaryLogEntry, type Checkpoint, type EngineState, type NormalizedStory, type PrimitiveValue,
} from "@engine/index";
import { watchedQualities } from "./quiet";

export const STUCK_AFTER_DEFAULT = PACE_PULL_AFTER.unhurried;

export interface StuckRead {
  rung: number;
  quietTurns: number;
  playerTurns: number;
}

export interface StuckInput {
  story: Pick<NormalizedStory, "checkpointById" | "outgoingByCheckpoint"> | null;
  state: Pick<EngineState, "activeCheckpointId" | "checkpointStartedMessageId" | "lastMessageId"> | null;
  log: readonly BoundaryLogEntry[];
  playerTurnIds: readonly number[];
}

type Values = Readonly<Record<string, PrimitiveValue>>;

const blank = (value: PrimitiveValue | undefined | null): boolean => value === undefined || value === null;

const differs = (before: PrimitiveValue | undefined, after: PrimitiveValue | undefined): boolean =>
  (blank(before) || blank(after) ? Boolean(blank(before) ? after : before) : before !== after);

const lastMove = (input: StuckInput, state: NonNullable<StuckInput["state"]>, watched: readonly string[]): number => {
  const started = state.checkpointStartedMessageId;
  const visit = input.log.filter((entry) => entry.before.activeCheckpointId === state.activeCheckpointId && entry.before.checkpointStartedMessageId === state.checkpointStartedMessageId);
  const steps = visit.flatMap((entry) => [entry.before.blackboard.values, entry.after.blackboard.values].map((values: Values) => ({ values, at: entry.context.lastMessageId })));
  return steps.reduce((moved, step, index) =>
    (index > 0 && watched.some((key) => differs(steps[index - 1].values[key], step.values[key])) ? Math.max(moved, step.at) : moved), started);
};

export const stuckApplies = (checkpoint: Checkpoint | null | undefined, story: Pick<NormalizedStory, "outgoingByCheckpoint">): boolean =>
  (checkpoint ? !isOpenStretch(checkpoint) && watchedQualities(story, checkpoint.id).length > 0 : false);

export const stuckRead = (input: StuckInput): StuckRead | null => {
  const { story, state } = input;
  const checkpoint = story && state ? story.checkpointById[state.activeCheckpointId] : null;
  if (!story || !state || !checkpoint || !stuckApplies(checkpoint, story)) return null;
  const started = state.checkpointStartedMessageId;
  const inVisit = input.playerTurnIds.filter((id) => id > started && id <= state.lastMessageId);
  if (openPhase(checkpoint, inVisit.length)) return { rung: 0, quietTurns: 0, playerTurns: inVisit.length };
  const moved = lastMove(input, state, watchedQualities(story, checkpoint.id));
  const quietTurns = inVisit.filter((id) => id > moved).length;
  const after = checkpoint.stuck_after ?? STUCK_AFTER_DEFAULT;
  const rung = quietTurns < after ? 0 : 1 + Math.floor((quietTurns - after) / QUIET_WINDOW_TURNS);
  return { rung, quietTurns, playerTurns: inVisit.length };
};

export const STUCK_GENERIC_LINE = `${PLAYER_REF} seems stuck on the current objective. If it fits, let the world offer one concrete way toward it `
  + `(a person, a place, an object or a sound); never resolve it for ${PLAYER_REF} and never decide what ${PLAYER_REF} does.`;

export const stuckLeadLine = (lead: string): string =>
  `${PLAYER_REF} seems stuck. If it fits, let the world make this available, as something ${PLAYER_REF} may take up or ignore; `
    + `never resolve it for ${PLAYER_REF} and never decide what ${PLAYER_REF} does: ${lead.trim()}`;

export const stuckLine = (rung: number, leads: readonly string[]): string | null => {
  if (rung < 1) return null;
  if (rung <= leads.length) return stuckLeadLine(leads[rung - 1]);
  if (!leads.length && rung < 2) return null;
  return STUCK_GENERIC_LINE;
};
