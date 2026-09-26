import { type PrimitiveValue, type ValidationError } from "../schema";
import { nearestKey } from "@utils/levenshtein";

export const isPrimitive = (value: unknown): value is PrimitiveValue => {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
};

export const addError = (errors: ValidationError[], path: string, message: string) => {
  errors.push({ path, message });
};

export const asString = (value: unknown): string | null => typeof value === "string" && value.trim() ? value : null;

export const isOneOf = <T extends readonly string[]>(value: unknown, values: T): value is T[number] => {
  return typeof value === "string" && (values as readonly string[]).includes(value);
};

// v2.5 plan 11: one authoring vocabulary. A key the object does not know is an error with the key it
// most likely meant, so a typo or a removed alias never silently requires (or scopes) nothing.
export const rejectUnknownKeys = (value: Record<string, unknown>, known: readonly string[], path: string, errors: ValidationError[]) => {
  for (const key of Object.keys(value).filter((candidate) => !known.includes(candidate))) {
    const hint = nearestKey(key, known);
    addError(errors, `${path}.${key}`, hint ? `unknown key (did you mean "${hint}"?)` : `unknown key (known: ${known.join(", ")})`);
  }
};
