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
