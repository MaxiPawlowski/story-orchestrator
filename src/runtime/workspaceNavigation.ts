import type { StoryFeatureId } from "@engine/featurePolicy";

export type WorkspaceContext = "story" | "orchestrator";
export type WorkspacePage = "play" | "features" | "review" | "author"
  | "library" | "models" | "judge" | "images" | "world" | "display" | "authoring" | "diagnostics" | "help";
export interface WorkspaceIntent {
  context: WorkspaceContext;
  page?: WorkspacePage;
  sub?: string;
  feature?: StoryFeatureId;
  control?: string;
}

let intent: WorkspaceIntent | null = null;
const listeners = new Set<() => void>();
export const workspaceNavigation = {
  read: () => intent,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  open(next: WorkspaceIntent) { intent = next; listeners.forEach((listener) => listener()); },
  close() { intent = null; listeners.forEach((listener) => listener()); },
};
