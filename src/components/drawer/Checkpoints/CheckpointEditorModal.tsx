import React, { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import CheckpointStudio from "./CheckpointStudio";
import type { Story } from "@utils/story-schema";
import type { NormalizedStory } from "@utils/story-validator";

type ValidationResult = { ok: true; story: NormalizedStory } | { ok: false; errors: string[] };
type ApplyResult = { ok: true; story: NormalizedStory } | { ok: false; errors: string[] };

type Props = {
  open: boolean;
  onClose: () => void;
  sourceStory: NormalizedStory | null | undefined;
  validate: (input: unknown) => ValidationResult;
  onApply: (story: Story) => Promise<ApplyResult> | ApplyResult;
  disabled?: boolean;
};

const PORTAL_ROOT_ID = "checkpoint-editor-modal-root";

const ensurePortalRoot = (): HTMLElement => {
  if (typeof document === "undefined") return {} as HTMLElement;
  const existing = document.getElementById(PORTAL_ROOT_ID);
  if (existing) return existing;
  const root = document.createElement("div");
  root.id = PORTAL_ROOT_ID;
  document.body.appendChild(root);
  return root;
};

const CheckpointEditorModal: React.FC<Props> = ({ open, onClose, sourceStory, validate, onApply, disabled }) => {
  const portalContainer = useMemo(() => {
    if (typeof document === "undefined") return null;
    const container = document.createElement("div");
    container.dataset.component = "checkpoint-editor-modal";
    return container;
  }, []);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open || !portalContainer) return undefined;
    const root = ensurePortalRoot();
    root.appendChild(portalContainer);

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeRef.current();
      }
    };

    document.addEventListener("keydown", handleKey);
    document.body.classList.add("overflow-hidden");

    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.classList.remove("overflow-hidden");
      if (portalContainer.parentElement === root) {
        root.removeChild(portalContainer);
        if (!root.childElementCount) {
          root.remove();
        }
      }
    };
  }, [open, portalContainer]);

  if (!open || !portalContainer) return null;

  const handleOverlayClick: React.MouseEventHandler<HTMLDivElement> = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/70 p-6"
      role="presentation"
      onClick={handleOverlayClick}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Checkpoint Editor"
        className="flex w-full max-h-[96vh] max-w-[1120px] flex-col rounded-lg border border-slate-800 bg-slate-950 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-200">Checkpoint Editor</h2>
          <button
            type="button"
            className="rounded p-1 text-lg text-slate-400 transition hover:text-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-600"
            aria-label="Close checkpoint editor"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto p-4">
          <CheckpointStudio
            sourceStory={sourceStory}
            validate={validate}
            onApply={onApply}
            disabled={disabled}
          />
        </div>
      </div>
    </div>,
    portalContainer,
  );
};

export default CheckpointEditorModal;
