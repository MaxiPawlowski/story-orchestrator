import { STORY_FEATURE_IDS, type StoryFeatureId } from "@engine/featurePolicy";
import type { WorkspaceContext, WorkspaceIntent, WorkspacePage } from "./workspaceNavigation";

export const WORKSPACE_CONTEXT_LABELS: Record<WorkspaceContext, string> = { story: "This story", orchestrator: "Orchestrator" };
export const WORKSPACE_PAGES: Record<WorkspaceContext, Array<{ id: WorkspacePage; label: string }>> = {
  story: [{ id: "play", label: "Play" }, { id: "features", label: "Features" }, { id: "review", label: "Review" }, { id: "author", label: "Author" }],
  orchestrator: [{ id: "library", label: "Library" }, { id: "defaults", label: "Defaults" }, { id: "connections", label: "Connections" },
    { id: "interface", label: "Interface" }, { id: "help", label: "Help" }],
};
const pageLabel = (context: WorkspaceContext, page: WorkspacePage | undefined): string =>
  WORKSPACE_PAGES[context].find((entry) => entry.id === (page ?? WORKSPACE_PAGES[context][0].id))?.label ?? "";
export const workspaceCrumb = (intent: WorkspaceIntent, leaf: string): string => {
  const page = pageLabel(intent.context, intent.page);
  const rest = leaf === page ? "" : leaf.startsWith(`${page} › `) ? leaf.slice(page.length + 3) : leaf;
  return [WORKSPACE_CONTEXT_LABELS[intent.context], page, rest].filter(Boolean).join(" › ");
};

export const SETUP_CONTROL = "so-setup";

export const storyPlayIntent = (): WorkspaceIntent => ({ context: "story", page: "play" });
export const repairIntent = (): WorkspaceIntent => ({ context: "story", page: "play", control: SETUP_CONTROL });
export const connectionsIntent = (): WorkspaceIntent => ({ context: "orchestrator", page: "connections" });
export const JUDGE_AREA_CONTROL = "so-area-judge";
export const judgeIntent = (): WorkspaceIntent => ({ ...connectionsIntent(), control: JUDGE_AREA_CONTROL });
export const featureOfControl = (control: string): StoryFeatureId | undefined => {
  const match = /^so-feature-([A-Za-z]+)-/.exec(control);
  return match && (STORY_FEATURE_IDS as readonly string[]).includes(match[1]) ? match[1] as StoryFeatureId : undefined;
};
export const settingIntent = (control: string): WorkspaceIntent => {
  const feature = featureOfControl(control);
  return feature ? { context: "story", page: "features", feature, control } : { ...connectionsIntent(), control };
};
