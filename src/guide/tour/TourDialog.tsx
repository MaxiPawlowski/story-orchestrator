import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { TOUR_COPY } from "@features/tourCopy";
import type { WorkspaceIntent } from "@runtime/workspaceNavigation";
import { TOUR_VIEWS, type TourView } from "./request";
import { stepsOf, TOUR_ROUTES } from "./tourRoutes";
import { TourFinder } from "./TourFinder";
import { TourGuideReader } from "./TourGuideReader";
import type { TourProgress, TourProgressStore } from "./tourProgress";
import { TourStep } from "./TourStep";
import "./tour.css";

export interface TourDialogProps {
  initialView?: TourView | null;
  store: TourProgressStore;
  authorView: boolean;
  onShow: (intent: WorkspaceIntent) => void;
  onClose: () => void;
  reader?: (doc: string) => ReactNode;
}

const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

const SCOPES: Record<TourView, string> = { player: TOUR_COPY.playerScope, author: TOUR_COPY.authorScope, setup: TOUR_COPY.setupScope };

const clamp = (progress: TourProgress, view: TourView) => Math.min(progress.current[view], stepsOf(view).length - 1);

export const TourDialog = ({ initialView, store, authorView, onShow, onClose, reader }: TourDialogProps) => {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const [progress, setProgress] = useState<TourProgress>(() => {
    const saved = store.read();
    return initialView ? { ...saved, view: initialView } : saved;
  });
  const [finding, setFinding] = useState(false);
  const [readerDoc, setReaderDoc] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const view = progress.view;
  const steps = stepsOf(view);
  const index = clamp(progress, view);
  const step = steps[index];
  const done = progress.done[view];

  useEffect(() => {
    const element = dialog.current, previous = opener.current;
    if (element && !element.open) element.showModal();
    closeButton.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);

  const update = useCallback((change: (current: TourProgress) => TourProgress) => {
    setProgress((current) => {
      const next = change(current);
      setSaveFailed(!store.write(next));
      return next;
    });
  }, [store]);

  useEffect(() => { if (initialView) update((current) => ({ ...current, view: initialView })); }, [initialView, update]);

  useEffect(() => { document.getElementById("so-tour-content")?.scrollTo?.(0, 0); }, [view, index]);

  const goTo = (nextView: TourView, nextIndex: number) => update((current) => ({ ...current, view: nextView, current: { ...current.current, [nextView]: nextIndex } }));
  const markTried = (tried: boolean) => update((current) => {
    const list = current.done[view].filter((id) => id !== step.id);
    return { ...current, done: { ...current.done, [view]: tried ? [...list, step.id] : list } };
  });
  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    const target = event.target as HTMLElement;
    if (event.key !== "/" || finding || readerDoc || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
    event.preventDefault();
    setFinding(true);
  };
  const triedCount = steps.filter((entry) => done.includes(entry.id)).length;
  let number = 0;

  return (
    <dialog ref={dialog} id="so-tour-modal" data-so="tour" data-view={view} aria-labelledby="so-tour-heading" onKeyDown={onKeyDown}
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className="so-tour-frame">
        <header className="so-tour-header">
          <div><h1 id="so-tour-heading">{TOUR_COPY.title}</h1><span className="so-tour-scope">{SCOPES[view]}</span></div>
          <div className="so-tour-header-actions">
            <div className="so-tour-views" role="group" aria-label={TOUR_COPY.views}>
              {TOUR_VIEWS.map((entry) => <button key={entry} type="button" data-so={`tour-view-${entry}`} aria-pressed={view === entry}
                onClick={() => update((current) => ({ ...current, view: entry }))}>{TOUR_COPY[entry]}</button>)}
            </div>
            <button type="button" className="so-tour-find" data-so="tour-find" aria-haspopup="dialog" title={TOUR_COPY.findHint} onClick={() => setFinding(true)}>
              <span className="fa-solid fa-magnifying-glass" aria-hidden="true" /> {TOUR_COPY.find} <kbd>/</kbd></button>
            <button ref={closeButton} type="button" className="menu_button" data-so="tour-close" aria-label={TOUR_COPY.close} onClick={onClose}>{TOUR_COPY.findClose}</button>
          </div>
        </header>
        <div className="so-tour-body">
          <nav className="so-tour-nav" aria-label={TOUR_COPY.steps}>
            {TOUR_ROUTES[view].groups.map((group) => <div key={group.title} className="so-tour-nav-group">
              <div className="so-tour-nav-title">{group.title}</div>
              {group.steps.map((entry) => {
                const at = number++;
                return <button key={entry.id} type="button" data-so="tour-nav-step" data-step={entry.id} aria-current={at === index ? "step" : undefined}
                  className={done.includes(entry.id) ? "so-tour-done" : undefined} onClick={() => goTo(view, at)}>
                  <span className="so-tour-num">{String(at + 1).padStart(2, "0")}</span>{entry.title}<span className="so-tour-dot" aria-hidden="true" />
                </button>;
              })}
            </div>)}
            <div className="so-tour-meter">{fill(TOUR_COPY.triedCount, { done: triedCount, total: steps.length })}
              <span role="progressbar" aria-label={fill(TOUR_COPY.triedCount, { done: triedCount, total: steps.length })} aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={triedCount}>
                <span style={{ width: `${(triedCount / steps.length) * 100}%` }} /></span></div>
          </nav>
          <main id="so-tour-content" className="so-tour-content" aria-live="polite">
            {saveFailed && <p className="so-tour-hint" role="status">{TOUR_COPY.storageError}</p>}
            <TourStep step={step} index={index} total={steps.length} done={done.includes(step.id)} nextTitle={steps[index + 1]?.title}
              onTried={markTried} onBack={() => goTo(view, index - 1)} onNext={() => goTo(view, index + 1)}
              onReadMore={setReaderDoc} onShow={onShow} />
          </main>
        </div>
      </div>
      <TourFinder open={finding} onClose={() => setFinding(false)} onPick={(nextView, nextIndex) => { setFinding(false); goTo(nextView, nextIndex); }} />
      {readerDoc && <TourGuideReader doc={readerDoc} authorView={authorView || view !== "player"} reader={reader?.(readerDoc)} onClose={() => setReaderDoc(null)} />}
    </dialog>
  );
};

export default TourDialog;
