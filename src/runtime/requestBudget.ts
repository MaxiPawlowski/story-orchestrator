import { countTokens, harnessContextLimit, harnessListed, listConnectionProfiles, profileExists, readProfileContextLimit, showConfirmPopup } from "@services/STAPI";
import { parseHarnessKey } from "@utils/harness";
import { createTokenMeter, defaultContextLimit, preflightMessage, preflightNeeded, type ContextLimit, type PassRole, type Preflight, type RequestBudget } from "@extraction/index";
import { resolvedProfileId, resolveRoute } from "./passProfiles";
import { getGlobalSettings } from "./settingsStore";

const HARNESS_OUTPUT_RESERVE = 4096;

const harnessContext = (harness: NonNullable<ReturnType<typeof parseHarnessKey>>): ContextLimit => {
  const options = Object.values(getGlobalSettings().extraction.routes ?? {}).find((entry) => entry?.route.harness === harness.harness && entry.route.model === harness.model)?.route.options;
  if (options?.maxInputTokens) return { value: options.maxInputTokens, source: "preset" };
  const context = harnessContextLimit(harness.harness, harness.model);
  return context ? { value: Math.max(1000, context - HARNESS_OUTPUT_RESERVE), source: "preset" } : defaultContextLimit("the harness plugin has not reported this model's context yet");
};

const contextLimitFor = (key: string | null): ContextLimit => {
  const harness = key ? parseHarnessKey(key) : null;
  return harness ? harnessContext(harness) : readProfileContextLimit(key);
};

export const requestBudget = (profileId: string | null): RequestBudget => ({
  contextLimit: contextLimitFor(profileId),
  meter: createTokenMeter(countTokens),
});

/** The route a role's passes go to, from the install-wide settings (a refused route names its dangling id). */
export const routedProfileId = (role: PassRole): string | null => resolvedProfileId(resolveRoute(getGlobalSettings().extraction, role, profileExists, harnessListed));

/** Each role's passes are budgeted against its own route's context limit. */
export const requestBudgetFor = (role: PassRole): RequestBudget => requestBudget(routedProfileId(role));

// The one popup a manual heavy pass shows before it sends anything. The counts are
// estimates (ST counts with the main API's tokenizer), which the copy says.
export async function confirmPreflight(preflight: Preflight, role: PassRole = "read"): Promise<boolean> {
  const profileId = routedProfileId(role);
  if (!preflightNeeded(preflight, contextLimitFor(profileId))) return true;
  const harness = profileId ? parseHarnessKey(profileId) : null;
  const profile = harness ? `${harness.harness} · ${harness.model}` : listConnectionProfiles().find((entry) => entry.id === profileId)?.name ?? "the memory model";
  return showConfirmPopup(preflightMessage(preflight, profile), { okButton: "Send", cancelButton: "Cancel" });
}
