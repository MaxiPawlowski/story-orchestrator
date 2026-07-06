import { isValidationErrorList, parseStoryV2, type ValidationError } from "@engine/index";
import type { StoryDraft } from "./draft";

export const exportDraft = (draft: StoryDraft): string => JSON.stringify(draft, null, 2);

export const importDraft = (text: string): StoryDraft | ValidationError[] => {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch {
    return [{ path: "$", message: "file is not valid JSON" }];
  }
  const validated = parseStoryV2(parsedJson);
  if (isValidationErrorList(validated)) return validated;
  return parsedJson as StoryDraft;
};

const sortValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortValue((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
};

export const canonicalize = (value: unknown): string => JSON.stringify(sortValue(value));
