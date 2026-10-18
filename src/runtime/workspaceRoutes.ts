import type { WorkspaceIntent } from "./workspaceNavigation";

export const INSPECTOR_CONTROL = "so-inspector";
export const SETUP_CONTROL = "so-setup";

export const storyPlayIntent = (): WorkspaceIntent => ({ context: "story", page: "play" });
export const inspectorIntent = (): WorkspaceIntent => ({ context: "story", page: "author", control: INSPECTOR_CONTROL });
export const repairIntent = (): WorkspaceIntent => ({ context: "story", page: "play", control: SETUP_CONTROL });
export const connectionsIntent = (): WorkspaceIntent => ({ context: "orchestrator", page: "connections" });
