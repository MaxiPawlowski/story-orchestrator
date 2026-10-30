import type { StoryFeatureId } from "@engine/featurePolicy";
import type { WorkspaceIntent, WorkspacePage } from "@runtime/workspaceNavigation";
import { featureOfControl, workspaceCrumb } from "@runtime/workspaceRoutes";
import type { FeatureWhere } from "./registry";

const placed = (selector: string, leaf: string, surface: FeatureWhere["surface"], workspace: WorkspaceIntent): FeatureWhere =>
  ({ selector, label: workspaceCrumb(workspace, leaf), surface, workspace });

const settingsPage = (selector: string): WorkspacePage =>
  /story-library|so-group-story|so-entry-|so-open-studio|so-new-story|so-announce-transitions|so-getting-started/.test(selector) ? "library"
    : /so-presence-|so-hud-|so-your-move-|so-inline-|so-briefing-|so-player-setup/.test(selector) ? "interface"
      : /so-help-|so-copilot-ask/.test(selector) ? "help" : "connections";

export const settingsAt = (selector: string, label: string): FeatureWhere =>
  placed(selector, label, "settings", { context: "orchestrator", page: settingsPage(selector), control: selector.replace(/^#/, "") });
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
  if (where.workspace?.context !== "story" || where.workspace.page !== "features") return where;
  const workspace: WorkspaceIntent = { ...where.workspace, context: "orchestrator", page: "defaults" };
  return { ...where, label: workspaceCrumb(workspace, where.label.split(" › ").slice(2).join(" › ")), surface: "settings", workspace };
};
export const helpWhere = (where: FeatureWhere, storyOpen: boolean): FeatureWhere | null => {
  if (storyOpen) return where;
  const placed = defaultsWhere(where);
  return placed.workspace?.context === "story" ? null : placed;
};
export const chatAt = (selector: string, label: string): FeatureWhere => ({ selector, label, surface: "chat" });
export const studioAt = (selector: string, label: string): FeatureWhere => ({ selector, label: `Studio › ${label}`, surface: "studio" });
