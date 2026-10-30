import type { WorkspaceContext, WorkspaceIntent, WorkspacePage } from "@runtime/workspaceNavigation";
import { featureOfControl, settingsLocationOf, WORKSPACE_PAGES } from "@runtime/workspaceRoutes";
import { tourRequestOf, type TourRequest } from "./tour/request";

export type GuideShow = { kind: "tour"; request: TourRequest } | { kind: "open"; intent: WorkspaceIntent };

const PAGES: Record<WorkspaceContext, readonly WorkspacePage[]> = {
  story: WORKSPACE_PAGES.story.map((page) => page.id),
  orchestrator: WORKSPACE_PAGES.orchestrator.map((page) => page.id),
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
  const feature = page === "features" ? featureOfControl(control) : undefined;
  const located = context === "orchestrator" ? settingsLocationOf(control) : null;
  const sub = located?.page === page ? located.sub : undefined;
  return { kind: "open", intent: feature ? { ...intent, feature, control } : { ...intent, ...(sub ? { sub } : {}), control } };
};
