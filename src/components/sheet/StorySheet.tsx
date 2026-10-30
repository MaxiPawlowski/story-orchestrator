import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Lazy } from "@components/Lazy";
import type { RuntimeSnapshot } from "@runtime/types";
import type { WidgetDrawerTab } from "@engine/index";
import { pickSheetTab, sheetTabs, type SheetTab } from "@runtime/storySheet";
import {
  SHEET_DOCK_KEY, SHEET_WIDTH, SHEET_WINDOW_KEY, docked, nearestSnap, nextSnap, panelFits, panelGeometry, sheetDock, sheetSnaps, type PanelGeometry, type SheetSnap, type Viewport,
} from "@runtime/panelGeometry";
import type { SuggestionAsk, SuggestionOutcome } from "@runtime/suggestionsHost";
import type { WriteResult } from "@utils/writeResult";
import { SHEET_TEXT } from "@features/sheetCopy";
import { IconButton } from "@components/ui/IconButton";
import { Tab, TabList, TabPanel, Tabs } from "@components/ui/Tabs";
import { PanelFrame } from "../panels/PanelFrame";
import type { HtmlPanelHost } from "./tabs/WidgetTab";
import { SheetTabBody as TabBody } from "./SheetTabBody";

export interface SheetRoom {
  view: Viewport;
  chatRight: number;
  chatTop: number;
  formTop: number;
  lastReply: number;
}

export interface StorySheetActions {
  onJump?: (messageId: number) => void;
  openDrawer?: (tab?: WidgetDrawerTab) => void;
  openMemory?: () => void;
  fill?: (text: string) => WriteResult;
  requestSuggestions?: (again: number) => Promise<SuggestionOutcome>;
  fillSuggestion?: (ask: SuggestionAsk, text: string) => WriteResult;
  htmlHost?: HtmlPanelHost;
}

export interface StorySheetStore {
  read: () => Record<string, PanelGeometry>;
  save: (id: string, geometry: PanelGeometry) => void;
}

export interface StorySheetProps {
  snapshot: RuntimeSnapshot;
  tab: SheetTab | null;
  popped: boolean;
  onTab: (tab: SheetTab) => void;
  onPop: (popped: boolean) => void;
  onClose: () => void;
  actions?: StorySheetActions;
  room?: SheetRoom;
  store?: StorySheetStore;
}

const measureRoom = (): SheetRoom => {
  const view = { width: window.innerWidth, height: window.innerHeight };
  const chat = document.getElementById("sheld")?.getBoundingClientRect();
  const form = document.getElementById("form_sheld")?.getBoundingClientRect();
  const log = document.getElementById("chat");
  const last = [...(log?.querySelectorAll<HTMLElement>(".mes") ?? [])].at(-1)?.getBoundingClientRect();
  return {
    view, chatRight: chat?.right ?? view.width, chatTop: log?.getBoundingClientRect().top ?? chat?.top ?? 0, formTop: form?.top ?? view.height, lastReply: last?.height ?? 0,
  };
};

const useRoom = (fixed?: SheetRoom): SheetRoom => {
  const [room, setRoom] = useState<SheetRoom>(() => fixed ?? measureRoom());
  useEffect(() => {
    if (fixed) { setRoom(fixed); return undefined; }
    const measure = () => setRoom(measureRoom());
    const form = document.getElementById("form_sheld");
    const log = document.getElementById("chat");
    const resize = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    if (form) resize?.observe(form);
    const replies = typeof MutationObserver === "function" && log ? new MutationObserver(measure) : null;
    if (log) replies?.observe(log, { childList: true });
    window.addEventListener("resize", measure);
    return () => { resize?.disconnect(); replies?.disconnect(); window.removeEventListener("resize", measure); };
  }, [fixed]);
  return room;
};

const memoryStore: StorySheetStore = { read: () => ({}), save: () => {} };

const SheetTabs = ({ snapshot, tab, onTab, actions, end }: { snapshot: RuntimeSnapshot; tab: SheetTab; onTab: (tab: SheetTab) => void; actions: StorySheetActions; end?: ReactNode }) => {
  const tabs = sheetTabs(snapshot);
  return (
    <Tabs value={tab} onChange={(value) => onTab(value as SheetTab)} idPrefix="so-sheet-tab-">
      <div className="so-sheet-head">
        <TabList label={SHEET_TEXT.tabsLabel} className="so-sheet-tabs">
          {tabs.map((entry) => (
            <Tab key={entry.id} value={entry.id} controls={`so-sheet-${entry.id}`} data-so="sheet-tab" data-tab={entry.id}>
              <i className={`fa-solid ${entry.icon}`} aria-hidden="true" /><span>{entry.label}</span>
            </Tab>
          ))}
        </TabList>
        {end && <div className="so-sheet-actions">{end}</div>}
      </div>
      <TabPanel id={`so-sheet-${tab}`} data-so="sheet-panel" data-tab={tab} className="so-sheet-panel">
        <Lazy><TabBody key={tab} tab={tab} snapshot={snapshot} actions={actions} /></Lazy>
      </TabPanel>
    </Tabs>
  );
};

type Drag = { kind: "width"; from: number; start: number } | { kind: "height"; from: number; start: number };

export function StorySheet({ snapshot, tab, popped, onTab, onPop, onClose, actions = {}, room: fixedRoom, store = memoryStore }: StorySheetProps) {
  const room = useRoom(fixedRoom);
  const tabs = sheetTabs(snapshot);
  const shown = pickSheetTab(tabs, tab);
  const [width, setWidth] = useState(() => store.read()[SHEET_DOCK_KEY]?.w ?? SHEET_WIDTH.initial);
  const [snap, setSnap] = useState<SheetSnap>("half");
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const drag = useRef<Drag | null>(null);
  const mobile = docked(room.view);
  const mode = mobile ? "bottom" : popped ? "window" : "dock";
  useEffect(() => { if (!shown) onClose(); }, [shown, onClose]);
  if (!shown) return null;

  const snaps = sheetSnaps(room.view.height, room.formTop, room.chatTop, room.lastReply);
  const dock = sheetDock(room.view.width, room.chatRight, width);

  const begin = (kind: Drag["kind"]) => (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    drag.current = kind === "width" ? { kind, from: dock.width, start: event.clientX } : { kind, from: dragHeight ?? snaps[snap], start: event.clientY };
    let moved = false;
    let last = drag.current.from;
    const move = (next: PointerEvent) => {
      const current = drag.current;
      if (!current) return;
      moved = true;
      last = current.kind === "width" ? current.from + (current.start - next.clientX) : current.from + (current.start - next.clientY);
      if (current.kind === "width") setWidth(Math.max(SHEET_WIDTH.min, Math.min(SHEET_WIDTH.max, last)));
      else setDragHeight(Math.max(snaps.peek, Math.min(snaps.full, last)));
    };
    const up = () => {
      const current = drag.current;
      drag.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (current?.kind === "width") store.save(SHEET_DOCK_KEY, { x: 0, y: 0, w: Math.max(SHEET_WIDTH.min, Math.min(SHEET_WIDTH.max, Math.round(last))), h: 0 });
      if (current?.kind === "height") {
        setDragHeight(null);
        setSnap(moved ? nearestSnap(last, snaps) : nextSnap(snap));
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const onKey = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.stopPropagation();
    onClose();
  };

  const close = <IconButton id="so-sheet-close" data-so="panel-close" icon="fa-xmark" size="sm" label={SHEET_TEXT.close} onClick={onClose} />;
  const body = (end?: ReactNode) => <SheetTabs snapshot={snapshot} tab={shown} onTab={onTab} actions={actions} end={end} />;

  if (mode === "window") {
    return (
      <PanelFrame id={SHEET_WINDOW_KEY} title={SHEET_TEXT.title} geometry={panelGeometry(store.read(), SHEET_WINDOW_KEY, room.view)} fit={panelFits(store.read(), SHEET_WINDOW_KEY)}
        onChange={(geometry) => store.save(SHEET_WINDOW_KEY, geometry)}
        onClose={onClose} viewport={fixedRoom?.view}
        actions={<IconButton data-so="sheet-dock" icon="fa-table-columns" size="sm" label={SHEET_TEXT.dock} onClick={() => onPop(false)} />}>
        <div id="so-sheet" data-so="sheet" data-mode={mode} className="so-sheet so-sheet--window">{body()}</div>
      </PanelFrame>
    );
  }

  const height = dragHeight ?? snaps[snap];
  const style: CSSProperties = mode === "bottom"
    ? { height, top: Math.max(0, Math.round(room.formTop - height)) }
    : { width: dock.width, top: Math.max(0, room.chatTop) };
  return (
    <section id="so-sheet" data-so="sheet" data-mode={mode} data-snap={mode === "bottom" ? snap : undefined} data-overlay={mode === "dock" ? dock.overlay : undefined}
      role="complementary" aria-label={SHEET_TEXT.title} className={`so-sheet so-sheet--${mode}`} style={style} onKeyDown={onKey}>
      {mode === "bottom"
        ? <button type="button" data-so="sheet-grip" className="so-sheet-grip" aria-label={SHEET_TEXT.grip} title={SHEET_TEXT.grip} onPointerDown={begin("height")}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSnap(nextSnap(snap)); } }}><span aria-hidden="true" /></button>
        : <div data-so="sheet-resize" className="so-sheet-resize" aria-hidden="true" title={SHEET_TEXT.resize} onPointerDown={begin("width")} />}
      {body(
        <>
          {mode === "dock" && <IconButton data-so="sheet-pop" icon="fa-up-right-from-square" size="sm" label={SHEET_TEXT.popOut} onClick={() => onPop(true)} />}
          {close}
        </>,
      )}
    </section>
  );
}

export default StorySheet;
