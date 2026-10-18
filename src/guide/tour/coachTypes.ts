import type { WorkspaceIntent } from "@runtime/workspaceNavigation";
import type { TourView } from "./request";

export type CoachAction =
  | { kind: "workspace"; intent: WorkspaceIntent }
  | { kind: "chat" }
  | { kind: "studio" }
  | { kind: "guide"; doc: string };

export interface CoachAnchor {
  selector: string;
  alt?: boolean;
}

export interface CoachStop {
  id: string;
  anchors: readonly CoachAnchor[];
  action: CoachAction;
}

export interface CoachFlow {
  view: TourView;
  stops: readonly CoachStop[];
}

export interface CoachHost {
  run: (action: CoachAction) => void;
}
