import { useSyncExternalStore, type ReactNode } from "react";
import { Lazy } from "@components/Lazy";
import { lazyRetry } from "@utils/lazyRetry";
import { BADGE_REFRESH_EVENTS, mountStoryBadges, mountStoryWand, openStoryGroupChat, showTextPopup, subscribeToHostEvents } from "@services/STAPI";
import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import { onPlaysChanged, readBadgeMaps } from "@runtime/playsIndexHost";
import type { ContinueRow } from "@runtime/playsIndex";
import { panelGeometry } from "@runtime/panelGeometry";
import { readPanels, savePanel } from "@runtime/panelStore";
import { composeActivity } from "@runtime/activityFeed";
import { renderNarrativeNode } from "@runtime/narrative";
import type { MountRegistry } from "@utils/mountRegistry";
import type { FeatureWhere } from "@features/registry";
import { PRESENCE_TEXT } from "@features/presenceCopy";
import { HELP_COPY } from "@features/helpCopy";
import { PanelFrame } from "./components/panels/PanelFrame";

const HelpHost = lazyRetry(() => import("./components/help/HelpHost"));
const ActivityPanel = lazyRetry(() => import("./components/panels/ActivityPanel"));

export type PanelId = "help" | "activity";

const panelListeners = new Set<() => void>();
let openPanels: readonly PanelId[] = [];

export const setPanel = (id: PanelId, open: boolean) => {
  openPanels = open ? [...openPanels.filter((entry) => entry !== id), id] : openPanels.filter((entry) => entry !== id);
  panelListeners.forEach((listener) => listener());
};

export const togglePanel = (id: PanelId) => setPanel(id, !openPanels.includes(id));

export const useOpenPanels = () => useSyncExternalStore(
  (listener) => { panelListeners.add(listener); return () => { panelListeners.delete(listener); }; },
  () => openPanels,
);

export interface PresenceUiDeps {
  manager: RuntimeManager;
  useSnapshot: () => RuntimeSnapshot;
  showFeature: (where: FeatureWhere) => void;
  jump: (messageId: number) => void;
  openDrawer: () => void;
}

const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });

const Panel = ({ id, title, children }: { id: PanelId; title: string; children: ReactNode }) => (
  <PanelFrame id={id} title={title} geometry={panelGeometry(readPanels(), id, viewport())} onChange={(geometry) => savePanel(id, geometry)} onClose={() => setPanel(id, false)}>
    {children}
  </PanelFrame>
);

export const openPlay = async (row: ContinueRow) => {
  const opened = await openStoryGroupChat(row.groupId, row.chatId);
  if (!opened.ok) window.toastr?.info?.(opened.reason, "Story Orchestrator");
};

export function createPresenceUi({ manager, useSnapshot, showFeature, jump, openDrawer }: PresenceUiDeps) {
  const PanelsHost = () => {
    const panels = useOpenPanels();
    const snapshot = useSnapshot();
    const activity = panels.includes("activity") && snapshot.ready && snapshot.ui.authorView;
    return (
      <>
        {panels.includes("help") && (
          <Panel id="help" title={HELP_COPY.heading}>
            <Lazy fallback={null}><HelpHost authorView={snapshot.ui.authorView} onShowMe={showFeature} onClose={() => setPanel("help", false)} /></Lazy>
          </Panel>
        )}
        {activity && (
          <Panel id="activity" title={PRESENCE_TEXT.activityTitle}>
            <Lazy fallback={null}><ActivityPanel rows={composeActivity(snapshot.inline, snapshot.rolls ?? [])} onJump={jump} /></Lazy>
          </Panel>
        )}
      </>
    );
  };

  const mountPanels = (ui: MountRegistry) => {
    if (document.getElementById("so-panels-root")) return;
    const root = ui.element(document.createElement("div"));
    root.id = "so-panels-root";
    document.body.appendChild(root);
    ui.root(root, <PanelsHost />);
  };

  const showRecap = () => {
    const { narrative } = manager.getSnapshot();
    showTextPopup((doc) => renderNarrativeNode(narrative, doc), { okButton: "Continue" });
  };

  const flag = async () => {
    await manager.flagMoment("");
    window.toastr?.info?.(PRESENCE_TEXT.flagged, "Story Orchestrator");
  };

  const mountMarks = (ui: MountRegistry) => {
    const badges = mountStoryBadges(readBadgeMaps, (refresh) => subscribeToHostEvents(BADGE_REFRESH_EVENTS.map((eventName) => ({ eventName, handler: refresh }))));
    ui.add(() => badges.dispose());
    ui.add(onPlaysChanged(() => badges.refresh()));
    const wand = mountStoryWand([
      { id: "so-wand-recap", icon: "fa-book-open", label: PRESENCE_TEXT.wandRecap, run: showRecap },
      { id: "so-wand-flag", icon: "fa-flag", label: PRESENCE_TEXT.wandFlag, run: () => void flag() },
      { id: "so-wand-drawer", icon: "fa-route", label: PRESENCE_TEXT.wandDrawer, run: openDrawer },
    ]);
    ui.add(() => wand.dispose());
    let settingsKey = "";
    const sync = () => {
      const snapshot = manager.getCachedSnapshot();
      wand.setVisible(snapshot.ready && snapshot.presence?.shown.wand === true);
      const key = JSON.stringify(snapshot.ui.presence ?? null);
      if (key === settingsKey) return;
      settingsKey = key;
      badges.refresh();
    };
    ui.add(manager.subscribe(sync));
    sync();
  };

  return { mountPanels, mountMarks };
}
