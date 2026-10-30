import type { ReactNode } from "react";
import { Lazy } from "@components/Lazy";
import { lazyRetry } from "@utils/lazyRetry";
import type { RuntimeManager } from "@runtime/runtimeManager";
import type { RuntimeSnapshot } from "@runtime/types";
import type { WorkspaceIntent } from "@runtime/workspaceNavigation";
import type { DrawerTabsProps } from "@components/drawer/DrawerTabs";
import type { SettingsHost } from "@components/settings/SettingsPanel";
import { WorkspaceShell, type WorkspaceShellProps } from "./WorkspaceShell";
import { ChatSettingsPage } from "./ChatSettingsPage";
import { FeaturesPage } from "./FeaturesPage";
import type { SettingsPageId } from "@components/settings/SettingsPanel";
import { listConnectionProfiles } from "@services/STAPI";
import { resolveFeatures } from "@runtime/featureResolve";
import { STORY_FEATURE_IDS } from "@engine/featurePolicy";
import { openSheet } from "../../presenceUi";
import "./workspace.css";
import { getGlobalSettings } from "@runtime/settingsStore";
import { Button } from "@components/ui/Button";

const SettingsPanel = lazyRetry(() => import("../settings/SettingsPanel"));
const DrawerTabs = lazyRetry(() => import("../drawer/DrawerTabs"));
const PlayPage = lazyRetry(() => import("./PlayPage"));
const RemoveStorySprites = lazyRetry(() => import("../../sprites/RemoveStorySprites"));

const profileName = (profileId: string): string | null => listConnectionProfiles().find((profile) => profile.id === profileId)?.name ?? null;

const settingsBadges = (snapshot: RuntimeSnapshot): WorkspaceShellProps["badges"] => {
  const global = getGlobalSettings();
  const features = resolveFeatures(global, null);
  const untested = (snapshot.roleRoutes ?? []).filter((route) => route.state !== "ok" && route.state !== "fallback" && route.state !== "untested").length;
  return {
    features: { text: `${STORY_FEATURE_IDS.filter((id) => features[id].enabled).length} on` },
    ...(untested ? { models: { text: `${untested} need attention`, tone: "warn" as const } } : {}),
    ...(global.judge.enabled ? {} : { judge: { text: "off" } }),
    ...(global.image.enabled ? {} : { images: { text: "off" } }),
  };
};

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
  return <WorkspaceShell intent={intent} storyTitle={snapshot.storyTitle} authorView={snapshot.ui.authorView} onClose={onClose} badges={settingsBadges(snapshot)}
    render={(location, navigate) => {
      if (location.page === "features" && location.context === "story") return <ChatSettingsPage snapshot={snapshot} manager={manager} host={settingsHost}
        expanded={location.feature} navigate={navigate} profileName={profileName} />;
      if (location.page === "features") return <div className="so-settings-page">
        <header className="so-page-head"><h2>Features</h2>
          <p className="so-section-desc">Every feature starts on. Switch one off here for all chats, or under This chat › Settings for one chat. A story can also turn one off.</p></header>
        <FeaturesPage snapshot={snapshot} manager={manager} scope="install" expanded={location.feature} navigate={navigate} profileName={profileName} />
      </div>;
      if (location.context === "orchestrator") return <Lazy><SettingsPanel page={location.page as SettingsPageId} sub={location.sub} snapshot={installSnapshot}
        manager={manager} host={settingsHost} navigate={navigate} /></Lazy>;
      if (location.page === "play") return <Lazy><PlayPage snapshot={snapshot} manager={manager} settingsHost={settingsHost} drawerProps={drawerProps} control={intent.control}
        onClose={onClose} onLibrary={() => navigate({ context: "orchestrator", page: "library" })} onPopOut={(tab) => { onClose(); openSheet(tab); }}
        onContinueBranch={onContinueBranch} imageQuick={imagePanel} /></Lazy>;
      if (!snapshot.ui.authorView) return <section><h2>{location.page === "review" ? "Review proposals" : "Author view"}</h2>
        <p>This area can reveal private character knowledge, lore and future routes. Feature configuration is available without revealing them.</p>
        <button id="so-author-view" className="st-button secondary" onClick={() => settingsHost.openAuthorView?.()}>Show author view</button>
      </section>;
      return <section className="so-author-page" data-so="author-page">
        <header className="so-author-head"><h2>Author tools</h2>
          <Button size="sm" variant="ghost" icon="fa-eye-slash" onClick={() => manager.setUiSettings({ authorView: false })}>Return to player view</Button></header>
        <div id="drawer-manager"><Lazy><DrawerTabs key={location.page} {...drawerProps} snapshot={snapshot} manager={manager}
          section={location.page === "review" ? "proposals" : undefined} /></Lazy></div>
        {castPanel && <div className="so-task-card">{castPanel}</div>}
        {snapshot.storyId && <Lazy fallback={null}><RemoveStorySprites storyId={snapshot.storyId} storyTitle={snapshot.storyTitle} /></Lazy>}</section>;
    }} />;
}
