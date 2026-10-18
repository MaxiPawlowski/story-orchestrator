import { STORY_FEATURE_IDS, type StoryFeatureId } from "@engine/featurePolicy";
import type { WorkspaceContext, WorkspaceIntent, WorkspacePage } from "@runtime/workspaceNavigation";
import { tourRequestOf, type TourRequest } from "./tour/request";

export type GuideShow = { kind: "tour"; request: TourRequest } | { kind: "open"; intent: WorkspaceIntent };

const PAGES: Record<WorkspaceContext, readonly WorkspacePage[]> = {
  story: ["play", "features", "review", "author"],
  orchestrator: ["library", "defaults", "connections", "interface", "help"],
};

const featureOf = (control: string): StoryFeatureId | undefined => {
  const match = /^so-feature-([A-Za-z]+)-/.exec(control);
  return match && (STORY_FEATURE_IDS as readonly string[]).includes(match[1]) ? match[1] as StoryFeatureId : undefined;
};

export const guideShowOf = (value: string): GuideShow | null => {
  if (!value.startsWith("open:")) {
    const request = tourRequestOf(value);
    return request?.view ? { kind: "tour", request } : null;
  }
  const [context, page, control] = value.slice(5).split(".");
  if (context !== "story" && context !== "orchestrator") return null;
  if (!(PAGES[context] as readonly string[]).includes(page)) return null;
  const intent: WorkspaceIntent = { context, page: page as WorkspacePage };
  if (!control) return { kind: "open", intent };
  const feature = page === "defaults" || page === "features" ? featureOf(control) : undefined;
  return { kind: "open", intent: feature ? { ...intent, feature, control } : { ...intent, control } };
};
