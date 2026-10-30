import type { StoryFeatureId } from "@engine/featurePolicy";
import type { WorkspaceContext, WorkspacePage } from "@runtime/workspaceNavigation";
import { COACH_COPY, type CoachStopCopy } from "@features/tourCopy";
import type { TourView } from "./request";
import type { CoachAction, CoachFlow, CoachStop } from "./coachTypes";

const at = (context: WorkspaceContext, page: WorkspacePage, feature?: StoryFeatureId): CoachAction =>
  ({ kind: "workspace", intent: feature ? { context, page, feature } : { context, page } });

const stop = (id: string, action: CoachAction, ...selectors: Array<string | { selector: string; alt: true }>): CoachStop =>
  ({ id, action, anchors: selectors.map((entry) => (typeof entry === "string" ? { selector: entry } : entry)) });

export const COACH_FLOWS: Record<TourView, CoachFlow> = {
  player: {
    view: "player",
    stops: [
      stop("workspace", { kind: "chat" }, "#so-drawer .drawer-toggle"),
      stop("library", at("orchestrator", "library"), "#so-entry-import-toggle", "#so-entry-points"),
      stop("play", at("story", "play"), "#so-workspace-page-play"),
      stop("memory", at("story", "play"), "#so-open-memory"),
      stop("repair", at("story", "play"), "#so-setup"),
      stop("hud", { kind: "chat" }, "#so-hud"),
      stop("help", at("orchestrator", "help"), "#so-workspace-page-help"),
    ],
  },
  author: {
    view: "author",
    stops: [
      stop("author-view", at("story", "author"), "#so-author-view", { selector: "#drawer-manager [role=\"tablist\"]", alt: true }),
      stop("review", at("story", "review"), "#so-stagecraft", { selector: "#so-author-view", alt: true }),
      stop("wizard", at("orchestrator", "library"), "#so-new-story-wizard"),
      stop("studio", at("orchestrator", "library"), "#so-open-studio", { selector: "#so-entry-author-view", alt: true }),
      stop("studio-wizard", { kind: "studio" }, "#so-studio-tab-copilot"),
      stop("validation", { kind: "studio" }, "#so-studio-task-validation"),
    ],
  },
  setup: {
    view: "setup",
    stops: [
      stop("memory", at("orchestrator", "models"), "#so-extraction-profile"),
      stop("test", at("orchestrator", "models"), "#so-self-test"),
      stop("judge", at("orchestrator", "judge"), "#so-judge-key", "#so-judge"),
      stop("defaults", at("orchestrator", "features"), "#so-feature-filter"),
      stop("feature", at("orchestrator", "features", "thinking"), "#so-feature-thinking-effort"),
      stop("path", { kind: "guide", doc: "setup/setup-path.md" }, "#so-guide"),
    ],
  },
};

export const copyOf = (view: TourView, id: string): CoachStopCopy => COACH_COPY[`${view}.${id}`] ?? { title: id, text: "", missing: "" };

export const stopIndex = (view: TourView, id?: string): number => {
  const index = id ? COACH_FLOWS[view].stops.findIndex((entry) => entry.id === id) : 0;
  return index < 0 ? 0 : index;
};
