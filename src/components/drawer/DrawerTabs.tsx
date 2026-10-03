import { useState, type ReactNode } from "react";
import { Lazy } from "@components/Lazy";
import { lazyRetry } from "@utils/lazyRetry";
import type { RuntimeSnapshot } from "@runtime/types";
import type { RuntimeManager } from "@runtime/index";
import { setupFindings, viewerRepairStep, type OneClickFix, type ShowMe } from "@runtime/repair";
import { PLAYER_COPY } from "@runtime/narrative";
import { chatUpdateSentence } from "@runtime/librarySave";
import { requestBriefing } from "@runtime/briefingRequest";
import { BRIEFING_COPY } from "@features/helpCopy";
import type { DriverController, RecoveryTarget } from "./DriverPanel";
import { MessageJumpProvider } from "./MessageCitation";
import { OverviewTab } from "./tabs/OverviewTab";
import { MemoryTab } from "./tabs/MemoryTab";
import { isArcTemplateName } from "@pacing/index";
import type { InlineActions } from "../inline/InlineDetail";
import { CheckRow, FieldLabel } from "../settings/Field";

const DriverPanel = lazyRetry(() => import("./DriverPanel"));
const MessageInspector = lazyRetry(() => import("./MessageInspector"));
const BlackboardTab = lazyRetry(() => import("./tabs/BlackboardTab").then((module) => ({ default: module.BlackboardTab })));
const SchedulerTab = lazyRetry(() => import("./tabs/SchedulerTab").then((module) => ({ default: module.SchedulerTab })));
const PayloadTab = lazyRetry(() => import("./tabs/PayloadTab").then((module) => ({ default: module.PayloadTab })));

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
  imagePanel?: ReactNode;
  onShowMe?: (target: ShowMe) => void;
  onFix?: (action: OneClickFix) => void;
  /** The author's click-through from an inline chip: one message's full detail. */
  inspect?: { messageId: number; onClose: () => void; actions?: InlineActions } | null;
}

const FlagControl = ({ manager }: { manager: RuntimeManager }) => {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  const submit = async () => {
    await manager.flagMoment(note);
    setNote("");
    setOpen(false);
    window.toastr?.info?.(PLAYER_COPY.flaggedToast, "Story Orchestrator");
  };

  if (!open) return <button
    id="so-flag-moment"
    className="menu_button opacity-70"
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
      <button className="menu_button opacity-70" aria-label="Cancel flag" onClick={() => { setNote(""); setOpen(false); }}>✕</button>
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
  const repair = viewerRepairStep(snapshot);
  const authorView = snapshot.ui.authorView;
  return (
  <div id="so-drawer-entry-points" className="flex flex-wrap items-center gap-2 border-t border-solid border-white/10 pt-2">
    {repair && onOpenRepair && (
      <button id="so-drawer-repair" type="button" className="menu_button so-wrap-button" onClick={onOpenRepair}>Repair: {repair.consequence}</button>
    )}
    {authorView && repair && <span data-so="drawer-repair-detail" className="text-xs opacity-70">{repair.detail}</span>}
    {authorView && onNewStory && (
      <button id="so-drawer-new-story" type="button" className="menu_button opacity-80" disabled={!snapshot.copilot.enabled}
        title={snapshot.copilot.enabled ? "Start a new story with the wizard." : "Turn on the wizard under Author services first."} onClick={onNewStory}>New story</button>
    )}
    {authorView && onEditStory && (
      <button id="so-edit-story" type="button" className="menu_button" onClick={onEditStory}
        title="Open this story in the Checkpoint Studio. Saving there offers to update this chat.">Edit story</button>
    )}
    {snapshot.briefing?.view && (
      <button id="so-story-briefing" type="button" className="menu_button opacity-80" title={BRIEFING_COPY.reopenHelp}
        onClick={() => requestBriefing()}>{BRIEFING_COPY.reopen}</button>
    )}
    <button
      id="so-restart-story-drawer"
      type="button"
      className="menu_button opacity-80"
      title="Start this story over in this chat. Messages stay; progress and story memory are cleared."
      onClick={() => void manager.restartStory()}
    >{PLAYER_COPY.restartButton}</button>
    {authorView && snapshot.storyIdentity.drifted && (
      <button
        id="so-update-story"
        type="button"
        className="menu_button"
        title="Take the newer version from the library into this chat."
        onClick={() => void manager.applyStoryUpdate().then((outcome) => {
          const line = chatUpdateSentence(outcome);
          if (line) window.toastr?.info?.(line, "Story Orchestrator");
        })}
      >Update to v{snapshot.storyIdentity.libraryVersion}</button>
    )}
  </div>
  );
};

export const DrawerTabs = ({
  snapshot, manager, driver, onOpenSettings, onEditStory, onFixWithWizard, onOpenRepair, onNewStory, onBranchFromOldest, onJumpToMessage, imagePanel, inspect, onShowMe, onFix,
}: DrawerTabsProps) => {
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
        <FlagControl manager={manager} />
      </div>
      <div role="tabpanel" className={activeTab === "overview" ? "so-overview-layout" : undefined}>
        {activeTab === "overview" && <OverviewTab
          snapshot={snapshot}
          authorView={authorView}
          onOpenSettings={onOpenSettings}
          onFixWithWizard={onFixWithWizard}
          onReread={() => void manager.runExtractionNow(undefined, "recovery")}
          onRestart={() => void manager.restartStory()}
          onRetry={() => void manager.retryExtraction()}
          onBranchFromOldest={onBranchFromOldest}
          onFlagChapter={(title) => void manager.flagMoment(`chapter summary looks wrong: ${title}`)}
          setup={{ findings: setupFindings(snapshot), onShowMe, onFix, onDismiss: (check, dismissed) => manager.setCheckDismissed(check, dismissed) }}
        />}
        {activeTab === "overview" && <div className="so-chat-tools flex flex-col gap-3">
        <section id="so-chat-preferences" className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2 text-sm">
          <div className="font-medium">Chat preferences <span className="opacity-70 font-normal">— this chat only</span></div>
          <CheckRow id="so-talk-direction" setting="talk.enabled" checked={snapshot.talk.enabled} onChange={(on) => manager.setTalkDirectionEnabled(on)} />
          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor="so-shape-override" label="Dramatic shape"
              help="The rise and fall of tension this chat aims for. Use story default unless you want this chat paced differently." />
            <select id="so-shape-override" value={typeof snapshot.pacing.shapeOverride === "string" ? snapshot.pacing.shapeOverride : ""}
              onChange={(event) => manager.setPacingSettings({ shapeOverride: isArcTemplateName(event.target.value) ? event.target.value : null })}>
              <option value="">Use story default</option>
              <option value="rising">Rising to climax</option>
              <option value="fall_recovery">Fall then recovery</option>
              <option value="three_act">Three act</option>
            </select>
          </div>
        </section>
        {imagePanel}
        </div>}
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
