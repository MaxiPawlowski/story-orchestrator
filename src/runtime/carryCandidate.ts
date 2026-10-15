import {
  CARRY_CANDIDATES_MAX, PREVIOUSLY_TOKENS, type CarryProjection, type CarryState, type CarryValue, type NormalizedStoryV2, type ValidationError,
} from "@engine/index";
import { carryValues, publicOutcome, type CarrySkip } from "@engine/carry";
import { checkCarryPair } from "@engine/validate/carry";
import { estimateTokens } from "@memory/budget";
import { heldSecrets, withoutSecretLines } from "@memory/heldSecrets";
import type { EpistemicEntry } from "@memory/types";
import { isRecord } from "@utils/guards";
import { rosterMemberName } from "./roster";
import type { PlaysIndex } from "./playsIndex";
import { PREVIOUSLY_HEADER } from "./carryPort";

export const candidateChats = (plays: PlaysIndex, story: string, openChat: string | null): string[] => Object.entries(plays)
  .filter(([chatId, row]) => row.storyId === story && row.ended === true && chatId !== openChat)
  .sort(([, left], [, right]) => right.updatedAt.localeCompare(left.updatedAt))
  .slice(0, CARRY_CANDIDATES_MAX)
  .map(([chatId]) => chatId);

export interface CarryCandidate {
  chatId: string;
  endedAt: string;
  sourceStoryHash: string;
  projection: CarryProjection;
}

export type CandidateResult = { ok: true; candidate: CarryCandidate } | { ok: false; reason: string };

export interface CandidateOptions {
  version: number;
  parse: (raw: unknown) => NormalizedStoryV2 | ValidationError[];
}

interface FinalRecord {
  playerTitle: string;
  blackboardAt: Record<string, unknown>;
  at: number;
}

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const recordsOf = (extras: unknown): Record<string, unknown>[] => {
  const memory = isRecord(extras) && isRecord(extras.memory) ? extras.memory : null;
  return memory && Array.isArray(memory.chapters) ? memory.chapters.filter(isRecord) : [];
};

const isEpistemic = (value: unknown): value is EpistemicEntry => isRecord(value) && typeof value.subject === "string" && typeof value.content === "string" && typeof value.tag === "string";

const epistemicOf = (extras: unknown): EpistemicEntry[] => {
  const memory = isRecord(extras) && isRecord(extras.memory) ? extras.memory : null;
  return memory && Array.isArray(memory.epistemic) ? memory.epistemic.filter(isEpistemic) : [];
};

const finalOf = (records: Record<string, unknown>[]): FinalRecord | null => {
  const found = [...records].reverse().find((record) => record.final === true);
  const sealedAt = found && isRecord(found.sealedAt) ? found.sealedAt : null;
  if (!found || !isRecord(found.blackboardAt) || !text(found.playerTitle) || typeof sealedAt?.at !== "number") return null;
  return { playerTitle: text(found.playerTitle), blackboardAt: found.blackboardAt, at: sealedAt.at };
};

const missingKeys = (target: NormalizedStoryV2, values: Record<string, unknown>): string[] =>
  (target.carry_from?.map ?? []).filter((entry) => !["string", "number", "boolean"].includes(typeof values[entry.from])).map((entry) => entry.from);

const chapterLines = (records: Record<string, unknown>[], resting: (line: string) => string): string[] => {
  const end = records.findIndex((record) => record.final === true);
  return records.slice(0, end < 0 ? records.length : end + 1).map((record) => resting(text(record.short))).filter(Boolean);
};

export const carryCandidateFromBlob = (blob: unknown, chatId: string, target: NormalizedStoryV2, options: CandidateOptions): CandidateResult => {
  const carry = target.carry_from;
  if (!carry) return { ok: false, reason: "this story carries nothing" };
  if (!isRecord(blob) || blob.version !== options.version || blob.chatId !== chatId || !isRecord(blob.stories)) return { ok: false, reason: "the chat's story state is unreadable" };
  const record = blob.stories[carry.story];
  if (!isRecord(record) || !isRecord(record.pinnedStory) || !text(record.contentHashAtLoad)) return { ok: false, reason: "the chat did not play the earlier story" };
  const records = recordsOf(record.extras);
  const final = finalOf(records);
  if (!final) return { ok: false, reason: "the run has not ended" };
  const source = options.parse(record.pinnedStory);
  if (Array.isArray(source)) return { ok: false, reason: "the run's copy of the earlier story does not parse" };
  const problems = checkCarryPair(source, target, "pick");
  if (problems.length) return { ok: false, reason: problems.map((problem) => problem.message).join("; ") };
  const missing = missingKeys(target, final.blackboardAt);
  if (missing.length) return { ok: false, reason: `the run's ending holds no ${missing.join(", ")}` };
  const secrets = heldSecrets(epistemicOf(record.extras), source.roster.map(rosterMemberName));
  const resting = (line: string) => withoutSecretLines(line, secrets, null);
  const projection: CarryProjection = {
    storyTitle: source.title,
    endingTitle: resting(final.playerTitle),
    outcome: publicOutcome(source, final.blackboardAt, new Set(carry.map.map((entry) => entry.from))).map((line) => ({ ...line, label: resting(line.label) })).filter((line) => line.label),
    lines: chapterLines(records, resting),
  };
  return { ok: true, candidate: { chatId, endedAt: new Date(final.at).toISOString(), sourceStoryHash: text(record.contentHashAtLoad), projection } };
};

const SENTENCE = /(?<=[.!?]["')\]]?)\s+/;

const capped = (lines: string[], budget: number): string[] => {
  const kept: string[] = [];
  for (const sentence of lines.flatMap((line) => line.split(SENTENCE)).map((part) => part.trim()).filter(Boolean)) {
    if (estimateTokens([...kept, sentence].join(" ")) > budget) break;
    kept.push(sentence);
  }
  return kept;
};

export const previouslyText = (projection: CarryProjection, values: readonly CarryValue[], budget = PREVIOUSLY_TOKENS): string | null => {
  const ending = projection.endingTitle ? `"${projection.storyTitle}" ended with "${projection.endingTitle}".` : `"${projection.storyTitle}" has ended.`;
  const heritage = values.filter((value) => value.as === "heritage").map((value) => (/[.!?]$/.test(value.label) ? value.label : `${value.label}.`));
  const head = capped([ending, ...heritage], budget);
  const recent: string[] = [];
  for (const line of [...projection.lines].reverse()) {
    if (estimateTokens([...head, line, ...recent].join(" ")) > budget) break;
    recent.unshift(line);
  }
  const joined = [...head, ...recent].join(" ").trim();
  return joined || null;
};

export const buildCarryState = (target: NormalizedStoryV2, candidate: CarryCandidate, now: string): { state: CarryState; skipped: CarrySkip[] } => {
  const { values, skipped } = carryValues(target, candidate.projection);
  const carry = target.carry_from;
  const previously = carry?.previously === false ? null : previouslyText(candidate.projection, values, PREVIOUSLY_TOKENS - estimateTokens(PREVIOUSLY_HEADER));
  return {
    state: {
      fromChat: candidate.chatId, fromStory: carry?.story ?? "", sourceStoryHash: candidate.sourceStoryHash, mode: carry?.mode ?? "sequel",
      projection: JSON.parse(JSON.stringify(candidate.projection)) as CarryProjection, values, previously, createdAt: now,
    },
    skipped,
  };
};
