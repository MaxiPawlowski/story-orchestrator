import { countTokens, listConnectionProfiles, profileExists, readProfileContextLimit, showConfirmPopup } from "@services/STAPI";
import { createTokenMeter, preflightMessage, preflightNeeded, type PassRole, type Preflight, type RequestBudget } from "@extraction/index";
import { resolvedProfileId, resolveRoute } from "./passProfiles";
import { getGlobalSettings } from "./settingsStore";

export const requestBudget = (profileId: string | null): RequestBudget => ({
  contextLimit: readProfileContextLimit(profileId),
  meter: createTokenMeter(countTokens),
});

/** The profile a role's passes go to, from the install-wide settings (a refused route names its dangling id). */
export const routedProfileId = (role: PassRole): string | null => resolvedProfileId(resolveRoute(getGlobalSettings().extraction, role, profileExists));

/** Each role's passes are budgeted against its own profile's context limit. */
export const requestBudgetFor = (role: PassRole): RequestBudget => requestBudget(routedProfileId(role));

// The one popup a manual heavy pass shows before it sends anything. The counts are
// estimates (ST counts with the main API's tokenizer), which the copy says.
export async function confirmPreflight(preflight: Preflight, role: PassRole = "read"): Promise<boolean> {
  const profileId = routedProfileId(role);
  if (!preflightNeeded(preflight, readProfileContextLimit(profileId))) return true;
  const profile = listConnectionProfiles().find((entry) => entry.id === profileId)?.name ?? "the memory model";
  return showConfirmPopup(preflightMessage(preflight, profile), { okButton: "Send", cancelButton: "Cancel" });
}
