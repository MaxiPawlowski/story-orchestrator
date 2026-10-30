import { useSyncExternalStore } from "react";
import { Lazy } from "@components/Lazy";
import { lazyRetry } from "@utils/lazyRetry";
import { BADGE_REFRESH_EVENTS, fillChatInput, mountStoryBadges, mountStoryWand, openStoryGroupChat, showTextPopup, subscribeToHostEvents } from "@services/STAPI";
import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import { chatPanelsShown, type ChatPanel } from "@runtime/chatPanels";
import { sheetTabForPanel, sheetTabs, type SheetTab } from "@runtime/storySheet";
import type { WidgetDrawerTab } from "@engine/index";
import { onPlaysChanged, readBadgeMaps } from "@runtime/playsIndexHost";
import type { ContinueRow } from "@runtime/playsIndex";
import { renderNarrativeNode } from "@runtime/narrative";
import type { MountRegistry } from "@utils/mountRegistry";
import type { FeatureWhere } from "@features/registry";
import { PRESENCE_TEXT } from "@features/presenceCopy";
import { GAME_TEXT } from "@features/gameCopy";
import { SHEET_TEXT } from "@features/sheetCopy";
import { BRIEFING_COPY, HELP_COPY } from "@features/helpCopy";
import { requestBriefing } from "@runtime/briefingRequest";
import { JOURNAL_PAGE_EVENT } from "@runtime/drawerTab";
import type { SuggestionAsk } from "@runtime/suggestionsHost";
import type { WriteResult } from "@utils/writeResult";
import type { PanelId } from "./components/panels/PanelsHost";
import { onGuideRequest } from "@guide/request";
import type { GuideTarget } from "@guide/types";

const PanelsHost = lazyRetry(() => import("./components/panels/PanelsHost"));
const suggestionsHost = () => import("@runtime/suggestionsHost");

export type { PanelId };

const panelListeners = new Set<() => void>();
const notify = () => panelListeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => { panelListeners.add(listener); return () => { panelListeners.delete(listener); }; };

let openPanels: readonly PanelId[] = [];

const NARROW_BELOW = 768;

const narrow = () => window.innerWidth < NARROW_BELOW;

export interface SheetState {
  open: boolean;
  tab: SheetTab | null;
  popped: boolean;
}

let sheet: SheetState = { open: false, tab: null, popped: false };

export const setPanel = (id: PanelId, open: boolean) => {
  openPanels = open ? [...openPanels.filter((entry) => entry !== id), id] : openPanels.filter((entry) => entry !== id);
  if (open && narrow()) sheet = { ...sheet, open: false };
  notify();
};

const setSheet = (next: Partial<SheetState>) => {
  sheet = { ...sheet, ...next };
  notify();
};

export const openSheet = (tab?: SheetTab | null) => {
  if (narrow()) openPanels = [];
  setSheet({ open: true, ...(tab ? { tab } : {}) });
};
export const closeSheet = () => setSheet({ open: false });
export const toggleSheet = (tab?: SheetTab | null) => (sheet.open && (!tab || tab === sheet.tab) ? closeSheet() : openSheet(tab));
export const setSheetTab = (tab: SheetTab) => setSheet({ tab });
export const setSheetPopped = (popped: boolean) => setSheet({ popped });

let guideTarget: GuideTarget | null = null;

export const useOpenPanels = () => useSyncExternalStore(subscribe, () => openPanels);
export const useSheet = () => useSyncExternalStore(subscribe, () => sheet);

export interface PresenceUiDeps {
  manager: RuntimeManager;
  useSnapshot: () => RuntimeSnapshot;
  showFeature: (where: FeatureWhere) => void;
  openDrawer: (tab?: WidgetDrawerTab) => void;
  jumpToMessage?: (messageId: number) => void;
}

export const openChatPanel = (panel: ChatPanel, snapshot: RuntimeSnapshot) => openSheet(sheetTabForPanel(panel, sheetTabs(snapshot)));

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

export const openPlay = async (row: ContinueRow) => {
  const opened = await openStoryGroupChat(row.groupId, row.chatId);
  if (!opened.ok) window.toastr?.info?.(opened.reason, "Story Orchestrator");
};

export function createPresenceUi({ manager, useSnapshot, showFeature, openDrawer, jumpToMessage }: PresenceUiDeps) {
  const requestSuggestions = async (again: number) => (await suggestionsHost()).askSuggestions(manager, again);
  let host: Awaited<ReturnType<typeof suggestionsHost>> | null = null;
  void suggestionsHost().then((loaded) => { host = loaded; });
  const fillSuggestion = (ask: SuggestionAsk, text: string): WriteResult =>
    host ? host.fillSuggestion(ask, text) : { ok: false as const, reason: PRESENCE_TEXT.suggestionsLoading };

  const fill = (text: string) => fillChatInput(text, "");
  const htmlHost = { journal: (summary: string, detail: string) => manager.noteRecap(summary, detail, "author") };

  const PanelsGate = () => {
    const panels = useOpenPanels();
    const state = useSheet();
    if (!panels.length && !state.open) return null;
    return (
      <Lazy fallback={null}>
        <PanelsHost panels={panels} setPanel={setPanel} sheet={state} sheetControl={{ setTab: setSheetTab, setPopped: setSheetPopped, close: closeSheet }}
          manager={manager} useSnapshot={useSnapshot} showFeature={showFeature} openDrawer={openDrawer} jumpToMessage={jumpToMessage}
          guideTarget={() => guideTarget} clearGuideTarget={() => { guideTarget = null; }} requestSuggestions={requestSuggestions} fillSuggestion={fillSuggestion} fill={fill} htmlHost={htmlHost} />
      </Lazy>
    );
  };

  const mountPanels = (ui: MountRegistry) => {
    if (document.getElementById("so-panels-root")) return;
    ui.add(onGuideRequest((target) => {
      guideTarget = target;
      setPanel("guide", true);
    }));
    const openPeople = () => openSheet("people");
    window.addEventListener(JOURNAL_PAGE_EVENT, openPeople);
    ui.add(() => window.removeEventListener(JOURNAL_PAGE_EVENT, openPeople));
    const root = ui.element(document.createElement("div"));
    root.id = "so-panels-root";
    document.body.appendChild(root);
    ui.root(root, <PanelsGate />);
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
      { id: "so-wand-sheet", icon: "fa-book-open", label: SHEET_TEXT.title, run: () => openSheet(), shown: () => sheetTabs(manager.getCachedSnapshot()).length > 0 },
      { id: "so-wand-recap", icon: "fa-clock-rotate-left", label: PRESENCE_TEXT.wandRecap, run: showRecap },
      { id: "so-wand-briefing", icon: "fa-scroll", label: BRIEFING_COPY.reopen, run: () => void requestBriefing(), shown: () => Boolean(manager.getCachedSnapshot().briefing?.view) },
      { id: "so-wand-flag", icon: "fa-flag", label: PRESENCE_TEXT.wandFlag, run: () => void flag() },
      { id: "so-wand-drawer", icon: "fa-route", label: PRESENCE_TEXT.wandDrawer, run: () => openDrawer() },
      { id: "so-wand-help", icon: "fa-circle-question", label: HELP_COPY.heading, run: () => setPanel("help", true) },
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
