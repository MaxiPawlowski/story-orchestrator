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
import PlayerOverview from "@components/drawer/PlayerOverview";
import SetupSection from "@components/drawer/SetupSection";
import { ChatPanelLaunchers } from "../../presenceUi";
import "./workspace.css";
import { getGlobalSettings } from "@runtime/settingsStore";
import BranchNotice from "@components/drawer/BranchNotice";
import { composeActivity } from "@runtime/activityFeed";
import FlagControl from "@components/drawer/FlagControl";
import { requestBriefing } from "@runtime/briefingRequest";

const SettingsPanel = lazyRetry(() => import("../settings/SettingsPanel"));
const DrawerTabs = lazyRetry(() => import("../drawer/DrawerTabs"));
const StagecraftPanel = lazyRetry(() => import("../drawer/StagecraftPanel"));
const MemoryTab = lazyRetry(() => import("../drawer/tabs/MemoryTab").then((module) => ({ default: module.MemoryTab })));
const ActivityPanel = lazyRetry(() => import("../panels/ActivityPanel"));
const YourCharacter = lazyRetry(() => import("../drawer/YourCharacter"));
const LivingSave = lazyRetry(() => import("../drawer/LivingSave"));

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
      if (location.page === "play") return <section className="so-play">
        <h2>Playing this story</h2>
        {snapshot.chatIdentity?.kind === "branch" && onContinueBranch && <BranchNotice identity={snapshot.chatIdentity} onContinue={onContinueBranch} />}
        <SetupSection findings={setupFindings(snapshot)} authorView={snapshot.ui.authorView} beforeStart={snapshot.boundary === 0} onShowMe={drawerProps.onShowMe} onFix={drawerProps.onFix}
          onDismiss={(id, dismissed) => manager.setCheckDismissed(id, dismissed)} />
        {snapshot.ready ? <>
          <div className="so-task-card">
            <PlayerOverview snapshot={snapshot} onOpenSettings={drawerProps.onOpenSettings} onReread={() => void manager.runExtractionNow(undefined, "recovery")}
              onRetry={() => void manager.retryExtraction()} onRestart={() => void manager.restartStory()} onDismissPreviously={() => void manager.carry.dismiss()}
              onFlagChapter={(title) => void manager.flagMoment(`chapter summary looks wrong: ${title}`)} />
            {snapshot.playerSetup && <Lazy fallback={null}><YourCharacter snapshot={snapshot} /></Lazy>}
            {snapshot.living?.canSave && <Lazy fallback={null}><LivingSave onSave={() => manager.living.saveAsStory({ includeUnreached: false })} /></Lazy>}
          </div>
          {settingsHost.openPanel && <ChatPanelLaunchers snapshot={snapshot} onLaunch={settingsHost.openPanel} />}
          {imagePanel && <div className="so-task-card">{imagePanel}</div>}
          <details className="so-task-card so-card-disclosure">
            <summary id="so-open-memory" className="so-card-heading">What the story remembers</summary>
            <Lazy><MemoryTab snapshot={snapshot} manager={manager} authorView={false} /></Lazy>
          </details>
          <div className="so-actions">
            <button className="st-button secondary" onClick={() => void manager.restartStory()}>Restart story</button>
            {snapshot.briefing?.view && <button id="so-story-briefing" className="st-button secondary" onClick={() => requestBriefing()}>Story briefing</button>}
            <FlagControl manager={manager} />
          </div>
        </> : <div className="so-task-card">
          <p>{snapshot.noChat ? "Open a group chat to play a story." : snapshot.noGroup ? "Stories run in group chats. Create or open the story's group." : "Choose a story for this chat."}</p>
          <div className="so-actions"><button className="st-button primary" onClick={() => navigate({ context: "orchestrator", page: "library" })}>Open library</button></div>
        </div>}
      </section>;
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
