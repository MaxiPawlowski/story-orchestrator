import { isRecord } from "@utils/guards";

let ownPosts = 0;

export const ownPost = (): (() => void) => {
  ownPosts += 1;
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    ownPosts -= 1;
  };
};

export const isPlayerRow = (row: unknown): boolean => isRecord(row) && row.is_user === true && row.is_system !== true;

export const isPlayerSend = (messageId: number | null, chat: readonly unknown[] | undefined): boolean =>
  ownPosts === 0 && messageId !== null && isPlayerRow(chat?.[messageId]);
