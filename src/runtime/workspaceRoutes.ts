import { STORY_FEATURE_IDS, type StoryFeatureId } from "@engine/featurePolicy";
import type { WorkspaceIntent } from "./workspaceNavigation";

export const INSPECTOR_CONTROL = "so-inspector";
export const SETUP_CONTROL = "so-setup";

export const storyPlayIntent = (): WorkspaceIntent => ({ context: "story", page: "play" });
export const inspectorIntent = (): WorkspaceIntent => ({ context: "story", page: "author", control: INSPECTOR_CONTROL });
export const repairIntent = (): WorkspaceIntent => ({ context: "story", page: "play", control: SETUP_CONTROL });
export const connectionsIntent = (): WorkspaceIntent => ({ context: "orchestrator", page: "connections" });
export const featureOfControl = (control: string): StoryFeatureId | undefined => {
  const match = /^so-feature-([A-Za-z]+)-/.exec(control);
  return match && (STORY_FEATURE_IDS as readonly string[]).includes(match[1]) ? match[1] as StoryFeatureId : undefined;
};
export const settingIntent = (control: string): WorkspaceIntent => {
  const feature = featureOfControl(control);
  return feature ? { context: "story", page: "features", feature, control } : { ...connectionsIntent(), control };
};
