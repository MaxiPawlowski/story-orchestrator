import { PASS_ROLES, PASS_ROLE_LABELS, type PassRole } from "@extraction/passRole";
import type { ExtractionHealth } from "@extraction/breaker";
import type { ReasoningEffort } from "@utils/reasoningEffort";
import type { RoleCallObservation } from "./modelCallCore";
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
  reasoning?: RoleReasoningView;
}

export interface RoleReasoningView {
  applied: boolean;
  collapsed: boolean;
  unsupported: string | null;
  chars: number;
  tokens: number | null;
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

const reasoningOf = (call: RoleCallObservation | undefined, profileId: string | null, effort: ReasoningEffort): RoleReasoningView | undefined => {
  if (call?.outcome !== "answered" || call.profileId !== profileId || call.effort !== effort || !call.meter) return undefined;
  const { applied, collapsed, unsupported, chars, tokens } = call.meter;
  return { applied, collapsed, unsupported, chars, tokens };
};

const routeOf = (input: RoleRouteInput, role: PassRole): RoleRouteView => {
  const label = PASS_ROLE_LABELS[role];
  const effort = roleEffort(input.settings, role);
  const route = resolveRoute(input.settings, role, input.exists);
  if (!route.ok) return { role, label, profileId: route.profileId, state: "missing", detail: route.reason, effort };
  const profileId = resolvedProfileId(route);
  const call = input.calls?.[role];
  const reasoning = reasoningOf(call, profileId, effort);
  const base = { role, label, profileId, effort, ...(reasoning ? { reasoning } : {}) };
  const health = profileId ? input.health(profileId) : null;
  if (route.source === "role" && health?.kind === "config") return { ...base, state: "not-configured", detail: `${label}: ${health.detail}` };
  if (route.source === "role" && health?.kind === "transport") return { ...base, state: "not-answering", detail: `${label}: the profile is not answering (${health.detail})` };
  if (call?.outcome === "reasoning-exhausted" && call.profileId === profileId && call.effort === effort) {
    return { ...base, state: "reasoning-exhausted", detail: reasoningExhaustedDetail(label) };
  }
  if (route.source === "fallback") return { ...base, state: "fallback", detail: "Same as memory model" };
  const selfTest = input.selfTests[role];
  if (!selfTest || selfTest.profileId !== profileId) return { ...base, state: "untested", detail: `${label}: not tested yet` };
  if (selfTest.status === "fail") return { ...base, state: "failed", detail: `${label} failed its self-test: ${selfTest.detail}` };
  return { ...base, state: "ok", detail: `${label}: ${selfTest.detail}` };
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
    if (previous?.outcome !== call.outcome || call.outcome === "reasoning-exhausted" || (call.meter && !previous)) this.host.notify();
  }

  view(): RoleRouteView[] {
    const host = this.host;
    if (!host) return [];
    return buildRoleRoutes({ settings: host.settings(), exists: (id) => host.exists(id), health: (id) => host.health(id), selfTests: this.selfTests, calls: this.calls });
  }
}

export const roleHealth = new RoleHealth();
