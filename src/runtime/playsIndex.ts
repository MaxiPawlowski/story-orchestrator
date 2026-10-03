import { storyKind, type Chapter, type Checkpoint, type NormalizedStoryV2, type StoryDisplay, type StoryKind } from "@engine/index";
import { isRecord } from "@utils/guards";

export const PLAYS_LIMIT = 500;
export interface PlayRow {
  storyId: string;
  title: string;
  groupId: string;
  checkpointName: string | null;
  chapterTitle?: string;
  kind: StoryKind;
  updatedAt: string;
}

export type PlaysIndex = Record<string, PlayRow>;

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

const readRow = (value: unknown): PlayRow | null => {
  if (!isRecord(value)) return null;
  const storyId = text(value.storyId);
  const title = text(value.title);
  const groupId = text(value.groupId);
  const updatedAt = text(value.updatedAt);
  if (!storyId || !title || !groupId || !updatedAt || Number.isNaN(Date.parse(updatedAt))) return null;
  const chapterTitle = text(value.chapterTitle);
  return {
    storyId, title, groupId, checkpointName: text(value.checkpointName), ...(chapterTitle ? { chapterTitle } : {}),
    kind: value.kind === "saga" ? "saga" : "story", updatedAt,
  };
};

export const capPlays = (plays: PlaysIndex): PlaysIndex => {
  const entries = Object.entries(plays);
  if (entries.length <= PLAYS_LIMIT) return plays;
  return Object.fromEntries(entries.sort(([, left], [, right]) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, PLAYS_LIMIT));
};

export const sanitizePlays = (value: unknown): PlaysIndex => {
  if (!isRecord(value)) return {};
  const rows = Object.entries(value).flatMap(([chatId, row]) => {
    const read = chatId.trim() ? readRow(row) : null;
    return read ? [[chatId, read] as const] : [];
  });
  return capPlays(Object.fromEntries(rows));
};

const sameRow = (left: PlayRow | undefined, right: Omit<PlayRow, "updatedAt">) => Boolean(left)
  && left?.storyId === right.storyId && left.title === right.title && left.groupId === right.groupId && left.checkpointName === right.checkpointName
  && (left.chapterTitle ?? null) === (right.chapterTitle ?? null) && left.kind === right.kind;

export const upsertPlay = (plays: PlaysIndex, chatId: string, row: Omit<PlayRow, "updatedAt">, now: string): { plays: PlaysIndex; changed: boolean } => {
  if (!chatId || sameRow(plays[chatId], row)) return { plays, changed: false };
  return { plays: capPlays({ ...plays, [chatId]: { ...row, updatedAt: now } }), changed: true };
};

export const dropPlay = (plays: PlaysIndex, chatId: string): { plays: PlaysIndex; changed: boolean } => {
  if (!plays[chatId]) return { plays, changed: false };
  const { [chatId]: _dropped, ...rest } = plays;
  return { plays: rest, changed: true };
};

const playerChapterTitle = (chapter: Pick<Chapter, "title" | "player_title"> | undefined): string | undefined => chapter ? chapter.player_title ?? chapter.title : undefined;

export interface PlayView {
  story: Pick<NormalizedStoryV2, "title" | "chapters" | "checkpointById"> & { id?: string };
  storyId: string;
  activeCheckpointId: string | null;
  groupId: string;
}

export const playRow = ({ story, storyId, activeCheckpointId, groupId }: PlayView): Omit<PlayRow, "updatedAt"> => {
  const checkpoint: Checkpoint | undefined = activeCheckpointId ? story.checkpointById[activeCheckpointId] : undefined;
  const chapterTitle = playerChapterTitle(story.chapters?.find((chapter) => chapter.id === checkpoint?.chapter));
  return {
    storyId, title: story.title, groupId, checkpointName: checkpoint?.player_name ?? null, ...(chapterTitle ? { chapterTitle } : {}), kind: storyKind(story),
  };
};

const listOf = <T>(value: unknown, guard: (entry: unknown) => entry is T): T[] => (Array.isArray(value) ? value.filter(guard) : []);
const isCheckpoint = (value: unknown): value is Checkpoint => isRecord(value) && typeof value.id === "string";
const isChapter = (value: unknown): value is Chapter => isRecord(value) && typeof value.id === "string" && typeof value.title === "string";

export const playRowFromBlob = (blob: unknown, chatId: string, groupId: string, fallbackAt: string): PlayRow | null => {
  if (!isRecord(blob) || blob.chatId !== chatId || typeof blob.selectedStoryId !== "string" || !isRecord(blob.stories)) return null;
  const record = blob.stories[blob.selectedStoryId];
  if (!isRecord(record) || !isRecord(record.pinnedStory) || !isRecord(record.engineState)) return null;
  const pinned = record.pinnedStory;
  const title = text(pinned.title) ?? text(record.storyTitle);
  if (!title) return null;
  const checkpoints = listOf(pinned.checkpoints, isCheckpoint);
  const chapters = listOf(pinned.chapters, isChapter);
  const active = typeof record.engineState.activeCheckpointId === "string" ? record.engineState.activeCheckpointId : null;
  const savedAt = isRecord(record.extras) ? text(record.extras.updatedAt) : null;
  return {
    ...playRow({
      story: { title, chapters, checkpointById: Object.fromEntries(checkpoints.map((checkpoint) => [checkpoint.id, checkpoint])) },
      storyId: blob.selectedStoryId, activeCheckpointId: active, groupId,
    }),
    updatedAt: savedAt && !Number.isNaN(Date.parse(savedAt)) ? savedAt : fallbackAt,
  };
};

export interface ContinueRow extends PlayRow {
  chatId: string;
}

export const continueRows = (plays: PlaysIndex, displayOf: (storyId: string) => StoryDisplay | null | undefined, installOn: boolean): ContinueRow[] => {
  if (!installOn) return [];
  return Object.entries(plays)
    .filter(([, row]) => displayOf(row.storyId)?.continue_list !== false)
    .map(([chatId, row]) => ({ chatId, ...row }))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
};

export interface GroupPlay {
  groupId: string;
  chatId: string | null;
  row: PlayRow | null;
  bound: boolean;
}

export const groupPlays = (plays: PlaysIndex, bindings: Record<string, string>): Map<string, GroupPlay> => {
  const groups = new Map<string, GroupPlay>();
  for (const [chatId, row] of Object.entries(plays)) {
    const known = groups.get(row.groupId);
    if (!known?.row || known.row.updatedAt < row.updatedAt) groups.set(row.groupId, { groupId: row.groupId, chatId, row, bound: Boolean(bindings[row.groupId]) });
  }
  for (const groupId of Object.keys(bindings)) if (!groups.has(groupId)) groups.set(groupId, { groupId, chatId: null, row: null, bound: true });
  return groups;
};

export const lastPlayedText = (updatedAt: string, now: number): string => {
  const minutes = Math.max(0, Math.floor((now - Date.parse(updatedAt)) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
};

export const kindLabel = (kind: StoryKind): string => (kind === "saga" ? "Saga" : "Story");
