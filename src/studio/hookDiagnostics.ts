import type { Story } from "@engine/index";
import { narratesPlayer } from "./cueDiagnostics";

type HookCode = "npc-reply-directs-player" | "opening-narrator-only";

export const HOOK_CONSEQUENCES: Record<HookCode, string> = {
  "npc-reply-directs-player": "The character is told to write what the player does or to ask what the player does, so the reply may decide for the player or read like a game master's prompt.",
  "opening-narrator-only": "Only the narrator speaks before the player's first message, so nobody in the party turns to the player at the start.",
};

export interface HookRun {
  draft: Story;
  push: (code: HookCode, severity: "warning" | "info", path: string, message: string) => void;
  startId: string;
}

const WHO = String.raw`(?:you|they|\{\{\s*user\s*\}\}|the player)`;

const ASKS_WHAT_PLAYER_DOES = new RegExp(String.raw`\bwhat\s+(?:(?:do|does|will|would|should)\s+${WHO}|${WHO}\s+(?:will|would|should|are going to|plan to|want to)?)\s*(?:do|choose)\b`, "i");

export const directsPlayer = (text: string): boolean => narratesPlayer(text) || ASKS_WHAT_PLAYER_DOES.test(text);

export const checkHookDiagnostics = ({ draft, push, startId }: HookRun) => {
  draft.checkpoints.forEach((checkpoint, index) => {
    (checkpoint.effects?.npc_replies ?? []).forEach((reply, at) => {
      if (reply.kind === "llm" && directsPlayer(reply.instruction ?? "")) {
        push("npc-reply-directs-player", "warning", `checkpoints.${index}.effects.npc_replies.${at}.instruction`, `the instruction for ${reply.member} writes or asks what the player does`);
      }
    });
  });
  const startIndex = draft.checkpoints.findIndex((checkpoint) => checkpoint.id === startId);
  const replies = (draft.checkpoints[startIndex]?.effects?.npc_replies ?? []).filter((reply) => reply.enabled !== false);
  const opener = replies.findIndex((reply) => reply.new_chat_only && reply.kind === "scripted");
  if (opener < 0 || replies.some((reply) => reply.trigger === "onEnter" && reply.kind === "llm" && (reply.new_chat_only || reply.ask_player))) return;
  push("opening-narrator-only", "info", `checkpoints.${startIndex}.effects.npc_replies`,
    "the start beat opens with a scripted line and no opening hook (an llm onEnter reply with new_chat_only or ask_player)");
};
