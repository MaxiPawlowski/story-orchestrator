import { useSyncExternalStore, type ReactNode } from "react";
import { Lazy } from "@components/Lazy";
import { lazyRetry } from "@utils/lazyRetry";
import { BADGE_REFRESH_EVENTS, fillChatInput, mountStoryBadges, mountStoryWand, openStoryGroupChat, showTextPopup, subscribeToHostEvents } from "@services/STAPI";
import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import { onPlaysChanged, readBadgeMaps } from "@runtime/playsIndexHost";
import type { ContinueRow } from "@runtime/playsIndex";
import { panelGeometry } from "@runtime/panelGeometry";
import { readPanels, savePanel } from "@runtime/panelStore";
import { composeActivity } from "@runtime/activityFeed";
import { setupFindings } from "@runtime/repair";
import { renderNarrativeNode } from "@runtime/narrative";
import type { MountRegistry } from "@utils/mountRegistry";
import type { FeatureWhere } from "@features/registry";
import { PRESENCE_TEXT } from "@features/presenceCopy";
import { GAME_TEXT } from "@features/gameCopy";
import { BRIEFING_COPY, GUIDE_COPY, HELP_COPY } from "@features/helpCopy";
import { requestBriefing } from "@runtime/briefingRequest";
import type { SuggestionAsk } from "@runtime/suggestionsHost";
import type { WriteResult } from "@utils/writeResult";
import { PanelFrame } from "./components/panels/PanelFrame";
import { onGuideRequest, requestGuide } from "@guide/request";
import type { GuideTarget } from "@guide/types";

const HelpHost = lazyRetry(() => import("./components/help/HelpHost"));
const ActivityPanel = lazyRetry(() => import("./components/panels/ActivityPanel"));
const GuideHost = lazyRetry(() => import("./guide/GuideHost"));
const SuggestionsPanel = lazyRetry(() => import("./components/panels/SuggestionsPanel"));
const suggestionsHost = () => import("@runtime/suggestionsHost");
const JournalPanel = lazyRetry(() => import("./components/panels/JournalPanel"));
const StatSheetPanel = lazyRetry(() => import("./components/panels/StatSheetPanel"));
const WidgetPanel = lazyRetry(() => import("./components/panels/WidgetPanel"));

export type PanelId = "help" | "activity" | "guide" | "suggestions" | "journal" | "stat-sheet" | `widget-${string}`;

const panelListeners = new Set<() => void>();
let openPanels: readonly PanelId[] = [];

export const setPanel = (id: PanelId, open: boolean) => {
  openPanels = open ? [...openPanels.filter((entry) => entry !== id), id] : openPanels.filter((entry) => entry !== id);
  panelListeners.forEach((listener) => listener());
};

export const togglePanel = (id: PanelId) => setPanel(id, !openPanels.includes(id));

let guideTarget: GuideTarget | null = null;

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

const activityChecks = (snapshot: RuntimeSnapshot) => {
  const findings = setupFindings(snapshot);
  return [...findings.blocks, ...findings.degrades, ...findings.info];
};

const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });

export const gamePanels = (snapshot: RuntimeSnapshot) => {
  const game = snapshot.ready ? snapshot.game ?? null : null;
  const shown = snapshot.presence?.shown;
  return {
    game, journal: Boolean(game && shown?.journal && (game.journal.length || game.milestones.length)), statSheet: Boolean(game?.statSheet && shown?.statSheet),
    widgets: game && shown?.widgets ? game.widgets : [],
  };
};

const Opener = ({ id, icon, label, panel, open }: { id: string; icon: string; label: string; panel: PanelId; open: readonly PanelId[] }) => (
  <button id={id} type="button" data-so={id.slice(3)} className={`menu_button fa-solid ${icon}`} aria-expanded={open.includes(panel)} aria-label={label} title={label}
    onClick={() => togglePanel(panel)} />
);

export const GameOpeners = ({ snapshot }: { snapshot: RuntimeSnapshot }) => {
  const open = useOpenPanels();
  const game = gamePanels(snapshot);
  const widgets = game.widgets;
  const widgetsOpen = widgets.some((widget) => open.includes(`widget-${widget.id}`));
  return (
    <>
      {game.journal && <Opener id="so-open-journal" icon="fa-book" label={GAME_TEXT.journalOpen} panel="journal" open={open} />}
      {game.statSheet && <Opener id="so-open-stat-sheet" icon="fa-list-check" label={GAME_TEXT.statSheetOpen} panel="stat-sheet" open={open} />}
      {widgets.length > 0 && (
        <button id="so-open-widgets" type="button" data-so="open-widgets" className="menu_button fa-solid fa-table-columns" aria-expanded={widgetsOpen}
          aria-label={GAME_TEXT.widgetsOpen} title={GAME_TEXT.widgetsOpen} onClick={() => widgets.forEach((widget) => setPanel(`widget-${widget.id}`, !widgetsOpen))} />
      )}
    </>
  );
};

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
  const requestSuggestions = async () => (await suggestionsHost()).askSuggestions(manager);
  let host: Awaited<ReturnType<typeof suggestionsHost>> | null = null;
  void suggestionsHost().then((loaded) => { host = loaded; });
  const fillSuggestion = (ask: SuggestionAsk, text: string): WriteResult =>
    host ? host.fillSuggestion(ask, text) : { ok: false as const, reason: PRESENCE_TEXT.suggestionsLoading };

  const htmlHost = { journal: (summary: string, detail: string) => manager.noteRecap(summary, detail, "author") };

  const PanelsHost = () => {
    const panels = useOpenPanels();
    const snapshot = useSnapshot();
    const activity = panels.includes("activity") && snapshot.ready && snapshot.ui.authorView;
    const suggestions = panels.includes("suggestions") && snapshot.ready && snapshot.presence?.shown.suggestions === true;
    const game = gamePanels(snapshot);
    return (
      <>
        {panels.includes("help") && (
          <Panel id="help" title={HELP_COPY.heading}>
            <Lazy fallback={null}><HelpHost authorView={snapshot.ui.authorView} onShowMe={showFeature} onOpenDoc={requestGuide} onClose={() => setPanel("help", false)} /></Lazy>
          </Panel>
        )}
        {panels.includes("guide") && (
          <Panel id="guide" title={GUIDE_COPY.title}>
            <Lazy fallback={null}><GuideHost authorView={snapshot.ui.authorView} target={guideTarget} onTargetSeen={() => { guideTarget = null; }} /></Lazy>
          </Panel>
        )}
        {activity && (
          <Panel id="activity" title={PRESENCE_TEXT.activityTitle}>
            <Lazy fallback={null}><ActivityPanel rows={composeActivity(snapshot.inline, snapshot.rolls ?? [])} onJump={jump} checks={activityChecks(snapshot)} /></Lazy>
          </Panel>
        )}
        {suggestions && (
          <Panel id="suggestions" title={PRESENCE_TEXT.suggestionsTitle}>
            <Lazy fallback={null}><SuggestionsPanel request={requestSuggestions} fill={fillSuggestion} /></Lazy>
          </Panel>
        )}
        {game.game && game.journal && panels.includes("journal") && (
          <Panel id="journal" title={GAME_TEXT.journalTitle}>
            <Lazy fallback={null}><JournalPanel game={game.game} author={snapshot.ui.authorView ? snapshot.gameAuthor ?? null : null} /></Lazy>
          </Panel>
        )}
        {game.statSheet && panels.includes("stat-sheet") && (
          <Panel id="stat-sheet" title={GAME_TEXT.statSheetTitle}>
            <Lazy fallback={null}><StatSheetPanel sheet={game.game?.statSheet ?? null} /></Lazy>
          </Panel>
        )}
        {game.widgets.filter((widget) => panels.includes(`widget-${widget.id}`)).map((widget) => (
          <Panel key={widget.id} id={`widget-${widget.id}`} title={widget.title}>
            <Lazy fallback={null}><WidgetPanel widget={widget} onAction={(text) => fillChatInput(text, "")} html={snapshot.ui.presence?.htmlWidgets === false ? null : htmlHost} /></Lazy>
          </Panel>
        ))}
      </>
    );
  };

  const mountPanels = (ui: MountRegistry) => {
    if (document.getElementById("so-panels-root")) return;
    ui.add(onGuideRequest((target) => {
      guideTarget = target;
      setPanel("guide", true);
    }));
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
      { id: "so-wand-briefing", icon: "fa-scroll", label: BRIEFING_COPY.reopen, run: () => void requestBriefing(), shown: () => Boolean(manager.getCachedSnapshot().briefing?.view) },
      { id: "so-wand-flag", icon: "fa-flag", label: PRESENCE_TEXT.wandFlag, run: () => void flag() },
      {
        id: "so-wand-suggestions", icon: "fa-lightbulb", label: PRESENCE_TEXT.suggestionsOpen, run: () => setPanel("suggestions", true),
        shown: () => manager.getCachedSnapshot().presence?.shown.suggestions === true,
      },
      { id: "so-wand-journal", icon: "fa-book", label: GAME_TEXT.wandJournal, run: () => setPanel("journal", true), shown: () => gamePanels(manager.getCachedSnapshot()).journal },
      { id: "so-wand-stat-sheet", icon: "fa-list-check", label: GAME_TEXT.wandStatSheet, run: () => setPanel("stat-sheet", true), shown: () => gamePanels(manager.getCachedSnapshot()).statSheet },
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
