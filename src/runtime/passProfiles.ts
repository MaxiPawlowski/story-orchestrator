import { isPassRole, PASS_ROLE_LABELS, type PassRole } from "@extraction/passRole";
import type { RouteResolution } from "@extraction/modelRoute";

// Which Connection Manager profile each family of passes asks. An unset role uses the memory model
// profile (the default for every role); a role set to a profile that no longer exists REFUSES, so a pass
// never answers from a model the author did not choose.

export type PassProfiles = Partial<Record<PassRole, string>>;

export interface RouteSettings {
  profileId: string | null;
  profiles?: PassProfiles;
}

export function sanitizePassProfiles(value: unknown): PassProfiles | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [PassRole, string] => isPassRole(entry[0]) && typeof entry[1] === "string" && entry[1].trim().length > 0)
    .map(([role, id]) => [role, id.trim()] as const);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function resolveRoute(settings: RouteSettings, role: PassRole, exists: (profileId: string) => boolean): RouteResolution {
  const assigned = settings.profiles?.[role];
  if (!assigned) return { ok: true, route: settings.profileId ? { kind: "profile", profileId: settings.profileId } : null, source: "fallback" };
  if (!exists(assigned)) return { ok: false, profileId: assigned, reason: `The profile chosen for ${PASS_ROLE_LABELS[role]} no longer exists (ID: ${assigned})` };
  return { ok: true, route: { kind: "profile", profileId: assigned }, source: "role" };
}

export const resolvedProfileId = (resolution: RouteResolution): string | null =>
  resolution.ok ? resolution.route?.profileId ?? null : resolution.profileId;
