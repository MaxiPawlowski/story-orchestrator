import { usageKnown } from "@extraction/modelRoute";
import type { PassRole } from "@extraction/passRole";
import type { HarnessId } from "@utils/harness";
import type { ReasoningEffort } from "@utils/reasoningEffort";
import type { ModelCallRecord } from "./modelCallLog";
import { sanitizeRoleEntry, type RoleRouteEntry, type RoleRoutes } from "./passProfiles";

export const HARNESS_LABELS: Record<HarnessId, string> = { claude: "Claude Code", codex: "Codex", opencode: "opencode" };

export const harnessVendor = (harness: HarnessId, model: string): string => {
  if (harness === "claude") return "Anthropic";
  if (harness === "codex") return "OpenAI";
  const provider = model.split("/")[0];
  return provider === "openai" ? "OpenAI" : provider || "the model's provider";
};

const withEntry = (routes: RoleRoutes | undefined, role: PassRole, entry: RoleRouteEntry | null): RoleRoutes => {
  const rest = Object.fromEntries(Object.entries(routes ?? {}).filter(([key]) => key !== role)) as RoleRoutes;
  const kept = entry ? sanitizeRoleEntry(entry) : null;
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

export interface RouteMeter {
  route: string;
  calls: number;
  ok: number;
  failed: number;
  fallback: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  unknownUsage?: number;
}

export const routeMeters = (ring: readonly ModelCallRecord[]): RouteMeter[] => {
  const meters = new Map<string, RouteMeter>();
  for (const record of ring) {
    const meter = meters.get(record.route) ?? { route: record.route, calls: 0, ok: 0, failed: 0, fallback: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, unknownUsage: 0 };
    meter.calls += 1;
    if (record.result === "ok") meter.ok += 1;
    else if (record.result === "fallback") meter.fallback += 1;
    else meter.failed += 1;
    meter.inputTokens += record.usage?.input ?? 0;
    meter.outputTokens += record.usage?.output ?? 0;
    meter.costUsd += record.usage?.costUsd ?? 0;
    if (record.result === "ok" && !usageKnown(record.usage)) meter.unknownUsage = (meter.unknownUsage ?? 0) + 1;
    meters.set(record.route, meter);
  }
  return [...meters.values()];
};
