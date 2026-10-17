import { Component, Suspense, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { lazyRetry } from "@utils/lazyRetry";
import { GUIDE_COPY } from "@features/helpCopy";
import { TOUR_COPY } from "@features/tourCopy";
import { cancelInto, keepClose } from "./dialogEvents";
import { targetForDoc } from "@guide/links";

const GuideHost = lazyRetry(() => import("@guide/GuideHost"));

class ReaderBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <div data-so="guide-missing" role="alert">{GUIDE_COPY.missing}</div> : this.props.children;
  }
}

export interface TourGuideReaderProps {
  doc: string;
  authorView: boolean;
  onClose: () => void;
  reader?: ReactNode;
}

const noop = () => undefined;

export const TourGuideReader = ({ doc, authorView, onClose, reader }: TourGuideReaderProps) => {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const target = useMemo(() => targetForDoc(doc), [doc]);
  useLayoutEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
    closeButton.current?.focus();
  }, []);
  return (
    <dialog ref={dialog} id="so-tour-guide-reader" data-so="tour-guide-reader" aria-label={TOUR_COPY.guideTitle}
      onCancel={cancelInto(onClose)} onClose={keepClose}>
      <div className="so-tour-reader-frame">
        <div className="so-tour-reader-head">
          <strong>{TOUR_COPY.guideTitle}</strong>
          <button ref={closeButton} type="button" className="menu_button fa-solid fa-xmark" data-so="tour-guide-close"
            aria-label={TOUR_COPY.guideClose} title={TOUR_COPY.guideClose} onClick={onClose} />
        </div>
        <div className="so-tour-reader-body">
          {reader ?? <ReaderBoundary><Suspense fallback={null}><GuideHost key={doc} authorView={authorView} target={target} onTargetSeen={noop} /></Suspense></ReaderBoundary>}
        </div>
      </div>
    </dialog>
  );
};
