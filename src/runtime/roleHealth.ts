import { PASS_ROLES, PASS_ROLE_LABELS, type PassRole } from "@extraction/passRole";
import type { ExtractionHealth } from "@extraction/breaker";
import { resolvedProfileId, resolveRoute, type PassProfiles } from "./passProfiles";
import type { RoleSelfTestResult } from "./roleSelfTest";

export type RoleRouteState = "fallback" | "untested" | "ok" | "missing" | "not-configured" | "not-answering" | "failed";

export const ROLE_PROBLEM_STATES: ReadonlySet<RoleRouteState> = new Set(["missing", "not-configured", "not-answering", "failed"]);

export interface RoleRouteView {
  role: PassRole;
  label: string;
  profileId: string | null;
  state: RoleRouteState;
  detail: string;
}

export interface RoleRouteInput {
  settings: { profileId: string | null; profiles?: PassProfiles };
  exists: (profileId: string) => boolean;
  health: (profileId: string) => ExtractionHealth | null;
  selfTests: Partial<Record<PassRole, RoleSelfTestResult>>;
}

const routeOf = (input: RoleRouteInput, role: PassRole): RoleRouteView => {
  const label = PASS_ROLE_LABELS[role];
  const route = resolveRoute(input.settings, role, input.exists);
  if (!route.ok) return { role, label, profileId: route.profileId, state: "missing", detail: route.reason };
  if (route.source === "fallback") return { role, label, profileId: resolvedProfileId(route), state: "fallback", detail: "Same as memory model" };
  const profileId = resolvedProfileId(route) as string;
  const health = input.health(profileId);
  if (health?.kind === "config") return { role, label, profileId, state: "not-configured", detail: `${label}: ${health.detail}` };
  if (health?.kind === "transport") return { role, label, profileId, state: "not-answering", detail: `${label}: the profile is not answering (${health.detail})` };
  const selfTest = input.selfTests[role];
  if (!selfTest || selfTest.profileId !== profileId) return { role, label, profileId, state: "untested", detail: `${label}: not tested yet` };
  if (selfTest.status === "fail") return { role, label, profileId, state: "failed", detail: `${label} failed its self-test: ${selfTest.detail}` };
  return { role, label, profileId, state: "ok", detail: `${label}: ${selfTest.detail}` };
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

  attach(host: RoleHealthHost): () => void {
    this.host = host;
    return () => {
      if (this.host !== host) return;
      this.host = null;
      this.selfTests = {};
    };
  }

  record(result: RoleSelfTestResult): void {
    if (!this.host) return;
    this.selfTests = { ...this.selfTests, [result.role]: result };
    this.host.notify();
  }

  view(): RoleRouteView[] {
    const host = this.host;
    if (!host) return [];
    return buildRoleRoutes({ settings: host.settings(), exists: (id) => host.exists(id), health: (id) => host.health(id), selfTests: this.selfTests });
  }
}

export const roleHealth = new RoleHealth();
