import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Lazy } from "@components/Lazy";
import { lazyRetry } from "@utils/lazyRetry";
import type { RuntimeSnapshot } from "@runtime/types";
import type { RuntimeManager } from "@runtime/index";
import type { OneClickFix, ShowMe } from "@runtime/repair";
import { chatUpdateSentence } from "@runtime/librarySave";
import { DRAWER_TAB_OF_CONTROL } from "@runtime/surfaceShown";
import { workspaceNavigation } from "@runtime/workspaceNavigation";
import type { DriverController, RecoveryTarget } from "./DriverPanel";
import { MessageJumpProvider } from "./MessageCitation";
import { OverviewTab } from "./tabs/OverviewTab";
import { BusyButton } from "@components/BusyButton";
import type { InlineActions } from "../inline/InlineDetail";

const DriverPanel = lazyRetry(() => import("./DriverPanel"));
const MessageInspector = lazyRetry(() => import("./MessageInspector"));
const BlackboardTab = lazyRetry(() => import("./tabs/BlackboardTab").then((module) => ({ default: module.BlackboardTab })));
const SchedulerTab = lazyRetry(() => import("./tabs/SchedulerTab").then((module) => ({ default: module.SchedulerTab })));
const PayloadTab = lazyRetry(() => import("./tabs/PayloadTab").then((module) => ({ default: module.PayloadTab })));
const MemoryTab = lazyRetry(() => import("./tabs/MemoryTab").then((module) => ({ default: module.MemoryTab })));

const AuthorTab = ({ id, children }: { id: DrawerTabId; children: ReactNode }) => (
  <Lazy key={id} fallback={null}>
    <div data-so-tab={id}>{children}</div>
  </Lazy>
);

export type DrawerTabId = "overview" | "blackboard" | "memory" | "scheduler" | "payload";

const TABS: Array<{ id: DrawerTabId; label: string; authorOnly?: boolean }> = [
  { id: "overview", label: "Overview" },
  { id: "blackboard", label: "Blackboard", authorOnly: true },
  { id: "memory", label: "Memory" },
  { id: "scheduler", label: "Scheduler", authorOnly: true },
  { id: "payload", label: "Payload", authorOnly: true },
];

export interface DrawerDriver {
  context: ReturnType<RuntimeManager["getDriverContext"]>;
  activeNudge: string | null;
  controller: DriverController;
  recovery?: RecoveryTarget | null;
}

export interface DrawerTabsProps {
  snapshot: RuntimeSnapshot;
  manager: RuntimeManager;
  driver: DrawerDriver;
  onOpenSettings?: () => void;
  onEditStory?: () => void;
  onFixWithWizard?: () => void;
  /** The settings panel's Repair step, revealed. */
  onOpenRepair?: () => void;
  onNewStory?: () => void;
  /** Cut a branch at the oldest point this run can still restore. */
  onBranchFromOldest?: (messageId: number) => void;
  /** A cited "message N" scrolls the chat there through /chat-jump. */
  onJumpToMessage?: (messageId: number) => void;
  onShowMe?: (target: ShowMe) => void;
  onFix?: (action: OneClickFix) => Promise<string | null> | void;
  /** The author's click-through from an inline chip: one message's full detail. */
  inspect?: { messageId: number; onClose: () => void; actions?: InlineActions } | null;
}

const AuthorStoryControls = ({ snapshot, manager, onEditStory, onNewStory }: {
  snapshot: RuntimeSnapshot;
  manager: RuntimeManager;
  onEditStory?: () => void;
  onNewStory?: () => void;
}) => {
  const [updated, setUpdated] = useState<string | null>(null);
  if (!snapshot.ui.authorView) return null;
  return (
  <div id="so-author-story-controls" className="so-actions border-t border-solid border-[var(--so-line)] pt-2">
    {onNewStory && (
      <button id="so-author-new-story" type="button" className="menu_button opacity-80" disabled={!snapshot.copilot.enabled}
        title={snapshot.copilot.enabled ? "Start a new story with the wizard." : "Turn on the wizard under Authoring first."} onClick={onNewStory}>New story</button>
    )}
    {onEditStory && (
      <button id="so-edit-story" type="button" className="menu_button" onClick={onEditStory}
        title="Open this story in the Checkpoint Studio. Saving there offers to update this chat.">Edit story</button>
    )}
    {snapshot.storyIdentity.drifted && (
      <BusyButton
        id="so-update-story"
        type="button"
        className="menu_button"
        title="Take the library's copy of this story into this chat."
        work={() => manager.applyStoryUpdate().then((outcome) => setUpdated(chatUpdateSentence(outcome)))}
      >Update to the latest</BusyButton>
    )}
    {updated && <span id="so-update-story-status" role="status" className="text-xs">{updated}</span>}
  </div>
  );
};

export const DrawerTabs = ({
  snapshot, manager, driver, onOpenSettings, onEditStory, onFixWithWizard, onNewStory, onBranchFromOldest, onJumpToMessage, inspect,
}: DrawerTabsProps) => {
  const [active, setActive] = useState<DrawerTabId>("overview");
  const intentControl = () => workspaceNavigation.read()?.control;
  const control = useSyncExternalStore(workspaceNavigation.subscribe, intentControl, intentControl);
  useEffect(() => {
    const tab = control ? DRAWER_TAB_OF_CONTROL[control] : undefined;
    if (tab) setActive(tab);
  }, [control]);
  // A warden card cites the message a fact was read from, so its button has to land on
  // that fact. A `bound:` id is the blackboard's, and the blackboard tab is where it lives; a memory
  // row is focused in the Memory tab instead.
  const [focusFact, setFocusFact] = useState<string | null>(null);
  const openFact = (id: string) => {
    setFocusFact(id);
    setActive(id.startsWith("bound:") ? "blackboard" : "memory");
  };
  const authorView = snapshot.ui.authorView;
  const tabs = TABS.filter((tab) => authorView || !tab.authorOnly);
  const activeTab = tabs.some((tab) => tab.id === active) ? active : "overview";
  return (
    <MessageJumpProvider value={{ enabled: authorView, index: snapshot.chatJump ?? null, onJump: onJumpToMessage ?? null }}>
    <div className="flex flex-col gap-2">
      {authorView && inspect && (
        <Lazy fallback={null}>
          <MessageInspector view={snapshot.inline} messageId={inspect.messageId} onClose={inspect.onClose} actions={inspect.actions} />
        </Lazy>
      )}
      <div className="flex flex-wrap items-center gap-1">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Story Orchestrator tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`menu_button ${activeTab === tab.id ? "" : "opacity-70"}`}
              onClick={() => setActive(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div role="tabpanel">
        {activeTab === "overview" && <OverviewTab snapshot={snapshot} authorView={authorView} onFixWithWizard={onFixWithWizard} onBranchFromOldest={onBranchFromOldest} />}
        {activeTab === "blackboard" && <AuthorTab id="blackboard"><BlackboardTab snapshot={snapshot} onDecideMeanwhile={(id, status) => void manager.decideMeanwhile(id, status)} /></AuthorTab>}
        {activeTab === "memory" && <Lazy fallback={null}><MemoryTab snapshot={snapshot} manager={manager} authorView={authorView} focusFact={focusFact} /></Lazy>}
        {activeTab === "scheduler" && <AuthorTab id="scheduler"><SchedulerTab snapshot={snapshot} manager={manager} onOpenFact={openFact} /></AuthorTab>}
        {activeTab === "payload" && (
          <AuthorTab id="payload">
            <PayloadTab snapshot={snapshot} manager={manager} onOpenOwner={(tab) => (tab === "config" ? onOpenSettings?.() : setActive(tab))} />
          </AuthorTab>
        )}
      </div>
      {activeTab === "overview" && <AuthorStoryControls snapshot={snapshot} manager={manager} onEditStory={onEditStory} onNewStory={onNewStory} />}
      {/* The driver steers the story — Suggest/Probe/Advance/Nudge are author tools by D1, never
          part of the player surface, whatever the copilot setting says. */}
      {snapshot.copilot.enabled && authorView && (
        <div className="border-t border-solid border-[var(--so-line)] pt-2">
          <Lazy fallback={null}>
            <DriverPanel
              context={driver.context}
              checkpoints={snapshot.checkpoints}
              activeNudge={driver.activeNudge}
              controller={driver.controller}
              authorView={authorView}
              agency={snapshot.agency}
              recovery={driver.recovery ?? null}
            />
          </Lazy>
        </div>
      )}
    </div>
    </MessageJumpProvider>
  );
};

export default DrawerTabs;
