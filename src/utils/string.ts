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

// The host's `world_names` lists lorebooks by file id: the server files a book under
// `sanitize(name + ".json")` (src/endpoints/worldinfo.js:24, :87, :151; sanitize-filename index.js:30-49: illegal and control
// characters, reserved names and trailing dots/spaces of the whole file name removed, then a 255-byte UTF-8 cap) and lists the
// `.json` files by `path.parse(file).name` (src/endpoints/settings.js:255-257). The name is not trimmed: ".json" follows it.
const ILLEGAL_FILE_CHARS = /[/?<>\\:*|"]/g;
const CONTROL_CHARS = /[\x00-\x1f\x80-\x9f]/g;
const RESERVED_FILE = /^\.+$/;
const WINDOWS_RESERVED_FILE = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
const TRAILING_FILE = /[. ]+$/;
const FILE_NAME_BYTES = 255;
const utf8Bytes = (char: string): number => {
  const code = char.codePointAt(0) ?? 0;
  return code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
};
const capUtf8 = (text: string, bytes: number): string => {
  let out = "";
  let used = 0;
  for (const char of text) {
    used += utf8Bytes(char);
    if (used > bytes) break;
    out += char;
  }
  return out;
};
export const lorebookFileId = (name: string): string => {
  const file = capUtf8(`${name}.json`.replace(ILLEGAL_FILE_CHARS, "").replace(CONTROL_CHARS, "").replace(RESERVED_FILE, "")
    .replace(WINDOWS_RESERVED_FILE, "").replace(TRAILING_FILE, ""), FILE_NAME_BYTES);
  return file.toLowerCase().endsWith(".json") ? file.slice(0, -".json".length) : file;
};

export const runsAsCommand = (text: string): boolean => /^\s*\//.test(text);

export const clipText = (value: string, limit: number): string => {
  const cut = value.slice(0, Math.max(0, limit));
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
};

export const truncate = (value: string, limit: number) => (value.length > limit ? `${clipText(value, limit)}…` : value);
