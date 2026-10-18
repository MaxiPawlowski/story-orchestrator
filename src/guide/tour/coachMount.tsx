import { useSyncExternalStore } from "react";
import type { MountRegistry } from "@utils/mountRegistry";
import { workspaceNavigation } from "@runtime/workspaceNavigation";
import { requestGuide } from "@guide/request";
import type { TourRequest } from "./request";
import type { CoachAction, CoachHost } from "./coachTypes";
import { CoachMarks } from "./CoachMarks";

export interface CoachDeps {
  openStudio: () => void;
  closeStudio: () => void;
  studioOpen: () => boolean;
}

interface CoachState {
  request: TourRequest | null;
  opened: number;
}

let state: CoachState = { request: null, opened: 0 };
const listeners = new Set<() => void>();
const set = (next: CoachState) => { state = next; listeners.forEach((listener) => listener()); };
const useCoachState = () => useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => state);

export const closeCoach = () => set({ ...state, request: null });

export const coachHost = (deps: CoachDeps): CoachHost => {
  let opened = false;
  return {
    run(action: CoachAction) {
      if (action.kind !== "studio" && opened) { opened = false; if (deps.studioOpen()) deps.closeStudio(); }
      if (action.kind === "workspace") workspaceNavigation.open(action.intent);
      else if (action.kind === "chat") workspaceNavigation.close();
      else if (action.kind === "guide") { workspaceNavigation.close(); requestGuide(action.doc); }
      else if (!deps.studioOpen()) { opened = true; deps.openStudio(); }
    },
  };
};

const CoachRoot = ({ host }: { host: CoachHost }) => {
  const coach = useCoachState();
  if (!coach.request) return null;
  return <CoachMarks key={coach.opened} view={coach.request.view} stop={coach.request.stop} host={host} onClose={closeCoach} />;
};

export const openCoach = (ui: MountRegistry, deps: CoachDeps, request: TourRequest) => {
  if (!document.getElementById("so-coach-root")) {
    const root = ui.element(document.createElement("div"));
    root.id = "so-coach-root";
    document.body.appendChild(root);
    ui.root(root, <CoachRoot host={coachHost(deps)} />);
    ui.add(closeCoach);
  }
  set({ request, opened: state.opened + 1 });
};
