import { lazy, Suspense, useState, type ReactNode } from "react";
import type { RuntimeSnapshot } from "@runtime/types";
import type { RuntimeManager } from "@runtime/index";
import { nextRepairStep } from "@runtime/repair";
import type { DriverController } from "./DriverPanel";
import { MessageJumpProvider } from "./MessageCitation";
import { OverviewTab } from "./tabs/OverviewTab";
import { MemoryTab } from "./tabs/MemoryTab";

const DriverPanel = lazy(() => import("./DriverPanel"));
const BlackboardTab = lazy(() => import("./tabs/BlackboardTab").then((module) => ({ default: module.BlackboardTab })));
const SchedulerTab = lazy(() => import("./tabs/SchedulerTab").then((module) => ({ default: module.SchedulerTab })));
const PayloadTab = lazy(() => import("./tabs/PayloadTab").then((module) => ({ default: module.PayloadTab })));

const AuthorTab = ({ id, children }: { id: DrawerTabId; children: ReactNode }) => (
  <Suspense key={id} fallback={null}>
    <div data-so-tab={id}>{children}</div>
  </Suspense>
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
}

const FlagControl = ({ manager }: { manager: RuntimeManager }) => {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  const submit = async () => {
    await manager.flagMoment(note);
    setNote("");
    setOpen(false);
    window.toastr?.info?.("Moment flagged in the session journal.", "Story Orchestrator");
  };

  if (!open) return <button
    id="so-flag-moment"
    className="menu_button opacity-60"
    title="Flag this moment — it lands in the session journal for review"
    aria-label="Flag this moment"
    onClick={() => setOpen(true)}
  >⚑</button>;
  return (
    <div className="flex items-center gap-1 flex-1">
      <input
        id="so-flag-note"
        className="text_pole flex-1"
        autoFocus
        placeholder="What happened here? (optional)"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") void submit(); if (event.key === "Escape") setOpen(false); }}
      />
      <button id="so-flag-submit" className="menu_button" onClick={() => void submit()}>Flag</button>
      <button className="menu_button opacity-60" aria-label="Cancel flag" onClick={() => { setNote(""); setOpen(false); }}>✕</button>
    </div>
  );
};

// Restart is the player's one destructive control (it asks first); "Edit story" is the author's
// way into Studio from the chat they are playing — that is the chat the save can hot-swap into.
// The drawer footer carries the same four tasks as the settings panel. Continue is
// the drawer itself; Repair appears only while a step is missing and lands on the panel's own Repair
// row, so there is still one control per task.
const StoryControls = ({ snapshot, manager, onEditStory, onOpenRepair, onNewStory }: {
  snapshot: RuntimeSnapshot;
  manager: RuntimeManager;
  onEditStory?: () => void;
  onOpenRepair?: () => void;
  onNewStory?: () => void;
}) => {
  const repair = nextRepairStep(snapshot);
  return (
  <div id="so-drawer-entry-points" className="flex flex-wrap items-center gap-2 border-t border-solid border-white/10 pt-2">
    {repair && onOpenRepair && (
      <button id="so-drawer-repair" className="menu_button" title={repair.detail} onClick={onOpenRepair}>Repair: {repair.consequence}</button>
    )}
    {onNewStory && (
      <button id="so-drawer-new-story" className="menu_button opacity-80" title="Start a new story with the wizard." onClick={onNewStory}>New story</button>
    )}
    {snapshot.ui.authorView && onEditStory && (
      <button id="so-edit-story" className="menu_button" title="Open this story in the Checkpoint Studio. Saving there offers to update this chat." onClick={onEditStory}>Edit story</button>
    )}
    <button
      id="so-restart-story-drawer"
      className="menu_button opacity-80"
      title="Start this story over in this chat. Messages stay; progress and story memory are cleared."
      onClick={() => void manager.restartStory()}
    >Restart story</button>
    {snapshot.ui.authorView && snapshot.storyIdentity.drifted && (
      <button
        id="so-update-story"
        className="menu_button"
        title="Take the newer version from the library into this chat."
        onClick={() => void manager.applyStoryUpdate()}
      >Update to v{snapshot.storyIdentity.libraryVersion}</button>
    )}
  </div>
  );
};

export const DrawerTabs = ({ snapshot, manager, driver, onOpenSettings, onEditStory, onFixWithWizard, onOpenRepair, onNewStory, onBranchFromOldest, onJumpToMessage }: DrawerTabsProps) => {
  const [active, setActive] = useState<DrawerTabId>("overview");
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
      <div className="flex flex-wrap items-center gap-1">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Story Orchestrator tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`menu_button ${activeTab === tab.id ? "" : "opacity-60"}`}
              onClick={() => setActive(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <FlagControl manager={manager} />
      </div>
      <div role="tabpanel">
        {activeTab === "overview" && <OverviewTab
          snapshot={snapshot}
          authorView={authorView}
          onOpenSettings={onOpenSettings}
          onFixWithWizard={onFixWithWizard}
          onReread={() => void manager.runExtractionNow(undefined, "recovery")}
          onRestart={() => void manager.restartStory()}
          onRetry={() => void manager.retryExtraction()}
          onBranchFromOldest={onBranchFromOldest}
        />}
        {activeTab === "blackboard" && <AuthorTab id="blackboard"><BlackboardTab snapshot={snapshot} /></AuthorTab>}
        {activeTab === "memory" && <MemoryTab snapshot={snapshot} manager={manager} authorView={authorView} focusFact={focusFact} />}
        {activeTab === "scheduler" && <AuthorTab id="scheduler"><SchedulerTab snapshot={snapshot} manager={manager} onOpenFact={openFact} /></AuthorTab>}
        {activeTab === "payload" && (
          <AuthorTab id="payload">
            <PayloadTab snapshot={snapshot} manager={manager} onOpenOwner={(tab) => (tab === "config" ? onOpenSettings?.() : setActive(tab))} />
          </AuthorTab>
        )}
      </div>
      {activeTab === "overview" && <StoryControls snapshot={snapshot} manager={manager} onEditStory={onEditStory} onOpenRepair={onOpenRepair} onNewStory={onNewStory} />}
      {/* The driver steers the story — Suggest/Probe/Advance/Nudge are author tools by D1, never
          part of the player surface, whatever the copilot setting says. */}
      {snapshot.copilot.enabled && authorView && (
        <div className="border-t border-solid border-white/10 pt-2">
          <Suspense fallback={null}>
            <DriverPanel context={driver.context} checkpoints={snapshot.checkpoints} activeNudge={driver.activeNudge} controller={driver.controller} authorView={authorView} agency={snapshot.agency} />
          </Suspense>
        </div>
      )}
    </div>
    </MessageJumpProvider>
  );
};

export default DrawerTabs;
