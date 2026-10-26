import type { WorkspaceContext, WorkspaceIntent, WorkspacePage } from "@runtime/workspaceNavigation";
import { featureOfControl } from "@runtime/workspaceRoutes";
import { tourRequestOf, type TourRequest } from "./tour/request";

export type GuideShow = { kind: "tour"; request: TourRequest } | { kind: "open"; intent: WorkspaceIntent };

const PAGES: Record<WorkspaceContext, readonly WorkspacePage[]> = {
  story: ["play", "features", "review", "author"],
  orchestrator: ["library", "defaults", "connections", "interface", "help"],
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
  const feature = page === "defaults" || page === "features" ? featureOfControl(control) : undefined;
  return { kind: "open", intent: feature ? { ...intent, feature, control } : { ...intent, control } };
};
