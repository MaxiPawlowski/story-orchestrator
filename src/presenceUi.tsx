import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { askHost } from "@runtime/askEntry";
import { Lazy } from "@components/Lazy";
import { lazyRetry } from "@utils/lazyRetry";
import { BADGE_REFRESH_EVENTS, fillChatInput, mountStoryBadges, mountStoryWand, openStoryGroupChat, showTextPopup, subscribeToHostEvents } from "@services/STAPI";
import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import type { WidgetDrawerTab } from "@engine/index";
import { onPlaysChanged, readBadgeMaps } from "@runtime/playsIndexHost";
import type { ContinueRow } from "@runtime/playsIndex";
import { dockInset, panelGeometry, shownPanels, type Viewport } from "@runtime/panelGeometry";
import { readPanels, savePanel } from "@runtime/panelStore";
import { hasOpenGroup } from "@runtime/persistence";
import { renderNarrativeNode } from "@runtime/narrative";
import type { MountRegistry } from "@utils/mountRegistry";
import type { FeatureWhere } from "@features/registry";
import { PRESENCE_TEXT } from "@features/presenceCopy";
import { GAME_TEXT } from "@features/gameCopy";
import { BRIEFING_COPY, GUIDE_COPY, HELP_COPY } from "@features/helpCopy";
import { requestBriefing } from "@runtime/briefingRequest";
import { JOURNAL_PAGE_EVENT } from "@runtime/drawerTab";
import type { SuggestionAsk } from "@runtime/suggestionsHost";
import type { WriteResult } from "@utils/writeResult";
import { PanelFrame } from "./components/panels/PanelFrame";
import { onGuideRequest, requestGuide } from "@guide/request";
import type { GuideTarget } from "@guide/types";

const HelpHost = lazyRetry(() => import("./components/help/HelpHost"));
const GuideHost = lazyRetry(() => import("./guide/GuideHost"));
const SuggestionsPanel = lazyRetry(() => import("./components/panels/SuggestionsPanel"));
const suggestionsHost = () => import("@runtime/suggestionsHost");
const JournalPanel = lazyRetry(() => import("./components/panels/JournalPanel"));
const StatSheetPanel = lazyRetry(() => import("./components/panels/StatSheetPanel"));
const WidgetPanel = lazyRetry(() => import("./components/panels/WidgetPanel"));

export type PanelId = "help" | "guide" | "suggestions" | "journal" | "stat-sheet" | `widget-${string}`;

const panelListeners = new Set<() => void>();
let openPanels: readonly PanelId[] = [];

export const setPanel = (id: PanelId, open: boolean) => {
  openPanels = open ? [...openPanels.filter((entry) => entry !== id), id] : openPanels.filter((entry) => entry !== id);
  panelListeners.forEach((listener) => listener());
};

let guideTarget: GuideTarget | null = null;

export const useOpenPanels = () => useSyncExternalStore(
  (listener) => { panelListeners.add(listener); return () => { panelListeners.delete(listener); }; },
  () => openPanels,
);

export interface PresenceUiDeps {
  manager: RuntimeManager;
  useSnapshot: () => RuntimeSnapshot;
  showFeature: (where: FeatureWhere) => void;
  openDrawer: (tab?: WidgetDrawerTab) => void;
  jumpToMessage?: (messageId: number) => void;
}

const viewport = (): Viewport => ({ width: window.innerWidth, height: window.innerHeight });

const formTop = () => document.getElementById("form_sheld")?.getBoundingClientRect().top ?? null;

const usePanelViewport = () => {
  const [state, setState] = useState(() => ({ view: viewport(), inset: dockInset(formTop(), window.innerHeight) }));
  useEffect(() => {
    const measure = () => setState({ view: viewport(), inset: dockInset(formTop(), window.innerHeight) });
    const form = document.getElementById("form_sheld");
    const observer = typeof ResizeObserver === "function" && form ? new ResizeObserver(measure) : null;
    if (form) observer?.observe(form);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  return state;
};

export const gamePanels = (snapshot: RuntimeSnapshot) => {
  const game = snapshot.ready ? snapshot.game ?? null : null;
  const shown = snapshot.presence?.shown;
  return {
    game, journal: Boolean(game && shown?.journal && (game.journal.length || game.milestones.length || game.codex)), statSheet: Boolean(game?.statSheet && shown?.statSheet),
    widgets: game && shown?.widgets ? game.widgets : [],
  };
};

export type ChatPanel = "journal" | "stat-sheet" | "widgets" | "suggestions";

export const openChatPanel = (panel: ChatPanel, snapshot: RuntimeSnapshot) => {
  if (panel === "widgets") gamePanels(snapshot).widgets.forEach((widget) => setPanel(`widget-${widget.id}`, true));
  else setPanel(panel, true);
};

export const chatPanelsShown = (snapshot: RuntimeSnapshot): ChatPanel[] => {
  const game = gamePanels(snapshot);
  return [
    ...(game.journal ? ["journal" as const] : []),
    ...(game.statSheet ? ["stat-sheet" as const] : []),
    ...(game.widgets.length ? ["widgets" as const] : []),
    ...(snapshot.ready && snapshot.presence?.shown.suggestions === true ? ["suggestions" as const] : []),
  ];
};

const LAUNCHERS: Record<ChatPanel, { id: string; icon: string; label: string }> = {
  journal: { id: "so-open-journal", icon: "fa-book", label: GAME_TEXT.journalLaunch },
  "stat-sheet": { id: "so-open-stat-sheet", icon: "fa-list-check", label: GAME_TEXT.statSheetLaunch },
  widgets: { id: "so-open-widgets", icon: "fa-table-columns", label: GAME_TEXT.widgetsLaunch },
  suggestions: { id: "so-open-suggestions", icon: "fa-lightbulb", label: PRESENCE_TEXT.suggestionsOpen },
};

export const ChatPanelLaunchers = ({ snapshot, onLaunch }: { snapshot: RuntimeSnapshot; onLaunch: (panel: ChatPanel) => void }) => {
  const shown = chatPanelsShown(snapshot);
  if (!shown.length) return null;
  return (
    <section id="so-chat-side" aria-labelledby="so-chat-side-heading" className="so-task-card">
      <h3 id="so-chat-side-heading" className="so-card-heading">{PRESENCE_TEXT.chatSideHeading}</h3>
      <p className="so-card-hint">{PRESENCE_TEXT.chatSideHint}</p>
      <div className="so-actions">
        {shown.map((panel) => {
          const { id, icon, label } = LAUNCHERS[panel];
          return (
            <button key={panel} id={id} type="button" data-so={id.slice(3)} className="menu_button so-launcher" onClick={() => onLaunch(panel)}>
              <i className={`fa-solid ${icon}`} aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
};

const Panel = ({ id, title, inset, children }: { id: PanelId; title: string; inset: number; children: ReactNode }) => (
  <PanelFrame id={id} title={title} geometry={panelGeometry(readPanels(), id, viewport())} dockInset={inset} onChange={(geometry) => savePanel(id, geometry)} onClose={() => setPanel(id, false)}>
    {children}
  </PanelFrame>
);

export const openPlay = async (row: ContinueRow) => {
  const opened = await openStoryGroupChat(row.groupId, row.chatId);
  if (!opened.ok) window.toastr?.info?.(opened.reason, "Story Orchestrator");
};

export function createPresenceUi({ manager, useSnapshot, showFeature, openDrawer, jumpToMessage }: PresenceUiDeps) {
  const requestSuggestions = async () => (await suggestionsHost()).askSuggestions(manager);
  let host: Awaited<ReturnType<typeof suggestionsHost>> | null = null;
  void suggestionsHost().then((loaded) => { host = loaded; });
  const fillSuggestion = (ask: SuggestionAsk, text: string): WriteResult =>
    host ? host.fillSuggestion(ask, text) : { ok: false as const, reason: PRESENCE_TEXT.suggestionsLoading };

  const fill = (text: string) => fillChatInput(text, "");
  const htmlHost = { journal: (summary: string, detail: string) => manager.noteRecap(summary, detail, "author") };

  const PanelsHost = () => {
    const panels = useOpenPanels();
    const snapshot = useSnapshot();
    const { view, inset } = usePanelViewport();
    const suggestions = panels.includes("suggestions") && snapshot.ready && snapshot.presence?.shown.suggestions === true;
    const game = gamePanels(snapshot);
    const author = snapshot.ui.authorView ? snapshot.gameAuthor ?? null : null;
    const bodies = new Map<PanelId, { title: string; body: ReactNode }>();
    if (panels.includes("help")) bodies.set("help", { title: HELP_COPY.heading, body: <Lazy fallback={null}><HelpHost authorView={snapshot.ui.authorView} snapshot={snapshot} onShowMe={showFeature}
      onOpenDoc={requestGuide} onClose={() => setPanel("help", false)} ask={async (question) => (await askHost()).askInChat(manager, question)} /></Lazy> });
    if (panels.includes("guide")) bodies.set("guide", { title: GUIDE_COPY.title, body: <Lazy fallback={null}><GuideHost authorView={snapshot.ui.authorView} target={guideTarget}
      onTargetSeen={() => { guideTarget = null; }} snapshot={snapshot} groupOpen={hasOpenGroup()} onShowMe={() => setPanel("guide", false)} /></Lazy> });
    if (suggestions) bodies.set("suggestions", { title: PRESENCE_TEXT.suggestionsTitle, body: <Lazy fallback={null}><SuggestionsPanel request={requestSuggestions} fill={fillSuggestion} /></Lazy> });
    if (game.game && game.journal && panels.includes("journal")) {
      bodies.set("journal", { title: GAME_TEXT.journalTitle, body: <Lazy fallback={null}><JournalPanel game={game.game} author={author} onJump={jumpToMessage} /></Lazy> });
    }
    if (game.statSheet && panels.includes("stat-sheet")) bodies.set("stat-sheet", { title: GAME_TEXT.statSheetTitle, body: <Lazy fallback={null}><StatSheetPanel
      sheet={game.game?.statSheet ?? null} provenance={author?.provenance?.[game.game?.statSheet?.id ?? ""]} onAction={fill} openDrawer={openDrawer} /></Lazy> });
    for (const widget of game.widgets) {
      if (panels.includes(`widget-${widget.id}`)) bodies.set(`widget-${widget.id}`, { title: widget.title, body: <Lazy fallback={null}><WidgetPanel widget={widget} onAction={fill}
        html={snapshot.ui.presence?.htmlWidgets === false ? null : htmlHost} openDrawer={openDrawer} provenance={author?.provenance?.[widget.id]} /></Lazy> });
    }
    return (
      <>
        {shownPanels(panels.filter((id) => bodies.has(id)), view).map((id) => {
          const entry = bodies.get(id);
          return entry ? <Panel key={id} id={id} title={entry.title} inset={inset}>{entry.body}</Panel> : null;
        })}
      </>
    );
  };

  const mountPanels = (ui: MountRegistry) => {
    if (document.getElementById("so-panels-root")) return;
    ui.add(onGuideRequest((target) => {
      guideTarget = target;
      setPanel("guide", true);
    }));
    const openJournal = () => setPanel("journal", true);
    window.addEventListener(JOURNAL_PAGE_EVENT, openJournal);
    ui.add(() => window.removeEventListener(JOURNAL_PAGE_EVENT, openJournal));
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
      { id: "so-wand-drawer", icon: "fa-route", label: PRESENCE_TEXT.wandDrawer, run: () => openDrawer() },
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
