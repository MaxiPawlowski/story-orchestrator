import { unitDraw } from "@engine/chance";
import {
  checkAttempted, checkDice, checksById, checkWrites, checksAt, resolveCheck, valueReader, type BoundaryLogEntry, type CheckDegree, type DerivedQualityView,
  type NormalizedStoryV2, type PrimitiveValue, type StoryCheck,
} from "@engine/index";
import { isRecord } from "@utils/guards";
import type { ChanceIds } from "./chance";
import type { RollRecord } from "./rolls";

export const CHECK_RECORD_LIMIT = 100;

export type CheckOutcomeWord = "success" | "failure" | CheckDegree;

export interface CheckRecord {
  checkId: string;
  boundary: number;
  messageId: number;
  visit: number;
  draws: number[];
  modifiers: Array<{ label: string; add: number }>;
  total: number;
  target: number;
  outcome: CheckOutcomeWord;
  twist?: boolean;
}

export interface ChecksRuntimeState {
  records: CheckRecord[];
}

export const createChecks = (): ChecksRuntimeState => ({ records: [] });

export const checkUnits = (ids: ChanceIds, visit: number, check: StoryCheck): number[] =>
  Array.from({ length: checkDice(check) }, (_, index) => unitDraw([ids.chatId, ids.storyId, visit, `check:${check.id}:${index}`]));

export const checkGateValues = (story: NormalizedStoryV2 | undefined, ids: ChanceIds, view: DerivedQualityView): Array<{ q: string; v: PrimitiveValue }> =>
  (story ? checksAt(story, view.activeCheckpointId).flatMap(({ check }) => checkWrites(check, resolveCheck(check, checkUnits(ids, view.checkpointStartedBoundary, check), view.values))) : []);

const publicLabel = (story: NormalizedStoryV2, key: string): string | undefined => story.qualityByKey[key]?.display?.label;

export const checkLabel = (story: NormalizedStoryV2, check: StoryCheck): string => check.label ?? publicLabel(story, check.quality) ?? "A check";

export function checkRecordsAt(story: NormalizedStoryV2 | null, ids: ChanceIds | null, entry: BoundaryLogEntry): CheckRecord[] {
  if (!story || !ids || !entry.evaluated) return [];
  const values = entry.evaluated;
  const visit = entry.before.checkpointStartedBoundary;
  return checksAt(story, entry.before.activeCheckpointId).filter((active) => checkAttempted(active, valueReader(values))).map(({ check }) => {
    const result = resolveCheck(check, checkUnits(ids, visit, check), values);
    return {
      checkId: check.id, boundary: entry.boundary, messageId: entry.context.lastMessageId, visit, draws: result.faces,
      modifiers: result.modifiers.map((modifier) => ({ label: modifier.label ?? publicLabel(story, modifier.q) ?? (modifier.add > 0 ? "A bonus" : "A penalty"), add: modifier.add })),
      total: result.total, target: check.roll.target, outcome: result.degree ?? (result.success ? "success" : "failure"), ...(result.twist ? { twist: true } : {}),
    };
  });
}

const sameRecord = (left: CheckRecord, right: CheckRecord) => left.checkId === right.checkId && left.visit === right.visit && left.outcome === right.outcome;

const ordered = (records: CheckRecord[]) => [...records].sort((left, right) => left.messageId - right.messageId || left.boundary - right.boundary).slice(-CHECK_RECORD_LIMIT);

export const recordChecks = (state: ChecksRuntimeState, records: readonly CheckRecord[]): ChecksRuntimeState => {
  const fresh = records.filter((record, index) => !state.records.some((kept) => sameRecord(kept, record)) && records.findIndex((other) => sameRecord(other, record)) === index);
  return fresh.length ? { records: ordered([...state.records, ...fresh]) } : state;
};

export const rollbackChecks = (state: ChecksRuntimeState, messageId: number): ChecksRuntimeState =>
  (Number.isFinite(messageId) ? { records: state.records.filter((record) => record.messageId < messageId) } : state);

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const OUTCOMES: readonly string[] = ["success", "failure", "miss", "weak", "strong"];

const isRecordShape = (value: unknown): value is CheckRecord => isRecord(value) && typeof value.checkId === "string" && finite(value.boundary) && finite(value.messageId)
  && finite(value.visit) && Array.isArray(value.draws) && value.draws.every(finite) && Array.isArray(value.modifiers) && finite(value.total) && finite(value.target)
  && OUTCOMES.includes(String(value.outcome));

export const sanitizeChecks = (value: unknown): ChecksRuntimeState => {
  const records = isRecord(value) && Array.isArray(value.records) ? value.records.filter(isRecordShape) : [];
  return {
    records: ordered(records.map((record) => ({
      checkId: record.checkId, boundary: record.boundary, messageId: record.messageId, visit: record.visit, draws: [...record.draws],
      modifiers: record.modifiers.filter((modifier) => isRecord(modifier) && typeof modifier.label === "string" && finite(modifier.add)).map(({ label, add }) => ({ label, add })),
      total: record.total, target: record.target, outcome: record.outcome, ...(record.twist === true ? { twist: true } : {}),
    }))),
  };
};

const OUTCOME_PROSE: Record<CheckOutcomeWord, string> = {
  success: "succeeds", failure: "fails", strong: "succeeds cleanly", weak: "succeeds, at a cost", miss: "fails",
};

export const CHECK_OUTCOME_HEADER = "The story has already decided these outcomes. "
  + "Show each one happening in this reply, as it fell: never change it, never skip it, and never mention dice or numbers.";

export function checkOutcomeBlock(story: NormalizedStoryV2 | null, records: readonly CheckRecord[], lastMessageId: number): string | null {
  if (!story) return null;
  const byId = checksById(story);
  const lines = records.filter((record) => record.messageId === lastMessageId).flatMap((record) => {
    const check = byId.get(record.checkId);
    return check ? [`- ${checkLabel(story, check)}: ${OUTCOME_PROSE[record.outcome]}${record.twist ? ", with a twist" : ""}.`] : [];
  });
  return lines.length ? [CHECK_OUTCOME_HEADER, ...lines].join("\n") : null;
}

const DEGREES: readonly CheckOutcomeWord[] = ["miss", "weak", "strong"];

const rollOf = (story: NormalizedStoryV2, check: StoryCheck, record: CheckRecord): RollRecord => {
  const draw = record.draws.reduce((sum, face) => sum + face, 0);
  const dice = `${record.draws.length > 1 ? record.draws.length : ""}d${check.roll.sides}: ${record.draws.join(" + ")}`;
  const modifiers = record.modifiers.map((modifier) => `${modifier.label} ${modifier.add > 0 ? "+" : ""}${modifier.add}`);
  return {
    source: "check", key: checkLabel(story, check), messageId: record.messageId, boundary: record.boundary, sides: check.roll.sides, draw, target: record.target,
    modifiers: record.total - draw, total: record.total, outcome: record.outcome === "failure" || record.outcome === "miss" ? "failure" : "success",
    narrate: check.narrate === "public", ...(DEGREES.includes(record.outcome) ? { degree: record.outcome as CheckDegree } : {}),
    detail: [dice, ...modifiers, ...(record.twist ? ["twist"] : [])].join("; "),
  };
};

export const checkRolls = (story: NormalizedStoryV2 | null, state: ChecksRuntimeState | undefined): RollRecord[] => {
  if (!story || !state?.records.length) return [];
  const byId = checksById(story);
  return state.records.flatMap((record) => {
    const check = byId.get(record.checkId);
    return check ? [rollOf(story, check, record)] : [];
  });
};
