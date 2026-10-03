import { dieFace, unitDraw } from "@engine/chance";
import type { BoundaryLogEntry, EngineState, NormalizedStoryV2 } from "@engine/index";
import { isRecord } from "@utils/guards";
import type { ChanceDraw, ChanceDrawKind } from "./chance";

export const CHANCE_DRAW_LIMIT = 100;
export const DRAW_SIDES = 100;

export interface ChanceDrawRecord {
  kind: ChanceDrawKind;
  key: string;
  boundary: number;
  unit: number;
  messageId: number;
}

export interface ChanceRuntimeState {
  draws: ChanceDrawRecord[];
}

export type RollSource = "quality" | ChanceDrawKind | "check";

export interface RollRecord {
  source: RollSource;
  key: string;
  messageId: number;
  boundary: number;
  sides: number;
  draw: number;
  target?: number;
  modifiers?: number;
  total?: number;
  outcome?: "success" | "failure";
  narrate: boolean;
}

export const createChance = (): ChanceRuntimeState => ({ draws: [] });

const KINDS: readonly ChanceDrawKind[] = ["npc", "talk"];
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const isDrawRecord = (value: unknown): value is ChanceDrawRecord => isRecord(value) && KINDS.includes(value.kind as ChanceDrawKind) && typeof value.key === "string"
  && finite(value.boundary) && finite(value.unit) && value.unit >= 0 && value.unit < 1 && finite(value.messageId);

const ordered = (draws: ChanceDrawRecord[]) => [...draws].sort((left, right) => left.messageId - right.messageId).slice(-CHANCE_DRAW_LIMIT);

export const sanitizeChance = (value: unknown): ChanceRuntimeState => {
  const draws = isRecord(value) && Array.isArray(value.draws) ? value.draws.filter(isDrawRecord) : [];
  return { draws: ordered(draws.map(({ kind, key, boundary, unit, messageId }) => ({ kind, key, boundary, unit, messageId }))) };
};

export const recordChanceDraw = (state: ChanceRuntimeState, draw: Pick<ChanceDraw, "kind" | "key" | "boundary" | "unit">, messageId: number): ChanceRuntimeState =>
  (Number.isFinite(messageId) && messageId >= 0
    ? { draws: ordered([...state.draws, { kind: draw.kind, key: draw.key, boundary: draw.boundary, unit: draw.unit, messageId }]) }
    : state);

export const rollbackChanceDraws = (state: ChanceRuntimeState, messageId: number): ChanceRuntimeState =>
  (Number.isFinite(messageId) ? { draws: state.draws.filter((draw) => draw.messageId < messageId) } : state);

export interface RollIds {
  chatId: string;
  storyId: string;
}

const startedStates = (log: readonly BoundaryLogEntry[], state: EngineState | null): EngineState[] => {
  const byBoundary = new Map<number, EngineState>();
  for (const entry of log) for (const candidate of [entry.before, entry.after]) byBoundary.set(candidate.checkpointStartedBoundary, candidate);
  if (state) byBoundary.set(state.checkpointStartedBoundary, state);
  return [...byBoundary.values()].sort((left, right) => left.checkpointStartedBoundary - right.checkpointStartedBoundary);
};

const rolledQualities = (story: NormalizedStoryV2) =>
  story.qualities.filter((quality) => quality.roll && quality.source === "code" && (quality.type === "bool" || quality.type === "int"));

export function reconstructQualityRolls(story: NormalizedStoryV2 | null, ids: RollIds | null, log: readonly BoundaryLogEntry[], state: EngineState | null): RollRecord[] {
  if (!story || !ids) return [];
  const rolled = rolledQualities(story);
  if (!rolled.length) return [];
  return startedStates(log, state).flatMap((started) => rolled.map((quality): RollRecord => {
    const roll = quality.roll as NonNullable<typeof quality.roll>;
    const face = dieFace(roll.sides, unitDraw([ids.chatId, ids.storyId, started.checkpointStartedBoundary, quality.key]));
    return {
      source: "quality", key: quality.key, messageId: started.checkpointStartedMessageId, boundary: started.checkpointStartedBoundary,
      sides: roll.sides, draw: face, target: roll.target,
      ...(quality.type === "bool" ? { outcome: face <= roll.target ? "success" as const : "failure" as const } : {}),
      narrate: false,
    };
  }));
}

export const drawRecords = (state: ChanceRuntimeState): RollRecord[] => state.draws.map((draw) => ({
  source: draw.kind, key: draw.key, messageId: draw.messageId, boundary: draw.boundary, sides: DRAW_SIDES, draw: dieFace(DRAW_SIDES, draw.unit), narrate: false,
}));

export const composeRolls = (quality: RollRecord[], chance: ChanceRuntimeState): RollRecord[] =>
  [...quality, ...drawRecords(chance)].sort((left, right) => left.messageId - right.messageId || left.boundary - right.boundary);

export const rollText = (roll: RollRecord): string => {
  const die = `d${roll.sides}`;
  const versus = roll.target !== undefined ? ` vs ${roll.target}` : "";
  const outcome = roll.outcome ? `, ${roll.outcome}` : "";
  return `${roll.key}: ${die} ${roll.draw}${versus}${outcome}`;
};
