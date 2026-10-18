import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import { TOUR_COPY } from "@features/tourCopy";
import { log } from "@utils/log";
import { TOUR_VIEWS, type TourView } from "./request";
import { COACH_FLOWS, copyOf, stopIndex } from "./coachFlows";
import { boxOf, findTarget, inView, isNarrow, place, ringBox, topModal, type Box, type Found, type Placement, type Size } from "./coachGeometry";
import type { CoachHost, CoachStop } from "./coachTypes";
import "./coach.css";

export interface CoachMarksProps {
  view: TourView | null;
  stop?: string;
  host: CoachHost;
  onClose: () => void;
  findTimeoutMs?: number;
}

type Search = Found | { state: "looking" };

const POLL_MS = 100;
const POPOVER: Record<string, string> = { popover: "manual" };
const GUESS: Size = { width: 340, height: 190 };

const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

const viewportOf = (): Size => ({ width: window.visualViewport?.width ?? window.innerWidth, height: window.visualViewport?.height ?? window.innerHeight });

const sameBox = (a: Box | null, b: Box | null) => a === b || Boolean(a && b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height);

const sameSize = (a: Size, b: Size) => a.width === b.width && a.height === b.height;

const useTargetSearch = (current: CoachStop | null, host: CoachHost, findTimeoutMs: number) => {
  const [search, setSearch] = useState<Search>({ state: "looking" });
  const [attempt, setAttempt] = useState(0);
  const currentRef = useRef(current);
  currentRef.current = current;

  useEffect(() => {
    if (current) host.run(current.action);
    setAttempt((value) => value + 1);
  }, [current, host]);

  useEffect(() => {
    const anchors = currentRef.current?.anchors;
    if (!anchors) { setSearch({ state: "missing" }); return; }
    setSearch({ state: "looking" });
    const started = Date.now();
    let timer = 0;
    const look = () => {
      const result = findTarget(document, anchors);
      if (result.state === "found" && !inView(boxOf(result.element), viewportOf())) result.element.scrollIntoView?.({ block: isNarrow(viewportOf()) ? "start" : "center" });
      if (result.state === "found" || Date.now() - started >= findTimeoutMs) { setSearch(result); return; }
      timer = window.setTimeout(look, POLL_MS);
    };
    timer = window.setTimeout(look, 0);
    return () => window.clearTimeout(timer);
  }, [attempt, findTimeoutMs]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { search, retry };
};

const useLayout = (found: Extract<Found, { state: "found" }> | null, retry: () => void) => {
  const [target, setTarget] = useState<Box | null>(null);
  const [viewport, setViewport] = useState<Size>(viewportOf);
  const [portal, setPortal] = useState<HTMLElement>(() => topModal(document));

  const measure = useCallback(() => {
    setViewport((previous) => { const next = viewportOf(); return sameSize(previous, next) ? previous : next; });
    setPortal(topModal(document));
    if (!found) { setTarget(null); return; }
    if (!found.element.isConnected) { retry(); return; }
    const box = boxOf(found.element);
    setTarget((previous) => (sameBox(previous, box) ? previous : box));
  }, [found, retry]);

  useEffect(() => {
    let frame = 0;
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(() => { frame = 0; measure(); }); };
    measure();
    const viewportEvents = window.visualViewport;
    window.addEventListener("resize", schedule);
    document.addEventListener("scroll", schedule, true);
    viewportEvents?.addEventListener("resize", schedule);
    viewportEvents?.addEventListener("scroll", schedule);
    const mutations = typeof MutationObserver === "undefined" ? null : new MutationObserver(schedule);
    mutations?.observe(document.body, { childList: true, subtree: true });
    const sizes = found && typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    if (found) sizes?.observe(found.element);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("scroll", schedule, true);
      viewportEvents?.removeEventListener("resize", schedule);
      viewportEvents?.removeEventListener("scroll", schedule);
      mutations?.disconnect();
      sizes?.disconnect();
    };
  }, [measure, found]);

  return { target, viewport, portal };
};

const usePopover = (layer: RefObject<HTMLDivElement>, portal: HTMLElement) => {
  useLayoutEffect(() => {
    const element = layer.current as (HTMLDivElement & { showPopover?: () => void }) | null;
    if (!element || typeof element.showPopover !== "function" || element.matches(":popover-open")) return;
    try { element.showPopover(); } catch (error) { log.warn("the tour card could not open above the page", error); }
  }, [layer, portal]);
};

const useEscapeAndFocus = (onClose: () => void) => {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close.current();
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return () => close.current();
};

const noteFor = (search: Search, missing: string): string | null => {
  if (search.state === "looking") return TOUR_COPY.looking;
  if (search.state === "missing") return `${TOUR_COPY.missing} ${missing}`.trim();
  if (search.state === "hidden") return `${TOUR_COPY.hidden} ${missing}`.trim();
  return null;
};

interface CardProps {
  view: TourView | null;
  index: number;
  search: Search;
  placement: Placement;
  primary: RefObject<HTMLButtonElement>;
  card: RefObject<HTMLElement>;
  onIndex: (index: number) => void;
  onPick: (view: TourView) => void;
  onClose: () => void;
}

const CoachCard = ({ view, index, search, placement, primary, card, onIndex, onPick, onClose }: CardProps) => {
  const flow = view ? COACH_FLOWS[view] : null;
  const current = flow?.stops[index] ?? null;
  const copy = view && current ? copyOf(view, current.id) : null;
  const last = flow ? index === flow.stops.length - 1 : false;
  const alt = search.state === "found" && search.anchor.alt && copy?.alt;
  const note = view ? noteFor(search, copy?.missing ?? "") : null;
  const style: CSSProperties = placement.mode === "float" ? { top: placement.top, left: placement.left } : {};
  return (
    <section ref={card} className="so-coach-card" role="dialog" aria-modal="false" aria-labelledby="so-coach-title" aria-describedby="so-coach-text" style={style}
      data-side={placement.mode === "float" ? placement.side : undefined}>
      {flow && <div className="so-coach-count" data-so="coach-count">{fill(TOUR_COPY.stepOf, { n: index + 1, total: flow.stops.length })}</div>}
      <h2 id="so-coach-title">{copy?.title ?? TOUR_COPY.title}</h2>
      <p id="so-coach-text">{alt || (copy?.text ?? TOUR_COPY.intro)}</p>
      {note && <p className="so-coach-note" data-so="coach-note" role="status">{note}</p>}
      {view ? (
        <div className="so-coach-actions">
          <button type="button" className="menu_button" data-so="coach-skip" onClick={onClose}>{TOUR_COPY.skip}</button>
          <span className="so-coach-spacer" />
          <button type="button" className="menu_button" data-so="coach-back" disabled={index === 0} onClick={() => onIndex(index - 1)}>{TOUR_COPY.back}</button>
          <button ref={primary} type="button" className="menu_button so-coach-primary" data-so="coach-next"
            onClick={() => (last ? onClose() : onIndex(index + 1))}>{last ? TOUR_COPY.done : TOUR_COPY.next}</button>
        </div>
      ) : (
        <div className="so-coach-actions so-coach-choices">
          {TOUR_VIEWS.map((entry, at) => <button key={entry} ref={at === 0 ? primary : undefined} type="button" className="menu_button so-coach-primary"
            data-so={`coach-pick-${entry}`} onClick={() => onPick(entry)}>{TOUR_COPY[entry]}</button>)}
          <button type="button" className="menu_button" data-so="coach-skip" onClick={onClose}>{TOUR_COPY.close}</button>
        </div>
      )}
    </section>
  );
};

export const CoachMarks = ({ view: initialView, stop, host, onClose, findTimeoutMs = 3000 }: CoachMarksProps) => {
  const [view, setView] = useState<TourView | null>(initialView);
  const [index, setIndex] = useState(() => (initialView ? stopIndex(initialView, stop) : 0));
  const [bubble, setBubble] = useState<Size>(GUESS);
  const layer = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const current = view ? COACH_FLOWS[view].stops[index] ?? null : null;
  const { search, retry } = useTargetSearch(current, host, findTimeoutMs);
  const found = search.state === "found" ? search : null;
  const { target, viewport, portal } = useLayout(found, retry);
  const close = useEscapeAndFocus(onClose);
  usePopover(layer, portal);

  useLayoutEffect(() => {
    const element = card.current;
    if (!element) return;
    const next = { width: element.offsetWidth || GUESS.width, height: element.offsetHeight || GUESS.height };
    setBubble((previous) => (sameSize(previous, next) ? previous : next));
  }, [view, index, search.state, viewport.width]);

  useEffect(() => { if (search.state !== "looking") primary.current?.focus({ preventScroll: true }); }, [search.state, view, index, portal]);

  const placement = place(found ? target : null, bubble, viewport);
  const ring = found && target ? ringBox(target, viewport) : null;

  return createPortal(
    <div ref={layer} id="so-coach" {...POPOVER} data-flow={view ?? "choose"} data-stop={current?.id ?? ""} data-state={view ? search.state : "choose"}
      data-mode={placement.mode} data-edge={placement.mode === "sheet" ? placement.edge : undefined}>
      {ring && <div className="so-coach-ring" data-so="coach-ring" aria-hidden="true" style={{ top: ring.top, left: ring.left, width: ring.width, height: ring.height }} />}
      <CoachCard view={view} index={index} search={search} placement={placement} primary={primary} card={card} onIndex={setIndex}
        onPick={(entry) => { setIndex(0); setView(entry); }} onClose={close} />
    </div>,
    portal,
  );
};

export default CoachMarks;
