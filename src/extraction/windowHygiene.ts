import { stripReasoningBlocks } from "./parse";

export const HYGIENE_VERSION = 1;

export interface WindowForm {
  hygiene: number;
  promptRegex: boolean;
}

export const CLEANED_FORM: WindowForm = { hygiene: HYGIENE_VERSION, promptRegex: false };

export type WindowDropReason = "not a message" | "hidden" | "in flight" | "system type" | "image post" | "thoughts" | "suggestions" | "empty";

export type CleanedMessage =
  | { keep: false; reason: WindowDropReason }
  | { keep: true; text: string; isUser: boolean; speaker: string };

const ST_SYSTEM_TYPES = new Set([
  "help", "welcome", "empty", "generic", "comment", "slash_commands", "formatting", "hotkeys", "macros",
  "welcome_prompt", "assistant_note", "assistant_message",
]);

const DROPPED_ELEMENTS = new Set(["details", "script", "style", "template"]);
const VOID_ELEMENTS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const BLOCK_ELEMENTS = /^(?:br|p|div|li|tr|h[1-6]|blockquote|section|article|ul|ol|table|summary|pre|hr)$/i;
const OPEN_TAG = /<([a-zA-Z][\w:-]*)((?:\s[^<>]*?)?)(\/?)>/g;
const ANY_TAG = /<\/?([a-zA-Z][\w:-]*)(?:\s[^<>]*)?\/?>/g;
const HIDDEN_STYLE = /\bstyle\s*=\s*(["'])[^"']*?\bdisplay\s*:\s*none\b/i;
const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([^`\s][^`]*)?$/;
const ENTITY = /&(amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-f]+);/gi;
const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const closers = new Map<string, RegExp>();

const closingEnd = (text: string, name: string, from: number): number => {
  const tokens = closers.get(name) ?? new RegExp(`<(/?)${name}\\b[^<>]*?(/?)>`, "gi");
  closers.set(name, tokens);
  tokens.lastIndex = from;
  let depth = 1;
  for (let match = tokens.exec(text); match; match = tokens.exec(text)) {
    if (match[2]) continue;
    depth += match[1] ? -1 : 1;
    if (depth === 0) return match.index + match[0].length;
  }
  return text.length;
};

const dropElements = (text: string): string => {
  const kept: string[] = [];
  let from = 0;
  OPEN_TAG.lastIndex = 0;
  for (let match = OPEN_TAG.exec(text); match; match = OPEN_TAG.exec(text)) {
    const name = match[1].toLowerCase();
    if (!DROPPED_ELEMENTS.has(name) && !HIDDEN_STYLE.test(match[2])) continue;
    const tagEnd = match.index + match[0].length;
    const end = match[3] || VOID_ELEMENTS.has(name) ? tagEnd : closingEnd(text, name, tagEnd);
    kept.push(text.slice(from, match.index), "\n");
    from = end;
    OPEN_TAG.lastIndex = end;
  }
  kept.push(text.slice(from));
  return kept.join("");
};

const dropTaggedFences = (text: string): string => {
  const kept: string[] = [];
  let open: { marker: string; drop: boolean } | null = null;
  for (const line of text.split("\n")) {
    const fence = FENCE.exec(line);
    if (!open) {
      if (fence) open = { marker: fence[1], drop: Boolean(fence[2]?.trim()) };
      else kept.push(line);
      continue;
    }
    if (fence && !fence[2] && fence[1][0] === open.marker[0] && fence[1].length >= open.marker.length) {
      open = null;
      continue;
    }
    if (!open.drop) kept.push(line);
  }
  return kept.join("\n");
};

const decodeEntities = (text: string): string => text.replace(ENTITY, (whole, body: string) => {
  const key = body.toLowerCase();
  if (NAMED_ENTITIES[key] !== undefined) return NAMED_ENTITIES[key];
  const code = key.startsWith("#x") ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
  return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
});

const collapseWhitespace = (text: string): string => text
  .split("\n")
  .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
  .join("\n")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

export function cleanMessageText(raw: string): string {
  const unreasoned = stripReasoningBlocks(raw.replace(/\r\n?/g, "\n").trim());
  const uncommented = unreasoned.replace(/<!--[\s\S]*?(?:-->|$)/g, "");
  const visible = dropTaggedFences(dropElements(uncommented));
  const untagged = visible.replace(ANY_TAG, (_tag, name: string) => (BLOCK_ELEMENTS.test(name) ? "\n" : ""));
  return collapseWhitespace(decodeEntities(untagged));
}

const isImagePost = (entry: Record<string, unknown>, extra: Record<string, unknown>): boolean => {
  if (entry.is_user === true || extra.inline_image !== false || !Array.isArray(extra.media)) return false;
  const first = extra.media[0];
  return isRecord(first) && first.source === "generated" && typeof first.generation_type === "number";
};

export function cleanWindowMessage(raw: unknown): CleanedMessage {
  if (!isRecord(raw)) return { keep: false, reason: "not a message" };
  if (raw.is_system === true) return { keep: false, reason: "hidden" };
  if (raw.gen_started && !raw.gen_finished) return { keep: false, reason: "in flight" };
  const extra = isRecord(raw.extra) ? raw.extra : {};
  if (typeof extra.type === "string" && ST_SYSTEM_TYPES.has(extra.type)) return { keep: false, reason: "system type" };
  if (isImagePost(raw, extra)) return { keep: false, reason: "image post" };
  const text = typeof raw.mes === "string" ? cleanMessageText(raw.mes) : "";
  if (!text) return { keep: false, reason: "empty" };
  if (raw.is_thoughts === true && raw.owner_extension === "st-stepped-thinking") return { keep: false, reason: "thoughts" };
  const isUser = raw.is_user === true;
  if (isUser && extra.model === "cyoa") return { keep: false, reason: "suggestions" };
  const speaker = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : isUser ? "User" : "Assistant";
  return { keep: true, text, isUser, speaker };
}
