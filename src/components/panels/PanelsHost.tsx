import { useEffect, useState, type ReactNode } from "react";
import { askHost } from "@runtime/askEntry";
import { Lazy } from "@components/Lazy";
import { lazyRetry } from "@utils/lazyRetry";
import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import { gamePanels } from "@runtime/chatPanels";
import type { WidgetDrawerTab } from "@engine/index";
import { dockInset, panelGeometry, shownPanels, type Viewport } from "@runtime/panelGeometry";
import { readPanels, savePanel } from "@runtime/panelStore";
import { hasOpenGroup } from "@runtime/persistence";
import type { FeatureWhere } from "@features/registry";
import { PRESENCE_TEXT } from "@features/presenceCopy";
import { GAME_TEXT } from "@features/gameCopy";
import { GUIDE_COPY, HELP_COPY } from "@features/helpCopy";
import type { SuggestionAsk } from "@runtime/suggestionsHost";
import type { WriteResult } from "@utils/writeResult";
import { requestGuide } from "@guide/request";
import type { GuideTarget } from "@guide/types";
import { PanelFrame } from "./PanelFrame";

const HelpHost = lazyRetry(() => import("../help/HelpHost"));
const GuideHost = lazyRetry(() => import("../../guide/GuideHost"));
const SuggestionsPanel = lazyRetry(() => import("./SuggestionsPanel"));
const JournalPanel = lazyRetry(() => import("./JournalPanel"));
const StatSheetPanel = lazyRetry(() => import("./StatSheetPanel"));
const WidgetPanel = lazyRetry(() => import("./WidgetPanel"));

export type PanelId = "help" | "guide" | "suggestions" | "journal" | "stat-sheet" | `widget-${string}`;

export interface PanelsHostProps {
  panels: readonly PanelId[];
  setPanel: (id: PanelId, open: boolean) => void;
  manager: RuntimeManager;
  useSnapshot: () => RuntimeSnapshot;
  showFeature: (where: FeatureWhere) => void;
  openDrawer: (tab?: WidgetDrawerTab) => void;
  jumpToMessage?: (messageId: number) => void;
  guideTarget: () => GuideTarget | null;
  clearGuideTarget: () => void;
  requestSuggestions: Parameters<typeof SuggestionsPanel>[0]["request"];
  fillSuggestion: (ask: SuggestionAsk, text: string) => WriteResult;
  fill: (text: string) => WriteResult;
  htmlHost: { journal: (summary: string, detail: string) => void };
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

const Panel = ({ id, title, inset, setPanel, children }: { id: PanelId; title: string; inset: number; setPanel: PanelsHostProps["setPanel"]; children: ReactNode }) => (
  <PanelFrame id={id} title={title} geometry={panelGeometry(readPanels(), id, viewport())} dockInset={inset} onChange={(geometry) => savePanel(id, geometry)} onClose={() => setPanel(id, false)}>
    {children}
  </PanelFrame>
);

const PanelsHost = ({
  panels, setPanel, manager, useSnapshot, showFeature, openDrawer, jumpToMessage, guideTarget, clearGuideTarget, requestSuggestions, fillSuggestion, fill, htmlHost,
}: PanelsHostProps) => {
  const snapshot = useSnapshot();
  const { view, inset } = usePanelViewport();
  const suggestions = panels.includes("suggestions") && snapshot.ready && snapshot.presence?.shown.suggestions === true;
  const game = gamePanels(snapshot);
  const author = snapshot.ui.authorView ? snapshot.gameAuthor ?? null : null;
  const bodies = new Map<PanelId, { title: string; body: ReactNode }>();
  if (panels.includes("help")) bodies.set("help", { title: HELP_COPY.heading, body: <Lazy fallback={null}><HelpHost authorView={snapshot.ui.authorView} snapshot={snapshot} onShowMe={showFeature}
    onOpenDoc={requestGuide} onClose={() => setPanel("help", false)} hosted ask={async (question) => (await askHost()).askInChat(manager, question)} /></Lazy> });
  if (panels.includes("guide")) bodies.set("guide", { title: GUIDE_COPY.title, body: <Lazy fallback={null}><GuideHost authorView={snapshot.ui.authorView} target={guideTarget()}
    onTargetSeen={clearGuideTarget} snapshot={snapshot} groupOpen={hasOpenGroup()} onShowMe={() => setPanel("guide", false)} /></Lazy> });
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
        return entry ? <Panel key={id} id={id} title={entry.title} inset={inset} setPanel={setPanel}>{entry.body}</Panel> : null;
      })}
    </>
  );
};

export default PanelsHost;
