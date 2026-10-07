import type { StoryV2 } from "@engine/index";
import { briefingTermsFor, namesTerms } from "./briefingDiagnostics";

type PlayerCode = "opener-uses-player-name" | "player-spoiler-risk";

export const PLAYER_CONSEQUENCES: Record<PlayerCode, string> = {
  "opener-uses-player-name": "The opening line names the player as whoever is playing when it posts; a player who changes persona later is still called that in it.",
  "player-spoiler-risk": "The player reads this at the start, so it may give away a scene, an outcome or a character still ahead.",
};

export interface PlayerRun {
  draft: StoryV2;
  push: (code: PlayerCode, severity: "warning" | "info", path: string, message: string) => void;
  startId: string;
}

const PLAYER_MACRO = /\{\{\s*user\s*\}\}/i;

const playerFields = (draft: StoryV2): Array<[string, string]> => {
  const player = draft.player;
  if (!player) return [];
  return [
    ...(player.role ? [["player.role", player.role] as [string, string]] : []),
    ...(player.summary ? [["player.summary", player.summary] as [string, string]] : []),
    ...(player.assumes ?? []).map((line, index): [string, string] => [`player.assumes.${index}`, line]),
  ];
};

export const checkPlayerProfile = ({ draft, push, startId }: PlayerRun) => {
  const terms = briefingTermsFor(draft, startId);
  playerFields(draft).forEach(([path, text]) => {
    const found = namesTerms(text, terms);
    if (found.length) push("player-spoiler-risk", "warning", path, `this player text names ${found.join(", ")}; keep it to what the player may know at the start`);
  });
  draft.checkpoints.forEach((checkpoint, index) => {
    (checkpoint.effects?.npc_replies ?? []).forEach((reply, at) => {
      if (reply.new_chat_only && PLAYER_MACRO.test(reply.text ?? "")) {
        push("opener-uses-player-name", "info", `checkpoints.${index}.effects.npc_replies.${at}.text`, "the opening line says {{user}}; it shows the persona chosen at the start");
      }
    });
  });
};
