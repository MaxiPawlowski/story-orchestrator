import React, { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import CheckpointStudio from "./index";
import type { Story } from "@utils/story-schema";
import type { NormalizedStory } from "@utils/story-validator";
import type { StoryLibraryEntry, SaveLibraryStoryResult, DeleteLibraryStoryResult } from "@components/context/StoryContext";

type ValidationResult = { ok: true; story: NormalizedStory } | { ok: false; errors: string[] };

type Props = {
  open: boolean;
  onClose: () => void;
  sourceStory: NormalizedStory | null | undefined;
  validate: (input: unknown) => ValidationResult;
  libraryEntries: StoryLibraryEntry[];
  selectedKey: string | null;
  selectedError: string | null;
  onSelectKey: (key: string) => void;
  onSaveStory: (story: Story, options?: { targetKey?: string; name?: string }) => Promise<SaveLibraryStoryResult>;
  onDeleteStory: (key: string) => Promise<DeleteLibraryStoryResult>;
  disabled?: boolean;
};

const PORTAL_ROOT_ID = "checkpoint-editor-modal-root";

const ensurePortalRoot = (): HTMLElement => {
  if (typeof document === "undefined") return {} as HTMLElement;
  const existing = document.getElementById(PORTAL_ROOT_ID);
  if (existing) return existing;
  const root = document.createElement("div");
  root.id = PORTAL_ROOT_ID;
  root.classList.add("fixed");
  root.style.top = "0";
  root.style.left = "0";
  root.style.width = "100%";
  root.style.height = "100%";
  root.style.zIndex = "9999";
  document.body.appendChild(root);
  return root;
};

const CheckpointStudioModal: React.FC<Props> = ({
  open,
  onClose,
  sourceStory,
  validate,
  libraryEntries,
  selectedKey,
  selectedError,
  onSelectKey,
  onSaveStory,
  onDeleteStory,
  disabled,
}) => {
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
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-[color:color-mix(in_srgb,var(--SmartThemeBlurTintColor)_70%,transparent)]"
      role="presentation"
      onClick={handleOverlayClick}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Checkpoint Editor"
        className="flex w-full max-h-[96vh] max-w-[1120px] flex-col rounded-lg border border-slate-800 bg-[var(--SmartThemeBlurTintColor)] shadow-2xl relative"
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-0 absolute top-[10px] w-[50px] right-0">
          <button
            type="button"
            className="rounded p-1 border-none bg-transparent text-lg text-slate-400 transition hover:text-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-600"
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
            libraryEntries={libraryEntries}
            selectedKey={selectedKey}
            selectedError={selectedError}
            onSelectKey={onSelectKey}
            onSaveStory={onSaveStory}
            onDeleteStory={onDeleteStory}
            disabled={disabled}
          />
        </div>
      </div>
    </div>,
    portalContainer,
  );
};

export default CheckpointStudioModal;
