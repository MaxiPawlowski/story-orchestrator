import { isPassRole, PASS_ROLES, PASS_ROLE_LABELS, ROLE_INHERITS, type PassRole } from "@extraction/passRole";
import { isRecord } from "@utils/guards";
import { routeKey, type ModelRoute, type RouteResolution } from "@extraction/modelRoute";
import { harnessKey, isHarnessId, type HarnessId } from "@utils/harness";
import { isReasoningEffort, type ReasoningBudget, type ReasoningEffort } from "@utils/reasoningEffort";

// Which Connection Manager profile each family of passes asks. An unset role uses the memory model
// profile (the default for every role but authoring, which takes opencode openai/gpt-6.1-sol when the harness
// plugin offers it with its tool bridge, else the install's first DeepSeek Chat Completion profile); a role set
// to a profile that no longer exists REFUSES, so a pass never answers from a model the author did not choose.

export type PassProfiles = Partial<Record<PassRole, string>>;

export interface RoleRouteOptions {
  effort?: ReasoningEffort;
  timeoutScale?: number;
}

export interface RoleRouteEntry {
  route: { kind?: "harness"; harness?: HarnessId; model?: string; options: RoleRouteOptions };
  onFailure?: { profileId: string };
}

export type RoleRoutes = Partial<Record<PassRole, RoleRouteEntry>>;

export interface RouteSettings {
  profileId: string | null;
  fallbackProfileId?: string | null;
  profiles?: PassProfiles;
  routes?: RoleRoutes;
  reasoningBudget?: ReasoningBudget;
}

export type HarnessListed = (harness: HarnessId, model: string) => boolean | null;

const inRange = (value: unknown, min: number, max: number): value is number => typeof value === "number" && value >= min && value <= max;

export const sanitizeRoleEntry = (value: unknown): RoleRouteEntry | null => {
  const route = isRecord(value) && isRecord(value.route) ? value.route : {};
  const raw = isRecord(route.options) ? route.options : {};
  const options: RoleRouteOptions = {};
  if (isReasoningEffort(raw.effort) && raw.effort !== "default") options.effort = raw.effort;
  if (inRange(raw.timeoutScale, 0.25, 10)) options.timeoutScale = raw.timeoutScale;
  const harness = route.kind === "harness" && isHarnessId(route.harness) && typeof route.model === "string" && /^[\w.:/-]{1,80}$/.test(route.model);
  const fallback = harness && isRecord(value) && isRecord(value.onFailure) && typeof value.onFailure.profileId === "string" ? value.onFailure.profileId.trim() : "";
  if (!harness) return Object.keys(options).length ? { route: { options } } : null;
  return { route: { kind: "harness", harness: route.harness as HarnessId, model: route.model as string, options }, ...(fallback ? { onFailure: { profileId: fallback } } : {}) };
};

export function sanitizeRoleRoutes(value: unknown): RoleRoutes | undefined {
  const routes = PASS_ROLES.reduce<RoleRoutes>((kept, role) => {
    const entry = sanitizeRoleEntry(isRecord(value) ? value[role] : null);
    return entry ? Object.assign(kept, { [role]: entry }) : kept;
  }, {});
  return Object.keys(routes).length ? routes : undefined;
}

const entryOf = (settings: Pick<RouteSettings, "routes">, role: PassRole): RoleRouteEntry | undefined => (settings.routes || {})[role];

export const roleEffort = (settings: Pick<RouteSettings, "routes">, role: PassRole): ReasoningEffort => {
  const entry = entryOf(settings, role);
  return (entry && entry.route.options.effort) || "default";
};

export const roleHarness = (settings: Pick<RouteSettings, "routes">, role: PassRole): { harness: HarnessId; model: string } | null => {
  const entry = entryOf(settings, role);
  const route = entry && entry.route;
  return route && route.kind === "harness" && route.harness && route.model ? { harness: route.harness, model: route.model } : null;
};

export function sanitizePassProfiles(value: unknown): PassProfiles | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [PassRole, string] => isPassRole(entry[0]) && typeof entry[1] === "string" && entry[1].trim().length > 0)
    .map(([role, id]) => [role, id.trim()] as const);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export const AUTHORING_DEFAULT_SOURCES: readonly string[] = ["deepseek"];

export const AUTHORING_DEFAULT_HARNESS: { harness: HarnessId; model: string } = { harness: "opencode", model: "openai/gpt-6.1-sol" };

export interface ProfileSourceRow { id: string; kind?: string; source?: string }

export type DefaultCandidate = { kind: "profile"; profileId: string } | { kind: "harness"; harness: HarnessId; model: string };

export type RoleDefault = (role: PassRole) => DefaultCandidate[];

export type HarnessOffered = (harness: HarnessId, model: string) => boolean;

export const isAuthoringDefaultSource = (profile: ProfileSourceRow | undefined): boolean =>
  Boolean(profile && profile.kind === "chat" && profile.source && AUTHORING_DEFAULT_SOURCES.includes(profile.source));

export const roleDefaultFrom = (profiles: ProfileSourceRow[], offered: HarnessOffered = () => false): RoleDefault => (role) => {
  if (role !== "authoring") return [];
  const harness: DefaultCandidate[] = offered(AUTHORING_DEFAULT_HARNESS.harness, AUTHORING_DEFAULT_HARNESS.model) ? [{ kind: "harness", ...AUTHORING_DEFAULT_HARNESS }] : [];
  const profile = profiles.find(isAuthoringDefaultSource);
  return profile ? [...harness, { kind: "profile", profileId: profile.id }] : harness;
};

let installDefault: RoleDefault | null = null;

export const setRoleDefault = (next: RoleDefault | null): void => {
  installDefault = next;
};

const usable = (exists: (profileId: string) => boolean) => (candidate: DefaultCandidate): boolean => candidate.kind === "harness" || exists(candidate.profileId);

export const defaultFallbackRoute = (settings: RouteSettings, role: PassRole, exists: (profileId: string) => boolean, defaults: RoleDefault | null = installDefault): ModelRoute | null => {
  if (settings.profiles?.[role] || roleHarness(settings, role)) return null;
  const candidates = defaults?.(role) ?? [];
  if (!candidates.some((candidate) => candidate.kind === "harness")) return null;
  const profile = candidates.find((candidate): candidate is DefaultCandidate & { kind: "profile" } => candidate.kind === "profile" && exists(candidate.profileId));
  const profileId = profile ? profile.profileId : settings.profileId && exists(settings.profileId) ? settings.profileId : null;
  if (!profileId) return null;
  const effort = roleEffort(settings, role);
  return effort === "default" ? { kind: "profile", profileId } : { kind: "profile", profileId, effort };
};

export function resolveRoute(settings: RouteSettings, role: PassRole, exists: (profileId: string) => boolean, listed?: HarnessListed, defaults: RoleDefault | null = installDefault): RouteResolution {
  const effort = roleEffort(settings, role);
  const withEffort = (route: ModelRoute): ModelRoute => (effort === "default" ? route : { ...route, effort });
  const harness = roleHarness(settings, role);
  if (harness) {
    const key = harnessKey(harness.harness, harness.model);
    if (listed && listed(harness.harness, harness.model) === false) return { ok: false, profileId: key, reason: `${key} is not offered for ${PASS_ROLE_LABELS[role]} on this install` };
    return { ok: true, route: withEffort({ kind: "harness", harness: harness.harness, model: harness.model, options: (entryOf(settings, role) as RoleRouteEntry).route.options }), source: "role" };
  }
  const assigned = settings.profiles?.[role];
  const route = (profileId: string): ModelRoute => withEffort({ kind: "profile", profileId });
  const preferred = assigned ? undefined : (defaults?.(role) ?? []).find(usable(exists));
  if (preferred?.kind === "profile") return { ok: true, route: route(preferred.profileId), source: "default" };
  const options = entryOf(settings, role)?.route.options ?? {};
  if (preferred) return { ok: true, route: withEffort({ kind: "harness", harness: preferred.harness, model: preferred.model, options }), source: "default" };
  const inherits = ROLE_INHERITS[role];
  if (!assigned && inherits) {
    const inherited = resolveRoute(settings, inherits, exists, listed, defaults);
    return inherited.ok ? { ...inherited, source: "fallback" } : inherited;
  }
  if (!assigned) return { ok: true, route: settings.profileId ? route(settings.profileId) : null, source: "fallback" };
  if (!exists(assigned)) return { ok: false, profileId: assigned, reason: `The profile chosen for ${PASS_ROLE_LABELS[role]} no longer exists (ID: ${assigned})` };
  return { ok: true, route: route(assigned), source: "role" };
}

export const resolvedProfileId = (resolution: RouteResolution): string | null =>
  (resolution.ok ? (resolution.route ? routeKey(resolution.route) : null) : resolution.profileId);
