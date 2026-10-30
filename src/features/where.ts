import type { StoryFeatureId } from "@engine/featurePolicy";
import type { WorkspaceIntent } from "@runtime/workspaceNavigation";
import { FEATURE_INSTALL_HOMES, featureOfControl, settingIntent, workspaceCrumb } from "@runtime/workspaceRoutes";
import type { FeatureWhere } from "./registry";

const placed = (selector: string, leaf: string, surface: FeatureWhere["surface"], workspace: WorkspaceIntent): FeatureWhere =>
  ({ selector, label: workspaceCrumb(workspace, leaf), surface, workspace });

export const settingsAt = (selector: string, label: string): FeatureWhere =>
  placed(selector, label, "settings", settingIntent(selector.replace(/^#/, "")));
const PLAY_TARGETS = /so-player-overview|so-player-promises|so-memory-search|so-carry-|so-living-save|so-your-character|so-image-chat|so-open-(suggestions|journal|widgets|stat)/;

export const drawerAt = (selector: string, label: string): FeatureWhere => {
  const control = selector.replace(/^#/, "");
  const feature = featureOfControl(control);
  return placed(selector, label, "drawer", feature ? { context: "story", page: "features", feature, control }
    : { context: "story", page: PLAY_TARGETS.test(selector) ? "play" : "author", control });
};
export const featureAt = (feature: StoryFeatureId, control: string, label: string): FeatureWhere =>
  placed(`#so-feature-${feature}-${control}`, label, "drawer", { context: "story", page: "features", feature, control: `so-feature-${feature}-${control}` });
export const defaultsWhere = (where: FeatureWhere): FeatureWhere => {
  const feature = where.workspace?.feature;
  if (where.workspace?.context !== "story" || where.workspace.page !== "features" || !feature) return where;
  const leaf = where.label.split(" › ").slice(2).join(" › ");
  const home = FEATURE_INSTALL_HOMES[feature];
  const workspace: WorkspaceIntent = home ? { context: "orchestrator", ...home }
    : { ...where.workspace, context: "orchestrator", page: "features" };
  return { ...where, selector: home ? `#${home.control}` : where.selector, label: workspaceCrumb(workspace, leaf), surface: "settings", workspace };
};
export const helpWhere = (where: FeatureWhere, storyOpen: boolean): FeatureWhere | null => {
  if (storyOpen) return where;
  const placed = defaultsWhere(where);
  return placed.workspace?.context === "story" ? null : placed;
};
export const chatAt = (selector: string, label: string): FeatureWhere => ({ selector, label, surface: "chat" });
export const studioAt = (selector: string, label: string): FeatureWhere => ({ selector, label: `Studio › ${label}`, surface: "studio" });
