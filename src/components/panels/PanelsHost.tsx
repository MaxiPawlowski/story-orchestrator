import { useEffect, useState, type ReactNode } from "react";
import { askHost } from "@runtime/askEntry";
import { Lazy } from "@components/Lazy";
import { lazyRetry } from "@utils/lazyRetry";
import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import type { WidgetDrawerTab } from "@engine/index";
import type { SheetTab } from "@runtime/storySheet";
import { dockInset, panelGeometry, shownPanels, type Viewport } from "@runtime/panelGeometry";
import { readPanels, savePanel } from "@runtime/panelStore";
import { hasOpenGroup } from "@runtime/persistence";
import type { FeatureWhere } from "@features/registry";
import { GUIDE_COPY, HELP_COPY } from "@features/helpCopy";
import type { SuggestionAsk, SuggestionOutcome } from "@runtime/suggestionsHost";
import type { WriteResult } from "@utils/writeResult";
import { requestGuide } from "@guide/request";
import type { GuideTarget } from "@guide/types";
import { PanelFrame } from "./PanelFrame";
import type { InlineActions } from "../inline/InlineDetail";
import { setInspectTarget, useInspectTarget } from "../drawer/inspectTarget";

const HelpHost = lazyRetry(() => import("../help/HelpHost"));
const GuideHost = lazyRetry(() => import("../../guide/GuideHost"));
const StorySheet = lazyRetry(() => import("../sheet/StorySheet"));
const MessageInspector = lazyRetry(() => import("../drawer/MessageInspector"));

export type PanelId = "help" | "guide" | "inspector";

export interface SheetControl {
  setTab: (tab: SheetTab) => void;
  setPopped: (popped: boolean) => void;
  close: () => void;
}

export interface PanelsHostProps {
  panels: readonly PanelId[];
  setPanel: (id: PanelId, open: boolean) => void;
  sheet: { open: boolean; tab: SheetTab | null; popped: boolean };
  sheetControl: SheetControl;
  manager: RuntimeManager;
  useSnapshot: () => RuntimeSnapshot;
  showFeature: (where: FeatureWhere) => void;
  openDrawer: (tab?: WidgetDrawerTab) => void;
  jumpToMessage?: (messageId: number) => void;
  guideTarget: () => GuideTarget | null;
  clearGuideTarget: () => void;
  requestSuggestions: (again: number) => Promise<SuggestionOutcome>;
  fillSuggestion: (ask: SuggestionAsk, text: string) => WriteResult;
  fill: (text: string) => WriteResult;
  htmlHost: { journal: (summary: string, detail: string) => void };
  inspectActions?: InlineActions;
  onOpenAuthor?: () => void;
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

const sheetStore = { read: readPanels, save: savePanel };

const PanelsHost = ({
  panels, setPanel, sheet, sheetControl, manager, useSnapshot, showFeature, openDrawer, jumpToMessage, guideTarget, clearGuideTarget, requestSuggestions, fillSuggestion, fill, htmlHost,
  inspectActions, onOpenAuthor,
}: PanelsHostProps) => {
  const snapshot = useSnapshot();
  const inspecting = useInspectTarget();
  const { view, inset } = usePanelViewport();
  const bodies = new Map<PanelId, { title: string; body: ReactNode }>();
  if (panels.includes("help")) bodies.set("help", { title: HELP_COPY.heading, body: <Lazy fallback={null}><HelpHost authorView={snapshot.ui.authorView} snapshot={snapshot} onShowMe={showFeature}
    onOpenDoc={requestGuide} onClose={() => setPanel("help", false)} hosted ask={async (question) => (await askHost()).askInChat(manager, question)} /></Lazy> });
  if (panels.includes("guide")) bodies.set("guide", { title: GUIDE_COPY.title, body: <Lazy fallback={null}><GuideHost authorView={snapshot.ui.authorView} target={guideTarget()}
    onTargetSeen={clearGuideTarget} snapshot={snapshot} groupOpen={hasOpenGroup()} onShowMe={() => setPanel("guide", false)} /></Lazy> });
  if (panels.includes("inspector") && snapshot.ui.authorView && inspecting !== null) bodies.set("inspector", { title: "Inspector", body: <Lazy fallback={null}><MessageInspector
    view={snapshot.inline} messageId={inspecting} onStep={setInspectTarget} actions={inspectActions} onOpenAuthor={onOpenAuthor} /></Lazy> });
  return (
    <>
      {sheet.open && snapshot.ready && (
        <Lazy fallback={null}>
          <StorySheet snapshot={snapshot} tab={sheet.tab} popped={sheet.popped} onTab={sheetControl.setTab} onPop={sheetControl.setPopped} onClose={sheetControl.close} store={sheetStore}
            actions={{ onJump: jumpToMessage, openDrawer, openMemory: () => openDrawer("memory"), fill, requestSuggestions, fillSuggestion, htmlHost }} />
        </Lazy>
      )}
      {shownPanels(panels.filter((id) => bodies.has(id)), view).map((id) => {
        const entry = bodies.get(id);
        return entry ? <Panel key={id} id={id} title={entry.title} inset={inset} setPanel={setPanel}>{entry.body}</Panel> : null;
      })}
    </>
  );
};

export default PanelsHost;
