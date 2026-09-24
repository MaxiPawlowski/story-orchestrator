import { countTokens, listConnectionProfiles, readProfileContextLimit, showConfirmPopup } from "@services/STAPI";
import { createTokenMeter, preflightMessage, preflightNeeded, type Preflight, type RequestBudget } from "@extraction/index";
import { getGlobalSettings } from "./settingsStore";

export const requestBudget = (profileId: string | null): RequestBudget => ({
  contextLimit: readProfileContextLimit(profileId),
  meter: createTokenMeter(countTokens),
});

// v2.4 plan 03 D5: the one popup a manual heavy pass shows before it sends anything. The counts are
// estimates (ST counts with the main API's tokenizer, 03-H11), which the copy says.
export async function confirmPreflight(preflight: Preflight): Promise<boolean> {
  const profileId = getGlobalSettings().extraction.profileId;
  if (!preflightNeeded(preflight, readProfileContextLimit(profileId))) return true;
  const profile = listConnectionProfiles().find((entry) => entry.id === profileId)?.name ?? "the memory model";
  return showConfirmPopup(preflightMessage(preflight, profile), { okButton: "Send", cancelButton: "Cancel" });
}
