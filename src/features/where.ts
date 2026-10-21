import type { StoryFeatureId } from "@engine/featurePolicy";
import type { FeatureWhere } from "./registry";

export const settingsAt = (selector: string, label: string): FeatureWhere => ({
  selector, label: `Orchestrator › ${label}`, surface: "settings",
  workspace: { context: "orchestrator", control: selector.replace(/^#/, ""),
    page: /story-library|so-group-story|so-entry-|so-open-studio|so-new-story/.test(selector) ? "library"
      : /so-presence-|so-hud-|so-your-move-|so-inline-|so-announce-|so-briefing-|so-player-setup/.test(selector) ? "interface"
        : /so-help-|so-copilot-ask|so-getting-started/.test(selector) ? "help" : "connections" },
});
const PLAY_TARGETS = /so-player-overview|so-memory-search|so-carry-|so-living-save|so-your-character|so-image-chat|so-open-(suggestions|journal|widgets|stat)/;

export const drawerAt = (selector: string, label: string): FeatureWhere => ({
  selector, label: `This story › ${label}`, surface: "drawer",
  workspace: { context: "story", page: PLAY_TARGETS.test(selector) ? "play" : "author",
    control: selector.replace(/^#/, "") },
});
export const featureAt = (feature: StoryFeatureId, control: string, label: string): FeatureWhere => ({
  selector: `#so-feature-${feature}-${control}`, label: `This story › Features › ${label}`, surface: "drawer",
  workspace: { context: "story", page: "features", feature, control: `so-feature-${feature}-${control}` },
});
export const defaultsWhere = (where: FeatureWhere): FeatureWhere => (where.workspace?.context === "story" && where.workspace.page === "features"
  ? { ...where, label: where.label.replace("This story › Features", "Orchestrator › Defaults"), surface: "settings", workspace: { ...where.workspace, context: "orchestrator", page: "defaults" } }
  : where);
export const chatAt = (selector: string, label: string): FeatureWhere => ({ selector, label, surface: "chat" });
export const studioAt = (selector: string, label: string): FeatureWhere => ({ selector, label: `Studio › ${label}`, surface: "studio" });
