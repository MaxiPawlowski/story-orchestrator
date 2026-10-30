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
import { setupFindings } from "@runtime/repair";
import PlayerOverview from "@components/drawer/PlayerOverview";
import SetupSection from "@components/drawer/SetupSection";
import { ChatPanelLaunchers } from "../../presenceUi";
import { livingSaveShown } from "@runtime/surfaceShown";
import "./workspace.css";
import { getGlobalSettings } from "@runtime/settingsStore";
import BranchNotice from "@components/drawer/BranchNotice";
import FlagControl from "@components/drawer/FlagControl";
import { requestBriefing } from "@runtime/briefingRequest";
import { BusyButton } from "@components/BusyButton";
import { playEmptyState } from "@runtime/noGroup";
import { Button } from "@components/ui/Button";

const SettingsPanel = lazyRetry(() => import("../settings/SettingsPanel"));
const DrawerTabs = lazyRetry(() => import("../drawer/DrawerTabs"));
const MemoryTab = lazyRetry(() => import("../drawer/tabs/MemoryTab").then((module) => ({ default: module.MemoryTab })));
const YourCharacter = lazyRetry(() => import("../drawer/YourCharacter"));
const MakeGroupCard = lazyRetry(() => import("../settings/MakeGroupCard"));
const LivingSave = lazyRetry(() => import("../drawer/LivingSave"));
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
      const empty = playEmptyState(snapshot);
      if (location.page === "play") return <section className="so-play" data-so="play-page" data-state={empty?.kind ?? "playing"}>
        <h2>{empty?.heading ?? "Playing this story"}</h2>
        {snapshot.chatIdentity?.kind === "branch" && onContinueBranch && <BranchNotice identity={snapshot.chatIdentity} onContinue={onContinueBranch} />}
        <SetupSection findings={setupFindings(snapshot)} authorView={snapshot.ui.authorView} beforeStart={snapshot.boundary === 0} onShowMe={drawerProps.onShowMe} onFix={drawerProps.onFix}
          onDismiss={(id, dismissed) => manager.setCheckDismissed(id, dismissed)} />
        {snapshot.ready ? <>
          <div className="so-task-card">
            <PlayerOverview snapshot={snapshot} onOpenSettings={drawerProps.onOpenSettings} onReread={() => void manager.runExtractionNow(undefined, "recovery")}
              onRetry={() => void manager.retryExtraction()} onRestart={() => void manager.restartStory()} onDismissPreviously={() => void manager.carry.dismiss()}
              onFlagChapter={(title) => void manager.flagMoment(`chapter summary looks wrong: ${title}`)} />
            {snapshot.playerSetup && <Lazy fallback={null}><YourCharacter snapshot={snapshot} /></Lazy>}
            {livingSaveShown(snapshot) && <Lazy fallback={null}><LivingSave onSave={() => manager.living.saveAsStory({ includeUnreached: false })} /></Lazy>}
          </div>
          {settingsHost.openPanel && <ChatPanelLaunchers snapshot={snapshot} onLaunch={settingsHost.openPanel} />}
          {imagePanel && <div className="so-task-card">{imagePanel}</div>}
          <details className="so-task-card so-card-disclosure">
            <summary id="so-open-memory" className="so-card-heading">What the story remembers</summary>
            <Lazy><MemoryTab snapshot={snapshot} manager={manager} authorView={false} /></Lazy>
          </details>
          <div className="so-actions">
            <BusyButton className="st-button secondary" work={() => manager.restartStory()}>Restart story</BusyButton>
            {snapshot.briefing?.view && <button id="so-story-briefing" className="st-button secondary" onClick={() => requestBriefing()}>Story briefing</button>}
            <FlagControl manager={manager} />
          </div>
        </> : <div className="so-task-card">
          {snapshot.noGroup && settingsHost.makeGroup ? <Lazy fallback={null}><MakeGroupCard id="so-play-make-group" view={snapshot.noGroup} wizardOn={snapshot.copilot.enabled}
            onMakeGroup={settingsHost.makeGroup} onFixWithWizard={(storyId, missing) => settingsHost.fixGroupWithWizard?.(storyId, missing)} /></Lazy>
            : <p>{empty?.text}</p>}
          <div className="so-actions"><button className="st-button primary" onClick={() => navigate({ context: "orchestrator", page: "library" })}>Open library</button></div>
        </div>}
      </section>;
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
