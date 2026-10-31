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

export interface NoteQueueDeps {
  moment: () => Omit<NoteMoment, "announcing">;
  post: (text: string) => Promise<boolean>;
  journal?: (summary: string, note?: string) => void;
}

type Announcing = { ui: { announceTransitions: boolean } };

export class TransitionNoteQueue {
  private pending: PendingNote[] = [];
  private extras: Announcing | null = null;
  constructor(private readonly deps: NoteQueueDeps) {}

  get waiting(): boolean { return this.pending.length > 0; }

  queue(raw: string, what: string, extras: Announcing, checkpointId?: string) {
    const { chatId, lastMessageId, activeCheckpointId } = this.deps.moment();
    this.extras = extras;
    this.pending.push({ chatId, checkpointId: checkpointId ?? activeCheckpointId, anchor: lastMessageId, text: raw.replace(/\s*\r?\n\s*/g, " ").trim(), what });
  }

  async post(type: unknown, dryRun: unknown, extras: Announcing | null = this.extras, activeCheckpointId?: string | null) {
    if (!postsBeforeGeneration(type, dryRun) || !this.pending.length) return;
    const moment = this.deps.moment();
    const now = { ...moment, activeCheckpointId: activeCheckpointId === undefined ? moment.activeCheckpointId : activeCheckpointId, announcing: extras?.ui.announceTransitions === true };
    const due = dueNotes(this.pending.splice(0), now);
    for (const { note, reason } of due.dropped) this.deps.journal?.(`${note.what} was not announced`, reason);
    for (const note of due.post) {
      if (!(await this.deps.post(note.text))) this.deps.journal?.(`${note.what} was not announced`, "the /comment that posts the note was refused");
    }
  }
}
