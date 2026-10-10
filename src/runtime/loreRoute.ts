import { harnessListed, listConnectionProfiles, profileExists } from "@services/STAPI";
import { createEligibility, routeModelKey, type CreateEligibility } from "@stagecraft/createEligibility";
import { resolveRoute } from "./passProfiles";
import { getGlobalSettings } from "./settingsStore";

export const loreRouteModel = (): string | null => {
  const resolved = resolveRoute(getGlobalSettings().extraction, "lore", profileExists, harnessListed);
  if (!resolved.ok || !resolved.route) return null;
  const route = resolved.route;
  if (route.kind === "harness") return routeModelKey({ kind: "harness", harness: route.harness, model: route.model });
  const profile = listConnectionProfiles().find((entry) => entry.id === route.profileId);
  return routeModelKey(profile ? { kind: "profile", ...(profile.source ? { source: profile.source } : {}), ...(profile.model ? { model: profile.model } : {}) } : null);
};

export const loreEligibility = (): CreateEligibility => createEligibility(loreRouteModel());
