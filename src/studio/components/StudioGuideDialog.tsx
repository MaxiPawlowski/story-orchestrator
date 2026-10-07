import React, { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { lazyRetry } from "@utils/lazyRetry";
import { GUIDE_COPY } from "@features/helpCopy";
import { targetForDoc } from "@guide/links";

const GuideHost = lazyRetry(() => import("@guide/GuideHost"));

interface StudioGuideDialogProps {
  doc: string;
  onClose: () => void;
}

const noop = () => undefined;

class ReaderBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <div data-so="guide-missing" role="alert" className="text-xs">{GUIDE_COPY.missing}</div> : this.props.children;
  }
}

const StudioGuideDialog: React.FC<StudioGuideDialogProps> = ({ doc, onClose }) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const target = useMemo(() => targetForDoc(doc), [doc]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    closeRef.current?.focus();
  }, []);

  const close = () => {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    else onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      id="so-studio-guide-reader"
      data-so="studio-guide-reader"
      aria-label={GUIDE_COPY.title}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key !== "Escape") return;
        event.preventDefault();
        close();
      }}
      onCancel={(event) => { event.stopPropagation(); event.preventDefault(); close(); }}
      onClose={(event) => { event.stopPropagation(); onClose(); }}
    >
      <div className="st-panel flex h-[80dvh] w-[min(960px,94dvw)] flex-col gap-2 overflow-hidden p-3 shadow-lg">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">{GUIDE_COPY.title}</span>
          <button ref={closeRef} type="button" id="so-studio-guide-close" data-so="studio-guide-close" className="menu_button fa-solid fa-xmark"
            aria-label={GUIDE_COPY.close} title={GUIDE_COPY.close} onClick={close} />
        </div>
        <div className="min-h-0 flex-1">
          <ReaderBoundary>
            <Suspense fallback={null}>
              <GuideHost key={doc} authorView target={target} onTargetSeen={noop} />
            </Suspense>
          </ReaderBoundary>
        </div>
      </div>
    </dialog>
  );
};

export default StudioGuideDialog;
