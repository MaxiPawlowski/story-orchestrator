import { postsBeforeGeneration } from "@runtime/transitionNotes";
import type { ImageMedia } from "@services/stHost/image";
import type { WriteResult } from "@utils/writeResult";

export type ImagePlacement = "inline" | "message" | "background";

export interface PendingImageRow {
  chatId: string;
  target: number | null;
  targetText: string | null;
  anchor: number;
  caption: string;
  media: ImageMedia;
}

export interface ImageRowChat { id: string; messages: ReadonlyArray<{ mes: string }> }

export interface ImageRowDeps {
  chat: () => ImageRowChat | null;
  place: (row: PendingImageRow) => Promise<WriteResult<{ placed: true }>>;
  discard: (path: string) => Promise<unknown>;
  dropped?: (reason: string) => void;
}

export const postsRow = (placement: ImagePlacement, target: number | null): boolean =>
  placement === "message" || (placement === "inline" && target === null);

export const rowDropReason = (row: PendingImageRow, chat: ImageRowChat | null): string | null => {
  if (!chat || chat.id !== row.chatId) return "another chat was open when the next reply started";
  if (chat.messages.length - 1 < row.anchor) return "the reply it followed was removed before the next reply";
  if (row.target !== null && chat.messages[row.target]?.mes !== row.targetText) return "the reply it illustrates changed before the next reply";
  return null;
};

export class ImageRowQueue {
  private pending: PendingImageRow[] = [];
  constructor(private readonly deps: ImageRowDeps) {}

  get waiting(): number { return this.pending.length; }

  queue(row: Omit<PendingImageRow, "anchor">): boolean {
    const chat = this.deps.chat();
    if (!chat || chat.id !== row.chatId) return false;
    this.pending.push({ ...row, anchor: chat.messages.length - 1 });
    return true;
  }

  async post(type: unknown, dryRun: unknown): Promise<void> {
    if (!postsBeforeGeneration(type, dryRun) || !this.pending.length) return;
    for (const row of this.pending.splice(0)) {
      const reason = rowDropReason(row, this.deps.chat());
      if (reason) {
        await this.deps.discard(row.media.url);
        this.deps.dropped?.(`The picture "${row.caption}" was not posted: ${reason}.`);
        continue;
      }
      const placed = await this.deps.place(row);
      if (!placed.ok) this.deps.dropped?.(`The picture "${row.caption}" was not posted: ${placed.reason}`);
    }
  }

  async clear(): Promise<void> {
    for (const row of this.pending.splice(0)) await this.deps.discard(row.media.url);
  }
}
