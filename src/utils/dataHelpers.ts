export const trimStringList = (values?: Iterable<unknown>): string[] => {
  const result: string[] = [];
  for (const value of values ?? []) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed) result.push(trimmed);
  }
  return result;
};

