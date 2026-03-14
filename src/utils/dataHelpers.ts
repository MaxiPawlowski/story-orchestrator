export const cloneStructured = <T,>(value: T): T => {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value)) as T;
};

export const isNonArrayObject = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object" && value !== null && !Array.isArray(value)
);

export const trimStringList = (values?: Iterable<unknown>): string[] => {
  const result: string[] = [];
  for (const value of values ?? []) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed) result.push(trimmed);
  }
  return result;
};

export const trimStringRecord = <K extends string,>(
  input?: Partial<Record<K, unknown>>,
): Partial<Record<K, string>> | undefined => {
  if (!input) return undefined;
  const result: Partial<Record<K, string>> = {};
  for (const [key, value] of Object.entries(input) as [K, unknown][]) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed) result[key] = trimmed;
  }
  return Object.keys(result).length ? result : undefined;
};
