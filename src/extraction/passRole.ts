export const PASS_ROLES = ["read", "synthesis", "authoring", "director", "curator", "inner", "lore", "polish"] as const;

export type PassRole = typeof PASS_ROLES[number];

export const PASS_ROLE_LABELS: Record<PassRole, string> = {
  read: "Story reads",
  synthesis: "Summaries and canon",
  authoring: "Wizard and road ahead",
  director: "Speaker direction",
  curator: "World Info curator",
  inner: "Inner voice",
  lore: "Lore creation",
  polish: "Reply polish",
};

export const ROLE_INHERITS: Partial<Record<PassRole, PassRole>> = { lore: "curator" };

export const OWN_ROUTE_ROLES: ReadonlySet<PassRole> = new Set(["polish"]);

export const roleDefaultLabel = (role: PassRole): string => {
  if (OWN_ROUTE_ROLES.has(role)) return "Off until set";
  const from = ROLE_INHERITS[role];
  return from ? `Same as ${PASS_ROLE_LABELS[from]}` : "Same as memory model";
};

export const isPassRole = (value: unknown): value is PassRole => typeof value === "string" && (PASS_ROLES as readonly string[]).includes(value);
