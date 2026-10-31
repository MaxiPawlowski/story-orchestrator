export interface PendingNote {
  chatId: string;
  checkpointId: string | null;
  anchor: number;
  text: string;
  what: string;
}

export interface NoteMoment {
  chatId: string;
  lastMessageId: number;
  activeCheckpointId: string | null;
  announcing: boolean;
}

export const postsBeforeGeneration = (type: unknown, dryRun: unknown): boolean =>
  dryRun !== true && (type === undefined || type === null || type === "normal");

const dropReason = (note: PendingNote, now: NoteMoment): string | null => {
  if (!now.announcing) return "transition notes were switched off before the next reply";
  if (note.chatId !== now.chatId) return "another chat was open when the next reply started";
  if (now.lastMessageId < note.anchor) return "the reply it followed was removed before the next reply";
  if (note.checkpointId !== null && note.checkpointId !== now.activeCheckpointId) return "the story stepped back before the next reply";
  return null;
};

export const dueNotes = (pending: readonly PendingNote[], now: NoteMoment) => {
  const post: PendingNote[] = [];
  const dropped: Array<{ note: PendingNote; reason: string }> = [];
  for (const note of pending) {
    const reason = dropReason(note, now);
    if (reason) dropped.push({ note, reason });
    else post.push(note);
  }
  return { post, dropped };
};
