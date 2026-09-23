export interface NormalizeNameOptions {
  stripExtension?: boolean;
}

export function normalizeName(value: string | null | undefined, options?: NormalizeNameOptions): string {
  const normalized = (value ?? "").normalize("NFKC").trim().toLowerCase();
  if (!normalized) return "";
  return options?.stripExtension ? normalized.replace(/\.\w+$/, "") : normalized;
}

// Encodes for ST's STRICT_ESCAPING parser mode, which `stHost/slashCommands.ts` pins on every run:
// inside quotes only `"` is a delimiter, and backslashes collapse in pairs only right before one
// (SlashCommandParser.js:583-624, 1235-1245). Braces are escaped so macros reach the command as
// written; the closure unescapes `\{`/`\}` after its macro pass (SlashCommandClosure.js:586-600).
export function quoteSlashArg(s: string): string {
  const escaped = s
    .replace(/[{}]/g, "\\$&")
    .replace(/(\\*)"/g, '$1$1\\"')
    .replace(/(\\+)$/, "$1$1");
  return `"${escaped}"`;
}

// The host's `world_names` lists lorebooks by file id, and the server files a book under
// `sanitize(name + ".json")` (src/endpoints/worldinfo.js:151): a title with `:` or `?` is listed
// under a different name than the one it was saved with. This mirrors that sanitisation so code can
// map a display name to the id every WI call and `world_names` entry actually addresses.
const ILLEGAL_FILE_CHARS = new Set([..."/?<>\\:*|\""]);
const isControlChar = (char: string) => {
  const code = char.charCodeAt(0);
  return code <= 0x1f || (code >= 0x80 && code <= 0x9f);
};
export const lorebookFileId = (name: string): string => [...name.trim()].filter((char) => !ILLEGAL_FILE_CHARS.has(char) && !isControlChar(char)).join("");
