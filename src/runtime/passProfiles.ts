import { isPassRole, PASS_ROLE_LABELS, type PassRole } from "@extraction/passRole";
import type { RouteResolution } from "@extraction/modelRoute";
import { isReasoningEffort, sanitizeReasoningBudget, type ReasoningBudget, type ReasoningEffort } from "@utils/reasoningEffort";

// Which Connection Manager profile each family of passes asks. An unset role uses the memory model
// profile (the default for every role); a role set to a profile that no longer exists REFUSES, so a pass
// never answers from a model the author did not choose.

export type PassProfiles = Partial<Record<PassRole, string>>;

export interface RoleRouteOptions {
  effort: ReasoningEffort;
}

export type RoleRoutes = Partial<Record<PassRole, { route: { options: RoleRouteOptions } }>>;

export interface RouteSettings {
  profileId: string | null;
  profiles?: PassProfiles;
  routes?: RoleRoutes;
  reasoningBudget?: ReasoningBudget;
}

export function sanitizeRoleRoutes(value: unknown): RoleRoutes | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>).flatMap(([role, entry]): Array<[PassRole, { route: { options: RoleRouteOptions } }]> => {
    if (!isPassRole(role) || !entry || typeof entry !== "object") return [];
    const route = (entry as { route?: unknown }).route;
    const options = route && typeof route === "object" ? (route as { options?: unknown }).options : undefined;
    const effort = options && typeof options === "object" ? (options as { effort?: unknown }).effort : undefined;
    return isReasoningEffort(effort) && effort !== "default" ? [[role, { route: { options: { effort } } }]] : [];
  });
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export { sanitizeReasoningBudget };

export const roleEffort = (settings: Pick<RouteSettings, "routes">, role: PassRole): ReasoningEffort => settings.routes?.[role]?.route.options.effort ?? "default";

export const withRoleEffort = (routes: RoleRoutes | undefined, role: PassRole, effort: ReasoningEffort): RoleRoutes => {
  const rest = Object.fromEntries(Object.entries(routes ?? {}).filter(([key]) => key !== role)) as RoleRoutes;
  return effort === "default" ? rest : { ...rest, [role]: { route: { options: { effort } } } };
};

export function sanitizePassProfiles(value: unknown): PassProfiles | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [PassRole, string] => isPassRole(entry[0]) && typeof entry[1] === "string" && entry[1].trim().length > 0)
    .map(([role, id]) => [role, id.trim()] as const);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function resolveRoute(settings: RouteSettings, role: PassRole, exists: (profileId: string) => boolean): RouteResolution {
  const assigned = settings.profiles?.[role];
  const effort = roleEffort(settings, role);
  const withEffort = effort === "default" ? {} : { effort };
  if (!assigned) return { ok: true, route: settings.profileId ? { kind: "profile", profileId: settings.profileId, ...withEffort } : null, source: "fallback" };
  if (!exists(assigned)) return { ok: false, profileId: assigned, reason: `The profile chosen for ${PASS_ROLE_LABELS[role]} no longer exists (ID: ${assigned})` };
  return { ok: true, route: { kind: "profile", profileId: assigned, ...withEffort }, source: "role" };
}

export const resolvedProfileId = (resolution: RouteResolution): string | null =>
  resolution.ok ? resolution.route?.profileId ?? null : resolution.profileId;
