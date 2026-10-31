import { imageChat, imageDelete, imagePlace, type ImageMedia } from "@services/stHost/image";
import { couldNot, wrote, type WriteResult } from "@utils/writeResult";
import { log } from "@utils/log";
import { ImageRowQueue, postsRow, type ImagePlacement } from "./imageRows";

export const imageRows = new ImageRowQueue({
  chat: imageChat,
  place: (row) => imagePlace(row.chatId, null, row.caption, row.media, "message"),
  discard: (path) => imageDelete(path),
  dropped: (reason) => log.warn(reason),
});

export async function placeImage(
  chatId: string, target: number | null, targetText: string | null, caption: string, media: ImageMedia, placement: ImagePlacement,
): Promise<WriteResult<{ placed: true }>> {
  if (!postsRow(placement, target)) return imagePlace(chatId, target, caption, media, placement);
  return imageRows.queue({ chatId, target, targetText, caption, media }) ? wrote({ placed: true }) : couldNot("The chat changed while the image was rendering.");
}
