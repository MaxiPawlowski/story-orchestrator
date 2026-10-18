import type { FeatureWhere } from "./registry";

export const settingsAt = (selector: string, label: string): FeatureWhere => ({
  selector, label: `Orchestrator › ${label}`, surface: "settings",
  workspace: { context: "orchestrator", control: selector.replace(/^#/, ""),
    page: /story-library|so-group-story|so-entry-|so-open-studio|so-new-story/.test(selector) ? "library"
      : /so-presence-|so-hud-|so-your-move-|so-inline-|so-announce-|so-briefing-|so-player-setup/.test(selector) ? "interface"
        : /so-help-|so-copilot-ask|so-getting-started/.test(selector) ? "help" : "connections" },
});
export const drawerAt = (selector: string, label: string): FeatureWhere => ({
  selector, label: `This story › ${label}`, surface: "drawer",
  workspace: { context: "story", page: /so-player-overview|so-memory-search|so-carry-|so-open-(suggestions|journal|widgets|stat)/.test(selector) ? "play" : "author",
    control: selector.replace(/^#/, "") },
});
export const chatAt = (selector: string, label: string): FeatureWhere => ({ selector, label, surface: "chat" });
export const studioAt = (selector: string, label: string): FeatureWhere => ({ selector, label: `Studio › ${label}`, surface: "studio" });
