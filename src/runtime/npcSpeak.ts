import type { NpcReplyEffect } from "@engine/index";
import { getActiveGroup, getContext, guardHostStream, isHostGenerating, resolveGroupMemberId, stopHostGeneration, watchHostChatMove } from "@services/STAPI";
import { oneShotDirectionText } from "@pacing/guidance";
import type { SpeechRequest, SpeechReservation } from "./speechLedger";
import type { SpeechBudget } from "./speechBudget";
import { messageRevision } from "./yourMove";
import { isRecord } from "@utils/guards";
import type { WriteResult } from "@utils/writeResult";
import { castFlag } from "./effectLedger";
import { fireReply } from "./effectSteps";
import { generationWatch } from "./generationWatch";
import type { RunOwnership } from "./runToken";

export interface SpeakDeps {
  direct?: (member: string, text: string, scope?: "call" | "draft") => (() => void) | null;
  journal?: (summary: string, note?: string) => void;
}

export const hostChat = (): unknown[] => (Array.isArray(getContext().chat) ? getContext().chat : []);

export const lastMessageId = () => hostChat().length - 1;

export const playerHasSpoken = () => hostChat().some((row) => isRecord(row) && row.is_user === true && row.is_system !== true);

export const lastSpeakerName = (): string => {
  const last = hostChat().filter(isRecord).reverse().find((row) => row.is_system !== true);
  return last && last.is_user !== true && typeof last.name === "string" ? last.name : "";
};

export const memberSpeaks = (name: string): boolean => {
  const group = getActiveGroup();
  const member = resolveGroupMemberId(name);
  return Boolean(group && member && !castFlag(group, member).disabled);
};

export const rollsReply = (reply: NpcReplyEffect, trigger: string, key: string, deps: SpeakDeps & { roll?: (key: string) => number | null }): boolean => {
  if (typeof reply.probability !== "number") return true;
  const roll = deps.roll?.(key) ?? Math.random();
  const fired = roll <= reply.probability;
  deps.journal?.(`NPC reply ${reply.member} (${trigger}) ${fired ? "fired" : "skipped"} by its roll`, `rolled ${roll.toFixed(3)} against ${reply.probability} at ${key}`);
  return fired;
};

export const settleSpeech = (
  speech: Pick<SpeechBudget, "settle" | "recordEntry"> | undefined, reply: NpcReplyEffect, entry: string | null, reservation: SpeechReservation | null, rendered: number | null,
) => {
  if (reservation) speech?.settle(reservation, rendered);
  else if (entry !== null && rendered !== null) speech?.recordEntry(reply.member, rendered, reply.kind !== "scripted", entry);
};

export const npcSpeechRequest = (reply: NpcReplyEffect, entry: string): SpeechRequest => ({
  origin: "npc",
  member: reply.member,
  generated: reply.kind !== "scripted",
  source: { messageId: lastMessageId(), revision: messageRevision(hostChat().at(-1)) },
  entry,
  recipient: reply.ask_player ? "player" : "scene",
  instruction: reply.kind === "scripted" ? null : oneShotDirectionText(reply) || null,
  yieldAfter: reply.ask_player === true,
});

const armDirection = (reply: NpcReplyEffect, deps: SpeakDeps): { text: string; release: (() => void) | null } => {
  const text = oneShotDirectionText(reply);
  const release = text && deps.direct ? deps.direct(reply.member, text) : null;
  if (text && deps.direct && !release) deps.journal?.(`${reply.member}'s instruction was not delivered`, "the member is not in this story's cast, so the reply was written without it");
  return { text, release };
};

export const speakGenerated = async (reply: NpcReplyEffect, ownership: RunOwnership, deps: SpeakDeps): Promise<WriteResult & { direction?: string }> => {
  const { text, release } = armDirection(reply, deps);
  const chatId = String(getContext().chatId ?? "");
  const stream = guardHostStream(chatId);
  const lapse = ownership.signal?.();
  const before = generationWatch.openedCount();
  let stopped = false;
  const stopIfOurs = () => {
    if (stopped) return;
    stopped = true;
    if (stream.halt()) return;
    if (before !== null && generationWatch.openedCount() === before + 1 && isHostGenerating()) stopHostGeneration();
  };
  lapse?.addEventListener("abort", stopIfOurs, { once: true });
  const unwatch = watchHostChatMove(chatId, stopIfOurs);
  try {
    const fired = await fireReply(reply);
    if (!fired.ok) deps.journal?.(`${reply.member}'s reply was not triggered`, fired.reason);
    return fired.ok && release ? { ...fired, direction: text } : fired;
  } finally {
    release?.();
    unwatch();
    lapse?.removeEventListener("abort", stopIfOurs);
    stream.release();
  }
};
