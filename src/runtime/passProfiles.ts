import { isPassRole, PASS_ROLES, PASS_ROLE_LABELS, type PassRole } from "@extraction/passRole";
import { isRecord } from "@utils/guards";
import { routeKey, type ModelRoute, type RouteResolution } from "@extraction/modelRoute";
import { HARNESS_LABELS, harnessKey, isHarnessId, type HarnessId } from "@utils/harness";
import { isReasoningEffort, type ReasoningBudget, type ReasoningEffort } from "@utils/reasoningEffort";

// Which Connection Manager profile (or, since v2.6 plan 04 H, which CLI harness) each family of passes
// asks. An unset role uses the memory model profile; a role set to a profile that no longer exists, or to a
// harness model the plugin does not offer, REFUSES, so a pass never answers from a model the author did not choose.

export type PassProfiles = Partial<Record<PassRole, string>>;

export interface RoleRouteOptions {
  effort?: ReasoningEffort;
  maxInputTokens?: number;
  timeoutScale?: number;
}

export interface RoleRouteEntry {
  route: { kind?: "harness"; harness?: HarnessId; model?: string; options: RoleRouteOptions };
  onFailure?: { profileId: string };
}

export type RoleRoutes = Partial<Record<PassRole, RoleRouteEntry>>;

export interface RouteSettings {
  profileId: string | null;
  profiles?: PassProfiles;
  routes?: RoleRoutes;
  reasoningBudget?: ReasoningBudget;
}

export type HarnessListed = (harness: HarnessId, model: string) => boolean | null;

const MODEL_ID = /^[A-Za-z0-9._:/-]{1,80}$/;
const bounded = (value: unknown, min: number, max: number): number | undefined =>
  (typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : undefined);

const sanitizeEntry = (value: unknown): RoleRouteEntry | null => {
  const route = isRecord(value) && isRecord(value.route) ? value.route : null;
  const options = route && isRecord(route.options) ? route.options : {};
  const kept: RoleRouteOptions = {};
  if (isReasoningEffort(options.effort) && options.effort !== "default") kept.effort = options.effort;
  const maxInputTokens = bounded(options.maxInputTokens, 1000, 2_000_000);
  const timeoutScale = bounded(options.timeoutScale, 0.25, 10);
  if (maxInputTokens !== undefined) kept.maxInputTokens = Math.round(maxInputTokens);
  if (timeoutScale !== undefined) kept.timeoutScale = timeoutScale;
  const harness = route?.kind === "harness" && isHarnessId(route.harness) && typeof route.model === "string" && MODEL_ID.test(route.model)
    ? { kind: "harness" as const, harness: route.harness, model: route.model } : null;
  const onFailure = isRecord(value) && isRecord(value.onFailure) ? value.onFailure.profileId : null;
  const fallback = typeof onFailure === "string" && onFailure.trim() ? { profileId: onFailure.trim() } : null;
  if (!harness && !Object.keys(kept).length) return null;
  return { route: { ...harness, options: kept }, ...(harness && fallback ? { onFailure: fallback } : {}) };
};

export function sanitizeRoleRoutes(value: unknown): RoleRoutes | undefined {
  const routes = PASS_ROLES.reduce<RoleRoutes>((kept, role) => {
    const entry = sanitizeEntry(isRecord(value) ? value[role] : null);
    return entry ? Object.assign(kept, { [role]: entry }) : kept;
  }, {});
  return Object.keys(routes).length ? routes : undefined;
}

export const roleEffort = (settings: Pick<RouteSettings, "routes">, role: PassRole): ReasoningEffort => settings.routes?.[role]?.route.options.effort ?? "default";

const withEntry = (routes: RoleRoutes | undefined, role: PassRole, entry: RoleRouteEntry | null): RoleRoutes => {
  const rest = Object.fromEntries(Object.entries(routes ?? {}).filter(([key]) => key !== role)) as RoleRoutes;
  const kept = entry ? sanitizeEntry(entry) : null;
  return kept ? Object.assign(rest, { [role]: kept }) : rest;
};

export const withRoleEffort = (routes: RoleRoutes | undefined, role: PassRole, effort: ReasoningEffort): RoleRoutes => {
  const current = routes?.[role];
  return withEntry(routes, role, { ...current, route: { ...current?.route, options: { ...current?.route.options, effort } } });
};

/** A role routed to a harness, or back to its profile (null). The effort stays with the role; the fallback only with a harness. */
export const withRoleHarness = (routes: RoleRoutes | undefined, role: PassRole, harness: { harness: HarnessId; model: string } | null): RoleRoutes => {
  const current = routes?.[role];
  const options = current?.route.options ?? {};
  return withEntry(routes, role, harness ? { ...current, route: { kind: "harness", ...harness, options } } : { route: { options } });
};

export const withRoleFallback = (routes: RoleRoutes | undefined, role: PassRole, profileId: string | null): RoleRoutes => {
  const current = routes?.[role];
  if (!current) return routes ?? {};
  return withEntry(routes, role, profileId ? { ...current, onFailure: { profileId } } : { route: current.route });
};

export const roleHarness = (settings: Pick<RouteSettings, "routes">, role: PassRole): { harness: HarnessId; model: string } | null => {
  const route = settings.routes?.[role]?.route;
  return route?.kind === "harness" && route.harness && route.model ? { harness: route.harness, model: route.model } : null;
};

export function sanitizePassProfiles(value: unknown): PassProfiles | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [PassRole, string] => isPassRole(entry[0]) && typeof entry[1] === "string" && entry[1].trim().length > 0)
    .map(([role, id]) => [role, id.trim()] as const);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function resolveRoute(settings: RouteSettings, role: PassRole, exists: (profileId: string) => boolean, listed: HarnessListed = () => null): RouteResolution {
  const effort = roleEffort(settings, role);
  const withEffort = <T extends ModelRoute>(route: T): T => (effort === "default" ? route : { ...route, effort });
  const harness = roleHarness(settings, role);
  if (harness) {
    if (listed(harness.harness, harness.model) === false) {
      return { ok: false, profileId: harnessKey(harness.harness, harness.model), reason: `${HARNESS_LABELS[harness.harness]} does not offer ${harness.model} for ${PASS_ROLE_LABELS[role]} on this install` };
    }
    const { maxInputTokens, timeoutScale } = settings.routes?.[role]?.route.options ?? {};
    const options = { ...(maxInputTokens ? { maxInputTokens } : {}), ...(timeoutScale ? { timeoutScale } : {}) };
    return { ok: true, route: withEffort({ kind: "harness", ...harness, ...(Object.keys(options).length ? { options } : {}) }), source: "role" };
  }
  const assigned = settings.profiles?.[role];
  const route = (profileId: string): ModelRoute => withEffort({ kind: "profile", profileId });
  if (!assigned) return { ok: true, route: settings.profileId ? route(settings.profileId) : null, source: "fallback" };
  if (!exists(assigned)) return { ok: false, profileId: assigned, reason: `The profile chosen for ${PASS_ROLE_LABELS[role]} no longer exists (ID: ${assigned})` };
  return { ok: true, route: route(assigned), source: "role" };
}

/** The author's own fallback for a harness route: a profile, only when set and still present. */
export const fallbackRoute = (settings: RouteSettings, role: PassRole, exists: (profileId: string) => boolean): ModelRoute | null => {
  const profileId = roleHarness(settings, role) ? settings.routes?.[role]?.onFailure?.profileId : undefined;
  if (!profileId || !exists(profileId)) return null;
  const effort = roleEffort(settings, role);
  return effort === "default" ? { kind: "profile", profileId } : { kind: "profile", profileId, effort };
};

/** A role's route key: its profile id, or `harness:<name>:<model>`. The breaker, health and the call ring key on it. */
export const resolvedProfileId = (resolution: RouteResolution): string | null =>
  (resolution.ok ? (resolution.route ? routeKey(resolution.route) : null) : resolution.profileId);
