export const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const required = <T>(value: T | null | undefined, what: string): T => {
  if (value === null || value === undefined) throw new TypeError(`${what} is missing`);
  return value;
};
