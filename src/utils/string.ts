export interface NormalizeNameOptions {
  stripExtension?: boolean;
}

export function normalizeName(value: string | null | undefined, options?: NormalizeNameOptions): string {
  const normalized = (value ?? "").normalize("NFKC").trim().toLowerCase();
  if (!normalized) return "";
  return options?.stripExtension ? normalized.replace(/\.\w+$/, "") : normalized;
}

export function quoteSlashArg(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n")}"`;
}
