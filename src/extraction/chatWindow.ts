import { getContext } from "@services/STAPI";
import type { SharedReadWindow } from "./types";
import { lastMessageTextOf, windowOf } from "./chatRows";

const hostChat = (): unknown[] => (Array.isArray(getContext().chat) ? getContext().chat : []);

export function getChatWindow(from: number, to?: number): SharedReadWindow {
  return windowOf(hostChat(), from, to);
}

export const rereadWindow = (window: { from: number; to: number }): SharedReadWindow => getChatWindow(window.from, window.to);

export function getLastMessageText(): string {
  return lastMessageTextOf(hostChat());
}
