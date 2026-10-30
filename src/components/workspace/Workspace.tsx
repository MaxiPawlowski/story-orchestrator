import type { ReactNode } from "react";
import { Lazy } from "@components/Lazy";
import { lazyRetry } from "@utils/lazyRetry";
import type { RuntimeManager } from "@runtime/runtimeManager";
import type { RuntimeSnapshot } from "@runtime/types";
import type { WorkspaceIntent } from "@runtime/workspaceNavigation";
import type { DrawerTabsProps } from "@components/drawer/DrawerTabs";
import type { SettingsHost } from "@components/settings/SettingsPanel";
import { FeaturePages } from "./FeaturePages";
import { WorkspaceShell } from "./WorkspaceShell";
import { DevicePreferences } from "./DevicePreferences";
import { setupFindings } from "@runtime/repair";
import { openSheet } from "../../presenceUi";
import "./workspace.css";
import { getGlobalSettings } from "@runtime/settingsStore";
import { composeActivity } from "@runtime/activityFeed";

const SettingsPanel = lazyRetry(() => import("../settings/SettingsPanel"));
const DrawerTabs = lazyRetry(() => import("../drawer/DrawerTabs"));
const StagecraftPanel = lazyRetry(() => import("../drawer/StagecraftPanel"));
const ActivityPanel = lazyRetry(() => import("../panels/ActivityPanel"));
const PlayPage = lazyRetry(() => import("./PlayPage"));

export interface WorkspaceProps {
  intent: WorkspaceIntent;
  snapshot: RuntimeSnapshot;
  manager: RuntimeManager;
  settingsHost: SettingsHost;
  drawerProps: DrawerTabsProps;
  onClose: () => void;
  onContinueBranch?: () => Promise<unknown> | void;
  imagePanel?: ReactNode;
  castPanel?: ReactNode;
}

export default function Workspace({ intent, snapshot, manager, settingsHost, drawerProps, onClose, onContinueBranch, imagePanel, castPanel }: WorkspaceProps) {
  const global = getGlobalSettings();
  const installSnapshot = { ...snapshot, extraction: { ...snapshot.extraction, settings: global.extraction },
    memory: { ...snapshot.memory, settings: global.memory }, stagecraft: { ...snapshot.stagecraft, settings: global.stagecraft } };
  return <WorkspaceShell intent={intent} storyTitle={snapshot.storyTitle} authorView={snapshot.ui.authorView} onClose={onClose}
    render={(location, navigate) => {
      if (location.page === "features" || location.page === "defaults") return <FeaturePages snapshot={snapshot} manager={manager} install={location.page === "defaults"}
        selected={location.feature} onSelect={(feature) => navigate({ ...location, feature })} onConnections={() => navigate({ context: "orchestrator", page: "connections" })} />;
      if (location.context === "orchestrator") return <>
        {location.page === "interface" && <DevicePreferences manager={manager} />}
        <Lazy><SettingsPanel snapshot={installSnapshot} manager={manager} host={settingsHost}
          workspaceSection={location.page === "connections" ? "connections" : location.page === "interface" ? "interface" : location.page === "help" ? "help" : "library"} /></Lazy>
      </>;
      if (location.page === "play") return <Lazy><PlayPage snapshot={snapshot} manager={manager} settingsHost={settingsHost} drawerProps={drawerProps} control={intent.control}
        onClose={onClose} onLibrary={() => navigate({ context: "orchestrator", page: "library" })} onPopOut={(tab) => { onClose(); openSheet(tab); }}
        onContinueBranch={onContinueBranch} imageQuick={imagePanel} /></Lazy>;
      if (!snapshot.ui.authorView) return <section><h2>{location.page === "review" ? "Review proposals" : "Author view"}</h2>
        <p>This area can reveal private character knowledge, lore and future routes. Feature configuration is available without revealing them.</p>
        <button id="so-author-view" className="st-button secondary" onClick={() => settingsHost.openAuthorView?.()}>Show author view</button>
      </section>;
      if (location.page === "review") return <section><h2>Review proposals</h2><Lazy><StagecraftPanel snapshot={snapshot} manager={manager} /></Lazy>
        <button className="st-button secondary" onClick={() => navigate({ context: "story", page: "author" })}>Character-life and living-story proposals</button></section>;
      return <section><h2>Author tools</h2><button className="st-button secondary" onClick={() => manager.setUiSettings({ authorView: false })}>Return to player view</button>
        <details><summary id="so-open-activity">Recent activity</summary><Lazy><ActivityPanel rows={composeActivity(snapshot.inline, snapshot.rolls ?? [])}
          onJump={drawerProps.onJumpToMessage ?? (() => undefined)} checks={Object.values(setupFindings(snapshot)).flat()} /></Lazy></details>
        <div id="drawer-manager"><Lazy><DrawerTabs {...drawerProps} snapshot={snapshot} manager={manager} /></Lazy></div>
        {castPanel && <div className="so-task-card">{castPanel}</div>}</section>;
    }} />;
}
