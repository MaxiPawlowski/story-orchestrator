import type { Checkpoint } from "@engine/index";
import { isRecord } from "@utils/guards";

export interface DeferredOpener {
  checkpointId: string;
  at: number;
  gate?: number;
}

interface ChatRow {
  is_user?: boolean;
  is_system?: boolean;
  mes?: string;
}

const SECOND_PERSON = /\b(?:you|your|yours|yourself)\b/i;

const escapeWord = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const quotedSpeech = (text: string): string[] => [...text.matchAll(/"([^"]+)"|“([^”]+)”/g)].map((match) => match[1] ?? match[2] ?? "");

const lastSentence = (text: string): string => text.trim().split(/(?<=[.!?])\s+/).at(-1) ?? "";

export const addressesPlayer = (text: string, playerNames: readonly string[]): boolean => {
  const words = playerNames.flatMap((name) => name.toLowerCase().split(/\s+/)).filter((word) => word.length > 2);
  const named = (line: string) => words.some((word) => new RegExp(`\\b${escapeWord(word)}\\b`, "i").test(line));
  const spoken = quotedSpeech(text).slice(-2);
  if (!spoken.length) return lastSentence(text.replace(/\*[^*]*\*/g, " ")).endsWith("?");
  return spoken.some((line) => line.includes("?") || SECOND_PERSON.test(line) || named(line));
};

const rowOf = (value: unknown): ChatRow => (isRecord(value) ? value as ChatRow : {});

export const lastReplyAwaitsPlayer = (chat: readonly unknown[], playerNames: readonly string[]): boolean => {
  const last = chat.map(rowOf).reverse().find((row) => !row.is_system);
  return Boolean(last && !last.is_user && addressesPlayer(last.mes ?? "", playerNames));
};

export const playerAnsweredSince = (chat: readonly unknown[], at: number): boolean => chat.slice(at + 1).map(rowOf).some((row) => row.is_user && !row.is_system);

export const opensWithLines = (checkpoint: Checkpoint): boolean =>
  (checkpoint.effects?.npc_replies ?? []).some((reply) => reply.trigger === "onEnter" && reply.enabled !== false && reply.new_chat_only !== true);

export const holdOpener = (checkpoint: Checkpoint, chat: readonly unknown[], playerName: string, gate?: number): DeferredOpener | null =>
  opensWithLines(checkpoint) && lastReplyAwaitsPlayer(chat, [playerName])
    ? { checkpointId: checkpoint.id, at: chat.length - 1, ...(gate !== undefined ? { gate } : {}) }
    : null;

export const heldOpenerLine = (checkpoint: Checkpoint, held: DeferredOpener): [string, string] =>
  [`the opening of ${checkpoint.name || checkpoint.id} waits for the player's answer`, `message ${held.at} ends on a line addressed to the player`];

export type OpenerRelease = { kind: "wait" } | { kind: "drop" } | { kind: "fire"; gate?: number };

export const openerRelease = (deferred: DeferredOpener | undefined, checkpointId: string, chat: readonly unknown[]): OpenerRelease => {
  if (!deferred) return { kind: "wait" };
  if (deferred.checkpointId !== checkpointId) return { kind: "drop" };
  return playerAnsweredSince(chat, deferred.at) ? { kind: "fire", ...(deferred.gate !== undefined ? { gate: deferred.gate } : {}) } : { kind: "wait" };
};

export const sanitizeDeferredOpener = (value: unknown): DeferredOpener | undefined =>
  isRecord(value) && typeof value.checkpointId === "string" && typeof value.at === "number" && (value.gate === undefined || typeof value.gate === "number")
    ? { checkpointId: value.checkpointId, at: value.at, ...(typeof value.gate === "number" ? { gate: value.gate } : {}) }
    : undefined;
