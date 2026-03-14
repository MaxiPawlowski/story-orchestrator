import { getContext } from "@services/STAPI";
import { extensionName } from "@constants/main";

export function getExtensionSettingsRoot(): StoryOrchestratorExtensionSettingsRoot {
  const { extensionSettings } = getContext();
  const root = extensionSettings[extensionName];
  if (root && typeof root === "object") {
    return root;
  }
  const created: StoryOrchestratorExtensionSettingsRoot = {};
  extensionSettings[extensionName] = created;
  return created;
}
