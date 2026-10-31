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

export interface ImageRowMessage { mes: string; extra?: { media?: ReadonlyArray<{ url?: unknown }> } }
export interface ImageRowChat { id: string; messages: ReadonlyArray<ImageRowMessage> }

export interface ImageRowRecord {
  load: (chatId: string) => string[];
  write: (chatId: string, paths: string[], persist: boolean) => Promise<WriteResult<{ chatId: string }>>;
}

export interface ImageRowDeps {
  chat: () => ImageRowChat | null;
  place: (row: PendingImageRow) => Promise<WriteResult<{ placed: true }>>;
  discard: (path: string) => Promise<WriteResult<{ path: string }>>;
  record: ImageRowRecord;
  dropped?: (reason: string) => void;
}

export interface SweepResult { done: boolean; deleted: string[]; kept: string[] }

export const postsRow = (placement: ImagePlacement, target: number | null): boolean =>
  placement === "message" || (placement === "inline" && target === null);

export const rowDropReason = (row: PendingImageRow, chat: ImageRowChat | null): string | null => {
  if (!chat || chat.id !== row.chatId) return "another chat was open when the next reply started";
  if (chat.messages.length - 1 < row.anchor) return "the reply it followed was removed before the next reply";
  if (row.target !== null && chat.messages[row.target]?.mes !== row.targetText) return "the reply it illustrates changed before the next reply";
  return null;
};

export const chatShowsImage = (chat: ImageRowChat, path: string): boolean =>
  chat.messages.some((message) => message.mes.includes(path) || (message.extra?.media ?? []).some((media) => media.url === path));

export class ImageRowQueue {
  private pending: PendingImageRow[] = [];
  constructor(private readonly deps: ImageRowDeps) {}

  get waiting(): number { return this.pending.length; }

  private async forget(chatId: string, paths: string[], persist = false): Promise<void> {
    if (this.deps.chat()?.id !== chatId) return;
    const drop = new Set(paths);
    const before = this.deps.record.load(chatId);
    const after = before.filter((path) => !drop.has(path));
    if (after.length !== before.length) await this.deps.record.write(chatId, after, persist);
  }

  private async remember(chatId: string, path: string): Promise<void> {
    if (this.deps.chat()?.id !== chatId) return;
    const before = this.deps.record.load(chatId);
    if (!before.includes(path)) await this.deps.record.write(chatId, [...before, path], true);
  }

  async queue(row: Omit<PendingImageRow, "anchor">): Promise<boolean> {
    const chat = this.deps.chat();
    if (!chat || chat.id !== row.chatId) return false;
    this.pending.push({ ...row, anchor: chat.messages.length - 1 });
    await this.remember(row.chatId, row.media.url);
    return true;
  }

  async post(type: unknown, dryRun: unknown): Promise<void> {
    if (!postsBeforeGeneration(type, dryRun) || !this.pending.length) return;
    for (const row of this.pending.splice(0)) {
      const reason = rowDropReason(row, this.deps.chat());
      if (reason) {
        const removed = await this.deps.discard(row.media.url);
        if (removed.ok) await this.forget(row.chatId, [row.media.url]);
        this.deps.dropped?.(`The picture "${row.caption}" was not posted: ${reason}.`);
        continue;
      }
      await this.forget(row.chatId, [row.media.url]);
      const placed = await this.deps.place(row);
      if (placed.ok) continue;
      await this.remember(row.chatId, row.media.url);
      this.deps.dropped?.(`The picture "${row.caption}" was not posted: ${placed.reason}`);
    }
  }

  async clear(): Promise<void> {
    for (const row of this.pending.splice(0)) {
      const removed = await this.deps.discard(row.media.url);
      if (removed.ok) await this.forget(row.chatId, [row.media.url]);
    }
  }

  async sweep(chatId: string, owns: () => boolean): Promise<SweepResult> {
    const result: SweepResult = { done: false, deleted: [], kept: [] };
    const waiting = new Set(this.pending.filter((row) => row.chatId === chatId).map((row) => row.media.url));
    const settled: string[] = [];
    for (const path of this.deps.record.load(chatId)) {
      if (waiting.has(path)) continue;
      const chat = this.deps.chat();
      if (!owns() || chat?.id !== chatId) return result;
      if (chatShowsImage(chat, path)) { result.kept.push(path); settled.push(path); continue; }
      const removed = await this.deps.discard(path);
      if (!removed.ok) continue;
      result.deleted.push(path);
      settled.push(path);
    }
    if (!owns()) return result;
    if (settled.length) await this.forget(chatId, settled, true);
    result.done = true;
    return result;
  }
}
