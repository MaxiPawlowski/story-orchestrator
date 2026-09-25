import { isPassRole, PASS_ROLE_LABELS, type PassRole } from "@extraction/passRole";

// v2.4 plan 08 T18. Which Connection Manager profile each family of passes asks. An unset role uses the
// memory model profile (today's behaviour, the default for every role); a role set to a profile that no
// longer exists REFUSES, so a pass never answers from a model the author did not choose.

export type PassProfiles = Partial<Record<PassRole, string>>;

export type ProfileRoute = { ok: true; profileId: string | null; source: "role" | "fallback" } | { ok: false; profileId: string; reason: string };

export function sanitizePassProfiles(value: unknown): PassProfiles | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [PassRole, string] => isPassRole(entry[0]) && typeof entry[1] === "string" && entry[1].trim().length > 0)
    .map(([role, id]) => [role, id.trim()] as const);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function resolveProfile(settings: { profileId: string | null; profiles?: PassProfiles }, role: PassRole, exists: (profileId: string) => boolean): ProfileRoute {
  const assigned = settings.profiles?.[role];
  if (!assigned) return { ok: true, profileId: settings.profileId, source: "fallback" };
  if (!exists(assigned)) return { ok: false, profileId: assigned, reason: `The profile chosen for ${PASS_ROLE_LABELS[role]} no longer exists (ID: ${assigned})` };
  return { ok: true, profileId: assigned, source: "role" };
}
