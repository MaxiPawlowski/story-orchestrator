import { useState, type ReactNode } from "react";
import { Lazy } from "@components/Lazy";
import { lazyRetry } from "@utils/lazyRetry";
import type { RuntimeManager } from "@runtime/runtimeManager";
import type { RuntimeSnapshot } from "@runtime/types";
import type { DrawerTabsProps } from "@components/drawer/DrawerTabs";
import type { SettingsHost } from "@components/settings/SettingsPanel";
import { playFindings } from "@runtime/repair";
import { SETUP_CONTROL } from "@runtime/workspaceRoutes";
import { sheetTabs, type SheetTab, type SheetTabEntry } from "@runtime/storySheet";
import { chatPanelsShown } from "@runtime/chatPanels";
import { livingSaveShown } from "@runtime/surfaceShown";
import { playEmptyState } from "@runtime/noGroup";
import { requestBriefing } from "@runtime/briefingRequest";
import { PLAY_COPY } from "@features/playCopy";
import { PRESENCE_TEXT } from "@features/presenceCopy";
import PlayerOverview from "@components/drawer/PlayerOverview";
import SetupSection from "@components/drawer/SetupSection";
import BranchNotice from "@components/drawer/BranchNotice";
import FlagControl from "@components/drawer/FlagControl";
import { Button } from "@components/ui/Button";
import { IconButton } from "@components/ui/IconButton";
import { Dialog, DialogHeader } from "@components/ui/Dialog";
import { Tab, TabList, TabPanel, Tabs } from "@components/ui/Tabs";

const PlayerNow = lazyRetry(() => import("../drawer/PlayerNow"));
const YourCharacter = lazyRetry(() => import("../drawer/YourCharacter"));
const MemoryTab = lazyRetry(() => import("../drawer/tabs/MemoryTab").then((module) => ({ default: module.MemoryTab })));
const SheetTabBody = lazyRetry(() => import("../sheet/SheetTabBody"));
const MakeGroupCard = lazyRetry(() => import("../settings/MakeGroupCard"));
const LivingSave = lazyRetry(() => import("../drawer/LivingSave"));

export type PlayTab = "now" | SheetTab;

export interface PlayTabEntry {
  id: PlayTab;
  label: string;
  icon: string;
  pop: string | null;
  tabId: string;
}

const POP_IDS: Partial<Record<SheetTab, string>> = { journal: "so-open-journal", stats: "so-open-stat-sheet" };

export const playTabs = (snapshot: RuntimeSnapshot): PlayTabEntry[] => {
  const sheet = sheetTabs(snapshot);
  const firstWidget = sheet.find((tab) => tab.id.startsWith("widget-"))?.id;
  const popOf = (tab: SheetTabEntry) => POP_IDS[tab.id] ?? (tab.id === firstWidget ? "so-open-widgets" : `so-pop-${tab.id}`);
  const shown = sheet.filter((tab) => tab.id !== "ideas" && tab.id !== "memory")
    .map((tab) => ({ id: tab.id, label: tab.label, icon: tab.icon, pop: popOf(tab), tabId: `so-story-tab-${tab.id}` }));
  const memoryPop = sheet.some((tab) => tab.id === "memory") ? "so-pop-memory" : null;
  return [
    { id: "now", label: PLAY_COPY.now, icon: "fa-compass", pop: null, tabId: "so-story-tab-now" },
    ...shown,
    { id: "memory", label: PLAY_COPY.memory, icon: "fa-brain", pop: memoryPop, tabId: "so-open-memory" },
  ];
};

const CONTROL_TABS: Array<[RegExp, (tabs: PlayTabEntry[]) => PlayTab | undefined]> = [
  [/^so-(open-memory|memory-)/, () => "memory"],
  [/^so-open-journal$/, () => "journal"],
  [/^so-open-stat-sheet$/, () => "stats"],
  [/^so-open-widgets$/, (tabs) => tabs.find((tab) => tab.id.startsWith("widget-"))?.id],
];

export const playTabFor = (control: string | undefined, tabs: PlayTabEntry[]): PlayTab => {
  const hit = control ? CONTROL_TABS.find(([pattern]) => pattern.test(control))?.[1](tabs) : undefined;
  return hit && tabs.some((tab) => tab.id === hit) ? hit : "now";
};

export interface PlayPageProps {
  snapshot: RuntimeSnapshot;
  manager: RuntimeManager;
  settingsHost: SettingsHost;
  drawerProps: DrawerTabsProps;
  control?: string;
  onClose: () => void;
  onLibrary: () => void;
  onPopOut: (tab: SheetTab) => void;
  onContinueBranch?: () => Promise<unknown> | void;
  imageQuick?: ReactNode;
}

export const RestartConfirm = ({ onConfirm, onCancel }: { onConfirm: () => Promise<unknown>; onCancel: () => void }) => (
  <Dialog id="so-restart-confirm" size="window" aria-labelledby="so-restart-confirm-title" aria-describedby="so-restart-confirm-body"
    onCancel={(event) => { event.preventDefault(); onCancel(); }}>
    <DialogHeader titleId="so-restart-confirm-title" title={PLAY_COPY.restartTitle} onClose={onCancel} closeLabel={PLAY_COPY.restartKeep} />
    <div className="so-dialog-body">
      <p id="so-restart-confirm-body" className="so-play-text">{PLAY_COPY.restartBody}</p>
    </div>
    <footer className="so-confirm-foot">
      <Button autoFocus onClick={onCancel}>{PLAY_COPY.restartKeep}</Button>
      <Button id="so-restart-confirm-ok" variant="danger" work={onConfirm}>{PLAY_COPY.restartConfirm}</Button>
    </footer>
  </Dialog>
);

const Empty = ({ snapshot, settingsHost, onLibrary }: Pick<PlayPageProps, "snapshot" | "settingsHost" | "onLibrary">) => {
  const empty = playEmptyState(snapshot);
  return (
    <div className="so-play-empty">
      {snapshot.noGroup && settingsHost.makeGroup ? <Lazy fallback={null}><MakeGroupCard id="so-play-make-group" view={snapshot.noGroup} wizardOn={snapshot.copilot.enabled}
        onMakeGroup={settingsHost.makeGroup} onFixWithWizard={(storyId, missing) => settingsHost.fixGroupWithWizard?.(storyId, missing)} /></Lazy>
        : <p className="so-play-text">{empty?.text}</p>}
      <div className="so-actions"><Button variant="primary" onClick={onLibrary}>{PLAY_COPY.openLibrary}</Button></div>
    </div>
  );
};

export default function PlayPage({ snapshot, manager, settingsHost, drawerProps, control, onClose, onLibrary, onPopOut, onContinueBranch, imageQuick }: PlayPageProps) {
  const tabs = playTabs(snapshot);
  const [picked, setPicked] = useState<PlayTab>(() => playTabFor(control, tabs));
  const [lastControl, setLastControl] = useState(control);
  const [confirming, setConfirming] = useState(false);
  if (control !== lastControl) {
    setLastControl(control);
    setPicked(playTabFor(control, tabs));
  }
  const empty = playEmptyState(snapshot);
  const active = tabs.find((tab) => tab.id === picked) ?? tabs[0];
  const jump = (messageId: number) => { onClose(); drawerProps.onJumpToMessage?.(messageId); };
  const suggestions = chatPanelsShown(snapshot).includes("suggestions");
  return (
    <section className="so-play" data-so="play-page" data-state={empty?.kind ?? "playing"}>
      {empty && <h2 className="so-scene-title">{empty.heading}</h2>}
      {snapshot.chatIdentity?.kind === "branch" && onContinueBranch && <BranchNotice identity={snapshot.chatIdentity} onContinue={onContinueBranch} />}
      {snapshot.ready && (
        <PlayerOverview snapshot={snapshot} onOpenSettings={drawerProps.onOpenSettings} onReread={() => void manager.runExtractionNow(undefined, "recovery")}
          onRetry={() => void manager.retryExtraction()} onRestart={() => setConfirming(true)}>
          {imageQuick}
        </PlayerOverview>
      )}
      <SetupSection findings={playFindings(snapshot)} authorView={snapshot.ui.authorView} beforeStart={snapshot.boundary === 0} open={control === SETUP_CONTROL}
        onShowMe={drawerProps.onShowMe} onFix={drawerProps.onFix} onDismiss={(id, dismissed) => manager.setCheckDismissed(id, dismissed)} />
      {snapshot.ready ? <>
        {snapshot.playerSetup && <Lazy fallback={null}><YourCharacter snapshot={snapshot} /></Lazy>}
        <Tabs value={active.id} onChange={(value) => setPicked(value as PlayTab)} idPrefix="so-story-tab-">
          <div id="so-story-tabs" className="so-play-tabs">
            <TabList label={PLAY_COPY.tabsLabel} className="so-play-tablist">
              {tabs.map((tab) => (
                <Tab key={tab.id} id={tab.tabId} value={tab.id} controls={`so-story-panel-${tab.id}`} data-so="play-tab" data-tab={tab.id}>
                  <i className={`fa-solid ${tab.icon}`} aria-hidden="true" /><span>{tab.label}</span>
                </Tab>
              ))}
            </TabList>
            {active.pop && (
              <IconButton id={active.pop} data-so="play-pop" icon="fa-up-right-from-square" label={PLAY_COPY.popOut(active.label)} onClick={() => onPopOut(active.id as SheetTab)} />
            )}
          </div>
          <TabPanel id={`so-story-panel-${active.id}`} labelledBy={active.tabId} data-so="play-panel" data-tab={active.id} className="so-play-panel">
            {active.id === "now" ? (
              <Lazy fallback={null}>
                <PlayerNow snapshot={snapshot} journalShown={tabs.some((tab) => tab.id === "journal")}
                  onFlagChapter={(title) => void manager.flagMoment(`chapter summary looks wrong: ${title}`)} onDismissPreviously={() => void manager.carry.dismiss()}>
                  {suggestions && (
                    <Button id="so-open-suggestions" data-so="open-suggestions" icon="fa-lightbulb" className="so-play-ideas" onClick={() => onPopOut("ideas")}>{PRESENCE_TEXT.suggestionsOpen}</Button>
                  )}
                  {livingSaveShown(snapshot) && <Lazy fallback={null}><LivingSave onSave={() => manager.living.saveAsStory({ includeUnreached: false })} /></Lazy>}
                </PlayerNow>
              </Lazy>
            ) : active.id === "memory" ? (
              <Lazy><MemoryTab snapshot={snapshot} manager={manager} authorView={false} /></Lazy>
            ) : (
              <Lazy><SheetTabBody key={active.id} tab={active.id} snapshot={snapshot} actions={{ onJump: jump }} /></Lazy>
            )}
          </TabPanel>
        </Tabs>
        <footer className="so-play-foot">
          {snapshot.briefing?.view && <Button id="so-story-briefing" icon="fa-scroll" onClick={() => requestBriefing()}>{PLAY_COPY.briefing}</Button>}
          <FlagControl manager={manager} />
          <Button id="so-play-restart" variant="danger" icon="fa-rotate-left" className="so-play-restart" onClick={() => setConfirming(true)}>{PLAY_COPY.restart}</Button>
        </footer>
        {confirming && <RestartConfirm onCancel={() => setConfirming(false)} onConfirm={async () => { setConfirming(false); await manager.restartStory(true); }} />}
      </> : <Empty snapshot={snapshot} settingsHost={settingsHost} onLibrary={onLibrary} />}
    </section>
  );
}
