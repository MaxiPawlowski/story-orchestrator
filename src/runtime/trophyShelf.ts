import { milestoneEarned, valueReader, type NormalizedStory, type ValidationError } from "@engine/index";
import { heldSecrets, withoutSecretLines } from "@memory/heldSecrets";
import { isRecord } from "@utils/guards";
import { epistemicOf, finalOf, recordsOf } from "./carryCandidate";
import { rosterMemberName } from "./roster";
import type { ContinueRow } from "./playsIndex";

export const TROPHY_SHELF_MAX = 20;

export interface TrophyRow {
  chatId: string;
  storyTitle: string;
  endingTitle: string;
  endedAt: string;
  milestones: string[];
}

export type TrophyResult = { ok: true; row: TrophyRow } | { ok: false; reason: string };

export interface TrophyOptions {
  version: number;
  parse: (raw: unknown) => NormalizedStory | ValidationError[];
}

export const shelfCandidates = (rows: readonly Pick<ContinueRow, "chatId" | "ended" | "updatedAt">[]): string[] => [...rows]
  .filter((row) => row.ended === true)
  .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  .slice(0, TROPHY_SHELF_MAX)
  .map((row) => row.chatId);

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export const trophyFromBlob = (blob: unknown, chatId: string, options: TrophyOptions): TrophyResult => {
  if (!isRecord(blob) || blob.version !== options.version || blob.chatId !== chatId || !isRecord(blob.stories) || typeof blob.selectedStoryId !== "string") {
    return { ok: false, reason: "the chat's story state is unreadable" };
  }
  const record = blob.stories[blob.selectedStoryId];
  if (!isRecord(record) || !isRecord(record.pinnedStory) || !text(record.contentHashAtLoad)) return { ok: false, reason: "the chat holds no pinned story" };
  const final = finalOf(recordsOf(record.extras));
  if (!final) return { ok: false, reason: "the run has not ended" };
  const story = options.parse(record.pinnedStory);
  if (Array.isArray(story)) return { ok: false, reason: "the run's copy of the story does not parse" };
  const secrets = heldSecrets(epistemicOf(record.extras), story.roster.map(rosterMemberName));
  const resting = (line: string) => withoutSecretLines(line, secrets, null).trim();
  const reader = valueReader(final.blackboardAt);
  const milestones = (story.milestones ?? []).filter((milestone) => !milestone.secret && milestoneEarned(milestone, reader)).map((milestone) => resting(milestone.title)).filter(Boolean);
  return { ok: true, row: { chatId, storyTitle: story.title, endingTitle: resting(final.playerTitle), endedAt: new Date(final.at).toISOString(), milestones } };
};
