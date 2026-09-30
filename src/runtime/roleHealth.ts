import { PASS_ROLES, PASS_ROLE_LABELS, type PassRole } from "@extraction/passRole";
import type { ExtractionHealth } from "@extraction/breaker";
import type { ReasoningEffort } from "@utils/reasoningEffort";
import type { ReasoningMeter } from "@services/STAPI";
import type { RoleCallObservation } from "./modelCallCore";
import type { RouteResolution } from "@extraction/modelRoute";
import { resolvedProfileId, resolveRoute, roleEffort, type RouteSettings } from "./passProfiles";
import type { RoleSelfTestResult } from "./roleSelfTest";

export type RoleRouteState = "fallback" | "untested" | "ok" | "missing" | "not-configured" | "not-answering" | "failed" | "reasoning-exhausted";

export const ROLE_PROBLEM_STATES: ReadonlySet<RoleRouteState> = new Set(["missing", "not-configured", "not-answering", "failed", "reasoning-exhausted"]);

export interface RoleRouteView {
  role: PassRole;
  label: string;
  profileId: string | null;
  state: RoleRouteState;
  detail: string;
  effort: ReasoningEffort;
  reasoning?: ReasoningMeter;
}

export interface RoleRouteInput {
  settings: RouteSettings;
  exists: (profileId: string) => boolean;
  health: (profileId: string) => ExtractionHealth | null;
  selfTests: Partial<Record<PassRole, RoleSelfTestResult>>;
  calls?: Partial<Record<PassRole, RoleCallObservation>>;
}

export const reasoningExhaustedDetail = (label: string): string =>
  `The model spent its whole budget thinking — lower the effort for ${label} or raise the budget.`;

const stateOf = (input: RoleRouteInput, role: PassRole, label: string, route: RouteResolution & { ok: true }, effort: ReasoningEffort): [RoleRouteState, string] => {
  const profileId = resolvedProfileId(route);
  const health = profileId && route.source === "role" ? input.health(profileId) : null;
  const call = input.calls?.[role];
  if (health?.kind === "config") return ["not-configured", `${label}: ${health.detail}`];
  if (health?.kind === "transport") return ["not-answering", `${label}: the profile is not answering (${health.detail})`];
  if (call?.outcome === "reasoning-exhausted" && call.profileId === profileId && call.effort === effort) return ["reasoning-exhausted", reasoningExhaustedDetail(label)];
  if (route.source === "fallback") return ["fallback", "Same as memory model"];
  const selfTest = input.selfTests[role];
  if (!selfTest || selfTest.profileId !== profileId) return ["untested", `${label}: not tested yet`];
  return selfTest.status === "fail" ? ["failed", `${label} failed its self-test: ${selfTest.detail}`] : ["ok", `${label}: ${selfTest.detail}`];
};

const routeOf = (input: RoleRouteInput, role: PassRole): RoleRouteView => {
  const label = PASS_ROLE_LABELS[role];
  const effort = roleEffort(input.settings, role);
  const route = resolveRoute(input.settings, role, input.exists);
  if (!route.ok) return { role, label, profileId: route.profileId, state: "missing", detail: route.reason, effort };
  const profileId = resolvedProfileId(route);
  const [state, detail] = stateOf(input, role, label, route, effort);
  const call = input.calls?.[role];
  const view: RoleRouteView = { role, label, profileId, state, detail, effort };
  if (call?.outcome === "answered" && call.meter && call.profileId === profileId && call.effort === effort) view.reasoning = call.meter;
  return view;
};

export const buildRoleRoutes = (input: RoleRouteInput): RoleRouteView[] => PASS_ROLES.map((role) => routeOf(input, role));

export interface RoleHealthHost {
  settings(): RoleRouteInput["settings"];
  exists(profileId: string): boolean;
  health(profileId: string): ExtractionHealth | null;
  notify(): void;
}

export class RoleHealth {
  private host: RoleHealthHost | null = null;
  private selfTests: Partial<Record<PassRole, RoleSelfTestResult>> = {};
  private calls: Partial<Record<PassRole, RoleCallObservation>> = {};

  attach(host: RoleHealthHost): () => void {
    this.host = host;
    return () => {
      if (this.host !== host) return;
      this.host = null;
      this.selfTests = {};
      this.calls = {};
    };
  }

  record(result: RoleSelfTestResult): void {
    if (!this.host) return;
    this.selfTests = { ...this.selfTests, [result.role]: result };
    this.host.notify();
  }

  noteCall(role: PassRole, call: RoleCallObservation): void {
    const previous = this.calls[role];
    this.calls = { ...this.calls, [role]: call };
    if (!this.host) return;
    if (previous?.outcome !== call.outcome || previous.effort !== call.effort) this.host.notify();
  }

  view(): RoleRouteView[] {
    const host = this.host;
    if (!host) return [];
    return buildRoleRoutes({ settings: host.settings(), exists: (id) => host.exists(id), health: (id) => host.health(id), selfTests: this.selfTests, calls: this.calls });
  }
}

export const roleHealth = new RoleHealth();
