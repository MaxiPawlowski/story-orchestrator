const PLACEHOLDERS = new Set(["unknown", "none", "n/a", "na", "nil", "null", "undefined", "unclear", "unspecified", "not specified", "not stated",
  "not mentioned", "not described", "not known", "no description", "same", "same as before", "unchanged", "no change", "nothing", "?"]);

export const isCardPlaceholder = (value: string): boolean => PLACEHOLDERS.has(value.trim().toLowerCase().replace(/^["'(]+|["').!]+$/g, "").trim());
