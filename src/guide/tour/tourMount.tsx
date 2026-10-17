import { useSyncExternalStore } from "react";
import { currentUserHandle } from "@services/STAPI";
import type { MountRegistry } from "@utils/mountRegistry";
import type { RuntimeManager } from "@runtime/runtimeManager";
import { workspaceNavigation, type WorkspaceIntent } from "@runtime/workspaceNavigation";
import type { TourView } from "./request";
import { TourDialog } from "./TourDialog";
import { tourProgressStore } from "./tourProgress";

interface TourState {
  open: boolean;
  view: TourView | null;
  opened: number;
}

let state: TourState = { open: false, view: null, opened: 0 };
const listeners = new Set<() => void>();
const set = (next: TourState) => { state = next; listeners.forEach((listener) => listener()); };
const useTourState = () => useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => state);

const store = tourProgressStore(() => (typeof localStorage === "undefined" ? null : localStorage), () => currentUserHandle());

export const closeTour = () => set({ ...state, open: false });

export const showFromTour = (intent: WorkspaceIntent) => {
  closeTour();
  workspaceNavigation.open(intent);
};

const TourHost = ({ manager }: { manager: RuntimeManager }) => {
  const tour = useTourState();
  const authorView = useSyncExternalStore((listener) => manager.subscribe(listener), () => manager.getCachedSnapshot().ui.authorView);
  if (!tour.open) return null;
  return <TourDialog key={tour.opened} initialView={tour.view} store={store} authorView={authorView} onShow={showFromTour} onClose={closeTour} />;
};

export const openTour = (ui: MountRegistry, manager: RuntimeManager, view: TourView | null) => {
  if (!document.getElementById("so-tour-root")) {
    const root = ui.element(document.createElement("div"));
    root.id = "so-tour-root";
    document.body.appendChild(root);
    ui.root(root, <TourHost manager={manager} />);
    ui.add(closeTour);
  }
  set({ open: true, view, opened: state.open ? state.opened : state.opened + 1 });
};
