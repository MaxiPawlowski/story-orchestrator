import { getContext } from "@services/SillyTavernAPI";
import { extensionName } from "@constants/main";

export function getExtensionSettingsRoot(): Record<string, unknown> {
  const { extensionSettings } = getContext();
  const root = (extensionSettings as any)[extensionName];
  if (root && typeof root === "object") {
    return root as Record<string, unknown>;
  }
  const created: Record<string, unknown> = {};
  (extensionSettings as any)[extensionName] = created;
  return created;
}
