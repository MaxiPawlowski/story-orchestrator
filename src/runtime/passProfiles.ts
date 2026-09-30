import { isPassRole, PASS_ROLES, PASS_ROLE_LABELS, type PassRole } from "@extraction/passRole";
import { isRecord } from "@utils/guards";
import type { ModelRoute, RouteResolution } from "@extraction/modelRoute";
import { isReasoningEffort, type ReasoningBudget, type ReasoningEffort } from "@utils/reasoningEffort";

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

const effortAt = (value: unknown, role: PassRole): unknown => {
  const entry = isRecord(value) ? value[role] : null;
  const route = isRecord(entry) ? entry.route : null;
  return isRecord(route) && isRecord(route.options) ? route.options.effort : undefined;
};

export function sanitizeRoleRoutes(value: unknown): RoleRoutes | undefined {
  const routes = PASS_ROLES.reduce<RoleRoutes>((kept, role) => {
    const effort = effortAt(value, role);
    return isReasoningEffort(effort) ? withRoleEffort(kept, role, effort) : kept;
  }, {});
  return Object.keys(routes).length ? routes : undefined;
}

export const roleEffort = (settings: Pick<RouteSettings, "routes">, role: PassRole): ReasoningEffort => settings.routes?.[role]?.route.options.effort ?? "default";

export const withRoleEffort = (routes: RoleRoutes | undefined, role: PassRole, effort: ReasoningEffort): RoleRoutes => {
  const rest = Object.fromEntries(Object.entries(routes ?? {}).filter(([key]) => key !== role)) as RoleRoutes;
  return effort === "default" ? rest : Object.assign(rest, { [role]: { route: { options: { effort } } } });
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
  const route = (profileId: string): ModelRoute => (effort === "default" ? { kind: "profile", profileId } : { kind: "profile", profileId, effort });
  if (!assigned) return { ok: true, route: settings.profileId ? route(settings.profileId) : null, source: "fallback" };
  if (!exists(assigned)) return { ok: false, profileId: assigned, reason: `The profile chosen for ${PASS_ROLE_LABELS[role]} no longer exists (ID: ${assigned})` };
  return { ok: true, route: route(assigned), source: "role" };
}

export const resolvedProfileId = (resolution: RouteResolution): string | null =>
  resolution.ok ? resolution.route?.profileId ?? null : resolution.profileId;
