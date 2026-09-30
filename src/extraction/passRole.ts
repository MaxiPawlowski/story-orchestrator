export const PASS_ROLES = ["read", "synthesis", "authoring", "director", "curator", "inner"] as const;

export type PassRole = typeof PASS_ROLES[number];

export const PASS_ROLE_LABELS: Record<PassRole, string> = {
  read: "Story reads",
  synthesis: "Summaries and canon",
  authoring: "Wizard and road ahead",
  director: "Speaker direction",
  curator: "World Info curator",
  inner: "Inner voice",
};

export const isPassRole = (value: unknown): value is PassRole => typeof value === "string" && (PASS_ROLES as readonly string[]).includes(value);
