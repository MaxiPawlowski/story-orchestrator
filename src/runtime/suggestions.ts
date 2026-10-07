import { projectionText, type PlayedProjection } from "./playerProjection";

export const SUGGESTION_COUNT = 4;
export const SUGGESTION_MIN = 3;
export const SUGGESTION_MAX_CHARS = 200;
export const SUGGESTION_MAX_TOKENS = 400;

export const SUGGESTION_RULES = [
  "Suggest, never decide: each line is something the player could try, said or done in the player's own voice, in the first person.",
  "Never state how it turns out: no line says what the player finds, wins, learns or what anyone does in answer.",
  "Use only what is written below: no place, person, secret or event the story has not shown yet.",
  "Make each line fit the current scene and differ from the others; at least one should engage the current goal or an open thread.",
  "Never repeat the player's last message.",
] as const;

export const buildSuggestionPrompt = (projection: PlayedProjection): string => [
  `You help a player who is stuck in a roleplay story. Write exactly ${SUGGESTION_COUNT} short things ${projection.player || "the player"} could do or say next.`,
  SUGGESTION_RULES.map((rule) => `- ${rule}`).join("\n"),
  `Answer with ${SUGGESTION_COUNT} lines, each starting with "- ", and nothing else.`,
  "---",
  projectionText(projection),
].join("\n\n");

const lastPlayerLine = (projection: PlayedProjection): string | null => {
  const player = projection.player.toLowerCase();
  const own = [...projection.transcript].reverse().find((line) => line.speaker.toLowerCase() === player);
  return own?.text.trim().toLowerCase() ?? null;
};

export function parseSuggestions(text: string, projection: PlayedProjection): string[] {
  const last = lastPlayerLine(projection);
  const seen = new Set<string>();
  return text.split("\n")
    .map((line) => line.trim().replace(/^(?:[-*•]|\d+[.)])\s*/, "").replace(/^["“]|["”]$/g, "").trim())
    .filter((line) => line.length > 0 && line.length <= SUGGESTION_MAX_CHARS && !/^(?:here are|sure|suggestions?:)/i.test(line))
    .filter((line) => {
      const key = line.toLowerCase();
      if (key === last || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, SUGGESTION_COUNT);
}

export const suggestionsUsable = (suggestions: readonly string[]): boolean => suggestions.length >= SUGGESTION_MIN;

export type FillRefusal = "chat-changed" | "box-changed";

export const fillRefusal = (input: { chatAtAsk: string; chatNow: string; boxAtAsk: string; boxNow: string }): FillRefusal | null => {
  if (input.chatAtAsk !== input.chatNow) return "chat-changed";
  if (input.boxNow.trim() && input.boxNow !== input.boxAtAsk) return "box-changed";
  return null;
};
