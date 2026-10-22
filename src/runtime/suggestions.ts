import { runsAsCommand } from "@utils/string";
import { projectionText, type PlayedProjection } from "./playerProjection";
import type { SuggestionAnchor } from "./suggestionAnchors";

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

export const ANCHOR_HEADING = "Build on these things the player already knows:";

const anchorBlock = (anchors: readonly Pick<SuggestionAnchor, "text">[]): string[] => (anchors.length ? [
  [ANCHOR_HEADING, ...anchors.map((entry, index) => `[${index + 1}] ${entry.text}`)].join("\n"),
  "Write one line for each numbered idea, starting with its tag, like \"- [1] …\"; make the other lines your own ideas.",
] : []);

export const buildSuggestionPrompt = (projection: PlayedProjection, anchors: readonly Pick<SuggestionAnchor, "text">[] = []): string => [
  `You help a player who is stuck in a roleplay story. Write exactly ${SUGGESTION_COUNT} short things ${projection.player || "the player"} could do or say next.`,
  SUGGESTION_RULES.map((rule) => `- ${rule}`).join("\n"),
  ...anchorBlock(anchors),
  `Answer with ${SUGGESTION_COUNT} lines, each starting with "- ", and nothing else.`,
  "---",
  projectionText(projection),
].join("\n\n");

const lastPlayerLine = (projection: PlayedProjection): string | null => {
  const player = projection.player.toLowerCase();
  const own = [...projection.transcript].reverse().find((line) => line.speaker.toLowerCase() === player);
  return own?.text.trim().toLowerCase() ?? null;
};

const escapeName = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const namesIn = (line: string, names: readonly string[]) => names.some((name) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeName(name)}(?![\\p{L}\\p{N}])`, "iu").test(line));

export const unseenWithheld = (projection: PlayedProjection, withheld: readonly string[]): string[] => {
  const shown = projectionText(projection);
  return withheld.filter((name) => !namesIn(shown, [name]));
};

export interface SuggestionLine {
  text: string;
  anchorId?: string;
  authored?: true;
}

export interface ParseOptions {
  anchors?: readonly SuggestionAnchor[];
  grounded?: (line: string, anchor: SuggestionAnchor) => boolean;
  screen?: (line: string) => boolean;
}

const TAG = /^\[(\d+)\]\s*/;

const unquote = (line: string) => line.replace(/^["“]|["”]$/g, "").trim();

const tagged = (line: string, options: ParseOptions): SuggestionLine => {
  const match = TAG.exec(line);
  if (!match) return { text: line };
  const text = unquote(line.slice(match[0].length));
  const anchor = options.anchors?.[Number(match[1]) - 1];
  return anchor && options.grounded?.(text, anchor) ? { text, anchorId: anchor.id } : { text };
};

export function parseSuggestionLines(text: string, projection: PlayedProjection, withheld: readonly string[] = [], options: ParseOptions = {}): SuggestionLine[] {
  const last = lastPlayerLine(projection);
  const unseen = unseenWithheld(projection, withheld);
  const seen = new Set<string>();
  return text.split("\n")
    .map((line) => tagged(unquote(line.trim().replace(/^(?:[-*•]|\d+[.)])\s*/, "")), options))
    .filter(({ text: line }) => line.length > 0 && line.length <= SUGGESTION_MAX_CHARS && !/^(?:here are|sure|suggestions?:)/i.test(line))
    .filter(({ text: line }) => !runsAsCommand(line) && !namesIn(line, unseen) && (options.screen?.(line) ?? true))
    .filter(({ text: line }) => {
      const key = line.toLowerCase();
      if (key === last || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, SUGGESTION_COUNT);
}

export const parseSuggestions = (text: string, projection: PlayedProjection, withheld: readonly string[] = []): string[] =>
  parseSuggestionLines(text, projection, withheld).map((line) => line.text);

export const suggestionsUsable = (suggestions: readonly unknown[]): boolean => suggestions.length >= SUGGESTION_MIN;

export type FillRefusal = "chat-changed" | "box-changed";

export const fillRefusal = (input: { chatAtAsk: string; chatNow: string; boxAtAsk: string; boxNow: string }): FillRefusal | null => {
  if (input.chatAtAsk !== input.chatNow) return "chat-changed";
  if (input.boxNow.trim() && input.boxNow !== input.boxAtAsk) return "box-changed";
  return null;
};
