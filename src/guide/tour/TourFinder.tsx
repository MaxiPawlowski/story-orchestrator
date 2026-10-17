import { useEffect, useRef, useState } from "react";
import { TOUR_COPY } from "@features/tourCopy";
import { cancelInto, keepClose } from "./dialogEvents";
import type { TourView } from "./request";
import { findSteps, TOUR_ROUTES } from "./tourRoutes";

export interface TourFinderProps {
  open: boolean;
  onPick: (view: TourView, index: number) => void;
  onClose: () => void;
}

export const TourFinder = ({ open, onPick, onClose }: TourFinderProps) => {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      setQuery("");
      element.showModal();
      input.current?.focus();
    } else if (!open && element.open) element.close();
  }, [open]);
  const hits = findSteps(query);
  return (
    <dialog ref={dialog} id="so-tour-finder" data-so="tour-finder" aria-label={TOUR_COPY.find}
      onCancel={cancelInto(onClose)} onClose={keepClose}>
      <div className="so-tour-finder-top">
        <label className="sr-only" htmlFor="so-tour-finder-input">{TOUR_COPY.find}</label>
        <input ref={input} id="so-tour-finder-input" type="search" autoComplete="off" value={query} placeholder={TOUR_COPY.findPlaceholder} onChange={(event) => setQuery(event.target.value)} />
        <button type="button" className="menu_button" onClick={onClose}>{TOUR_COPY.findClose}</button>
      </div>
      <div className="so-tour-finder-list">
        {hits.length ? hits.map(({ view, index, step }) => (
          <button key={`${view}-${step.id}`} type="button" className="so-tour-finder-item" data-so="tour-finder-item" data-step={step.id}
            onClick={() => onPick(view, index)}>
            <span className="so-tour-finder-name">{step.title}</span><span className="so-tour-finder-view">{TOUR_ROUTES[view].label}</span>
            {step.where && <span className="so-tour-finder-where">{step.where}</span>}
          </button>
        )) : <p className="so-tour-hint" role="status">{TOUR_COPY.findEmpty}</p>}
      </div>
    </dialog>
  );
};
