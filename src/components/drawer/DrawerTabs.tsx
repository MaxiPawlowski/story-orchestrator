import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Lazy } from "@components/Lazy";
import { lazyRetry } from "@utils/lazyRetry";
import type { RuntimeSnapshot } from "@runtime/types";
import type { RuntimeManager } from "@runtime/index";
import type { OneClickFix, ShowMe } from "@runtime/repair";
import { chatUpdateSentence } from "@runtime/librarySave";
import { DRAWER_TAB_OF_CONTROL } from "@runtime/surfaceShown";
import { workspaceNavigation } from "@runtime/workspaceNavigation";
import { AUTHOR_SECTION_LABELS, AUTHOR_SECTION_QUESTIONS, AUTHOR_SECTIONS, pendingProposals, type AuthorSectionId } from "@runtime/authorConsole";
import { Tabs, TabList, Tab, TabPanel } from "@components/ui/Tabs";
import { Button } from "@components/ui/Button";
import type { DriverController, RecoveryTarget } from "./DriverPanel";
import { MessageJumpProvider } from "./MessageCitation";
import { HealthSection } from "./tabs/HealthSection";
import { MemoryTab } from "./tabs/MemoryTab";
import { KeptOutAlert } from "./SecretGridPanel";
import "./author.css";

const DriverPanel = lazyRetry(() => import("./DriverPanel"));
const StateSection = lazyRetry(() => import("./tabs/StateSection").then((module) => ({ default: module.StateSection })));
const ActivitySection = lazyRetry(() => import("./tabs/ActivitySection").then((module) => ({ default: module.ActivitySection })));
const ProposalsSection = lazyRetry(() => import("./tabs/ProposalsSection").then((module) => ({ default: module.ProposalsSection })));
const PipelineSection = lazyRetry(() => import("./tabs/PipelineSection").then((module) => ({ default: module.PipelineSection })));
const PromptSection = lazyRetry(() => import("./tabs/PromptSection").then((module) => ({ default: module.PromptSection })));
const PatternsPanel = lazyRetry(() => import("./PatternsPanel").then((module) => ({ default: module.PatternsPanel })));
const SecretGridPanel = lazyRetry(() => import("./SecretGridPanel"));

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
  section?: AuthorSectionId;
  onOpenSettings?: () => void;
  onEditStory?: () => void;
  onFixWithWizard?: () => void;
  onOpenRepair?: () => void;
  onNewStory?: () => void;
  onBranchFromOldest?: (messageId: number) => void;
  onJumpToMessage?: (messageId: number) => void;
  onShowMe?: (target: ShowMe) => void;
  onFix?: (action: OneClickFix) => Promise<string | null> | void;
}

const SectionBody = ({ id, children }: { id: AuthorSectionId; children: ReactNode }) => (
  <Lazy key={id}>
    <div data-so-tab={id}>{children}</div>
  </Lazy>
);

const AuthorStoryControls = ({ snapshot, manager, onEditStory, onNewStory }: {
  snapshot: RuntimeSnapshot;
  manager: RuntimeManager;
  onEditStory?: () => void;
  onNewStory?: () => void;
}) => {
  const [updated, setUpdated] = useState<string | null>(null);
  return (
    <div id="so-author-story-controls" className="so-steer-row">
      {onEditStory && (
        <Button id="so-edit-story" size="sm" variant="primary" icon="fa-pen" onClick={onEditStory}
          title="Open this story in the Checkpoint Studio. Saving there offers to update this chat.">Edit story</Button>
      )}
      {onNewStory && (
        <Button id="so-author-new-story" size="sm" variant="ghost" disabled={!snapshot.copilot.enabled}
          title={snapshot.copilot.enabled ? "Start a new story with the wizard." : "Turn on the wizard under Authoring first."} onClick={onNewStory}>New story</Button>
      )}
      {snapshot.storyIdentity.drifted && (
        <Button id="so-update-story" size="sm" title="Take the library's copy of this story into this chat."
          work={() => manager.applyStoryUpdate().then((outcome) => setUpdated(chatUpdateSentence(outcome)))}>Update to the latest</Button>
      )}
      {updated && <span id="so-update-story-status" role="status">{updated}</span>}
    </div>
  );
};

const Steer = ({ snapshot, manager, driver, onEditStory, onNewStory }: Pick<DrawerTabsProps, "snapshot" | "manager" | "driver" | "onEditStory" | "onNewStory">) => {
  const [open, setOpen] = useState(false);
  const name = snapshot.activeCheckpointName ?? snapshot.activeCheckpointId ?? "No checkpoint";
  const alerts = snapshot.consoleAuthor?.secrets?.alerts ?? [];
  return (
    <aside className="so-steer" data-so="steer" data-open={open ? "true" : "false"} aria-label="Steer">
      <button type="button" className="so-steer-toggle" aria-expanded={open} aria-controls="so-steer-body" onClick={() => setOpen(!open)}>
        <span className="so-steer-label">Steer</span>
        <span className="so-muted">boundary {snapshot.boundary} · {name}</span>
        {alerts.length > 0 && <i className="fa-solid fa-triangle-exclamation" aria-label="A kept-out member is on stage" />}
        <i className={`fa-solid ${open ? "fa-chevron-up" : "fa-chevron-down"}`} aria-hidden="true" />
      </button>
      <h3 className="so-steer-title">Steer</h3>
      <div id="so-steer-body" className="so-steer-panel">
        <Lazy fallback={null}>
          <DriverPanel
            context={driver.context}
            checkpoints={snapshot.checkpoints}
            activeNudge={driver.activeNudge}
            controller={driver.controller}
            agency={snapshot.agency}
            recovery={driver.recovery ?? null}
            boundary={snapshot.boundary}
            pipeline={snapshot.pipeline}
            gates={snapshot.consoleAuthor?.gates ?? null}
            copilot={snapshot.copilot.enabled}
            alerts={<KeptOutAlert alerts={alerts} />}
            footer={<AuthorStoryControls snapshot={snapshot} manager={manager} onEditStory={onEditStory} onNewStory={onNewStory} />}
          />
        </Lazy>
      </div>
    </aside>
  );
};

export const DrawerTabs = ({
  snapshot, manager, driver, section, onOpenSettings, onEditStory, onFixWithWizard, onOpenRepair, onNewStory, onBranchFromOldest, onJumpToMessage,
}: DrawerTabsProps) => {
  const authorView = snapshot.ui.authorView;
  const sections: readonly AuthorSectionId[] = authorView ? AUTHOR_SECTIONS : ["memory"];
  const [chosen, setActive] = useState<AuthorSectionId>(section ?? "health");
  const intentControl = () => workspaceNavigation.read()?.control;
  const control = useSyncExternalStore(workspaceNavigation.subscribe, intentControl, intentControl);
  useEffect(() => {
    const target = control ? DRAWER_TAB_OF_CONTROL[control] : undefined;
    if (target) setActive(target);
  }, [control]);
  useEffect(() => {
    if (section) setActive(section);
  }, [section]);
  const [focusFact, setFocusFact] = useState<string | null>(null);
  const openFact = (id: string) => {
    setFocusFact(id);
    setActive(id.startsWith("bound:") ? "state" : "memory");
  };
  const active = sections.includes(chosen) ? chosen : sections[0];
  const proposals = pendingProposals(snapshot).total;
  const alerts = snapshot.consoleAuthor?.secrets?.alerts.length ?? 0;
  const counts: Partial<Record<AuthorSectionId, number>> = authorView ? { ...(proposals ? { proposals } : {}), ...(alerts ? { memory: alerts } : {}) } : {};
  return (
    <MessageJumpProvider value={{ enabled: authorView, index: snapshot.chatJump ?? null, onJump: onJumpToMessage ?? null }}>
      <div className="so-console" data-author={authorView ? "true" : "false"}>
        {authorView && <Steer snapshot={snapshot} manager={manager} driver={driver} onEditStory={onEditStory} onNewStory={onNewStory} />}
        <div className="so-console-main">
          <Tabs value={active} onChange={(value) => setActive(value as AuthorSectionId)} idPrefix="so-author-tab-">
            <TabList label="Author sections" className="so-console-tabs">
              {sections.map((id) => (
                <Tab key={id} value={id} controls="so-author-section" count={counts[id]}>
                  {id === "activity" ? <span id="so-open-activity">{AUTHOR_SECTION_LABELS[id]}</span> : AUTHOR_SECTION_LABELS[id]}
                </Tab>
              ))}
            </TabList>
            <TabPanel id="so-author-section" className="so-console-section">
              {authorView && <p className="so-console-question">{AUTHOR_SECTION_QUESTIONS[active]}</p>}
              {active === "health" && (
                <div data-so-tab="health">
                  <HealthSection snapshot={snapshot} onFixWithWizard={onFixWithWizard} onBranchFromOldest={onBranchFromOldest} onOpenRepair={onOpenRepair} />
                </div>
              )}
              {active === "state" && <SectionBody id="state"><StateSection snapshot={snapshot} onDecideMeanwhile={(id, status) => void manager.decideMeanwhile(id, status)} /></SectionBody>}
              {active === "memory" && (
                <SectionBody id="memory">
                  {authorView && <SecretGridPanel grid={snapshot.consoleAuthor?.secrets} />}
                  <MemoryTab snapshot={snapshot} manager={manager} authorView={authorView} focusFact={focusFact} />
                  {authorView && snapshot.patternsAuthor ? <PatternsPanel slice={snapshot.patternsAuthor} /> : null}
                </SectionBody>
              )}
              {active === "prompt" && (
                <SectionBody id="prompt">
                  <PromptSection snapshot={snapshot} manager={manager}
                    onOpenOwner={(owner) => (owner === "config" ? onOpenSettings?.() : owner === "payload" ? undefined : setActive(owner))} />
                </SectionBody>
              )}
              {active === "proposals" && <SectionBody id="proposals"><ProposalsSection snapshot={snapshot} manager={manager} onOpenFact={openFact} /></SectionBody>}
              {active === "activity" && (
                <SectionBody id="activity">
                  <ActivitySection snapshot={snapshot} manager={manager} onJump={onJumpToMessage} onOpenHealth={() => setActive("health")} />
                </SectionBody>
              )}
              {active === "pipeline" && <SectionBody id="pipeline"><PipelineSection snapshot={snapshot} manager={manager} /></SectionBody>}
            </TabPanel>
          </Tabs>
        </div>
      </div>
    </MessageJumpProvider>
  );
};

export default DrawerTabs;
