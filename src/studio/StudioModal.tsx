import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { listBackgrounds, listGlobalLorebooks, listGroupMembers, listPersonas, showConfirmPopup } from "@services/STAPI";
import type { AuthoringStageInput, CopilotStage, ProposalResult } from "@copilot/index";
import { useDraftStore } from "./draft";
import { setStoryField } from "./mutations";
import QualityEditor from "./components/QualityEditor";
import CheckpointEditor from "./components/CheckpointEditor";
import TransitionEditor from "./components/TransitionEditor";
import DiagnosticsPanel from "./components/DiagnosticsPanel";
import RosterEditor from "./components/RosterEditor";
import StoryEditor from "./components/StoryEditor";
import StudioGraph from "./components/StudioGraph";
import StudioCopilot, { type WizardHost } from "./components/StudioCopilot";
import StudioToolbar, { type StudioSaveHandler } from "./components/StudioToolbar";
import { GateReplayContext } from "./replayContext";
import type { GateReplaySource } from "./gateReplay";

export type StudioTab = "graph" | "story" | "qualities" | "checkpoints" | "transitions" | "roster" | "diagnostics" | "copilot";

export interface StudioOpenIntent {
  tab?: StudioTab;
  stage?: CopilotStage;
  missing?: { personas?: string[]; members?: string[]; lorebooks?: string[] };
  fromChat?: boolean;
}

const BASE_TABS: Array<{ id: StudioTab; label: string }> = [
  { id: "graph", label: "Graph" },
  { id: "story", label: "Story" },
  { id: "qualities", label: "Qualities" },
  { id: "checkpoints", label: "Checkpoints" },
  { id: "transitions", label: "Transitions" },
  { id: "roster", label: "Roster" },
  { id: "diagnostics", label: "Diagnostics" },
];

export const STUDIO_TAB_IDS: StudioTab[] = [...BASE_TABS.map((entry) => entry.id), "copilot"];

export interface StudioHostOptions {
  personaNames: string[];
  memberNames: string[];
  lorebookNames: string[];
  backgroundNames: string[];
}

// The pickers are a convenience, never a dependency: a Studio opened with no host around still
// authors every field by hand.
const readHostOptions = (): StudioHostOptions => {
  const safe = (read: () => string[]) => { try { return read(); } catch { return []; } };
  return { personaNames: safe(listPersonas), memberNames: safe(listGroupMembers), lorebookNames: safe(listGlobalLorebooks), backgroundNames: safe(listBackgrounds) };
};

type Props = {
  onClose: () => void;
  copilotEnabled?: boolean;
  runCopilotStage?: (input: AuthoringStageInput) => Promise<ProposalResult>;
  onSaved?: StudioSaveHandler;
  hostOptions?: StudioHostOptions;
  wizardHost?: WizardHost;
  intent?: StudioOpenIntent;
  replay?: GateReplaySource | null;
};

type TabEntry = { id: StudioTab; label: string };

// v2.3 plan 09 (the review's keyboard trace: ArrowRight on the tablist stayed on the tab it was
// already on, and nothing linked a tab to its panel). APG tabs pattern: one tab stop for the list,
// arrows move focus AND selection with wrapping, Home/End jump to the ends, and the panel says which
// tab it belongs to. ST's `a11y.js` rewrites `role="button"` onto `.menu_button` in the live DOM, so
// anything driving this must select by the tablist, never by the role.
const TAB_KEYS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 };

const FOCUSABLE = "button, input, select, textarea, [tabindex]:not([tabindex='-1'])";

const focusTrapHandler = (panelRef: React.MutableRefObject<HTMLDivElement | null>, requestClose: () => Promise<void>) => (event: React.KeyboardEvent) => {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    void requestClose();
    return;
  }
  if (event.key !== "Tab") return;
  const panel = panelRef.current;
  if (!panel) return;
  const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => !element.hasAttribute("disabled") && element.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
};

interface HeaderProps {
  titleRef: React.MutableRefObject<HTMLInputElement | null>;
  onRequestClose: () => void;
}

const StudioHeader = ({ titleRef, onRequestClose }: HeaderProps) => {
  const draft = useDraftStore((state) => state.draft);
  const dirty = useDraftStore((state) => state.dirty);
  const errors = useDraftStore((state) => state.errors);
  const diagnostics = useDraftStore((state) => state.diagnostics);
  const mutate = useDraftStore((state) => state.mutate);
  const issueCount = diagnostics.filter((entry) => entry.severity !== "info").length;
  const errorWord = errors.length === 1 ? "error" : "errors";
  return (
    <div className="st-panel-header flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
      <span className="font-semibold whitespace-nowrap">Checkpoint Studio</span>
      <input
        ref={titleRef}
        className="text_pole st-input min-w-0 flex-1"
        aria-label="Story title"
        value={draft.title}
        onChange={(event) => mutate((current) => setStoryField(current, "title", event.target.value))}
      />
      {dirty ? <span className="st-pill px-2 py-0.5 text-[11px]" aria-label="Unsaved changes">Unsaved</span> : null}
      {errors.length > 0 ? (
        <span className="st-alert-error rounded px-2 py-0.5 text-[11px]" aria-label={`${errors.length} validation ${errorWord}`}>{errors.length} {errorWord}</span>
      ) : null}
      {issueCount > 0 ? (
        <span className="st-pill px-2 py-0.5 text-[11px]" aria-label={`${issueCount} diagnostics`}>{issueCount} {issueCount === 1 ? "issue" : "issues"}</span>
      ) : null}
      <button type="button" className="st-button secondary" onClick={onRequestClose} aria-label="Close studio">Close</button>
    </div>
  );
};

interface TabListProps {
  tabs: TabEntry[];
  activeTab: StudioTab;
  onSelect: (tab: StudioTab) => void;
}

const StudioTabList = ({ tabs, activeTab, onSelect }: TabListProps) => {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const onTablistKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = TAB_KEYS[event.key] ?? (event.key === "Home" ? -Infinity : event.key === "End" ? Infinity : null);
    if (step === null) return;
    event.preventDefault();
    const last = tabs.length - 1;
    const current = tabs.findIndex((entry) => entry.id === activeTab);
    const next = step === -Infinity ? 0 : step === Infinity ? last : (current + step + tabs.length) % tabs.length;
    onSelect(tabs[next].id);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2" role="tablist" aria-label="Studio sections" onKeyDown={onTablistKeyDown}>
      {tabs.map((entry, index) => (
        <button
          key={entry.id}
          ref={(node) => { tabRefs.current[index] = node; }}
          id={`so-studio-tab-${entry.id}`}
          type="button"
          role="tab"
          aria-selected={activeTab === entry.id}
          aria-controls="so-studio-tabpanel"
          tabIndex={activeTab === entry.id ? 0 : -1}
          className={`st-tab rounded px-3 py-1 text-sm ${activeTab === entry.id ? "st-tab-active" : ""}`}
          onClick={() => onSelect(entry.id)}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
};

interface TabContentProps {
  activeTab: StudioTab;
  options: StudioHostOptions;
  copilotEnabled: boolean;
  runCopilotStage?: (input: AuthoringStageInput) => Promise<ProposalResult>;
  wizardHost?: WizardHost;
  intent?: StudioOpenIntent;
  onSelect: (tab: StudioTab) => void;
}

const GraphTab = ({ copilotEnabled, onSelect }: { copilotEnabled: boolean; onSelect: (tab: StudioTab) => void }) => {
  const draft = useDraftStore((state) => state.draft);
  // An untouched draft is the one moment where "start with the wizard" is unambiguously the right
  // next step, so the empty graph offers it instead of an empty canvas.
  const isEmptyDraft = draft.qualities.length === 0 && draft.transitions.length === 0 && draft.checkpoints.length <= 1;
  return (
    <div className="flex h-full flex-col gap-3">
      {copilotEnabled && isEmptyDraft && (
        <div id="so-studio-empty" className="st-subpanel flex flex-wrap items-center gap-2 p-3 text-sm">
          <span>Nothing authored yet. The wizard can take you from a one-line premise to a playable story.</span>
          <button id="so-start-wizard" type="button" className="st-button primary" onClick={() => onSelect("copilot")}>Start with the wizard</button>
        </div>
      )}
      <StudioGraph onOpenCheckpoint={() => onSelect("checkpoints")} />
    </div>
  );
};

const StudioTabContent = ({ activeTab, options, copilotEnabled, runCopilotStage, wizardHost, intent, onSelect }: TabContentProps) => {
  const idLocked = useDraftStore((state) => state.sourceHash !== null);
  if (activeTab === "story") {
    return <StoryEditor personaNames={options.personaNames} memberNames={options.memberNames} lorebookNames={options.lorebookNames} idLocked={idLocked} />;
  }
  if (activeTab === "qualities") return <QualityEditor />;
  if (activeTab === "checkpoints") return <CheckpointEditor backgroundNames={options.backgroundNames} />;
  if (activeTab === "transitions") return <TransitionEditor />;
  if (activeTab === "roster") return <RosterEditor memberNames={options.memberNames} />;
  if (activeTab === "diagnostics") return <DiagnosticsPanel />;
  if (activeTab === "copilot") {
    return <StudioCopilot enabled={copilotEnabled} runStage={runCopilotStage} host={wizardHost} initialStage={intent?.stage} seedMissing={intent?.missing} />;
  }
  return <GraphTab copilotEnabled={copilotEnabled} onSelect={onSelect} />;
};

const StudioFooter = ({ onSaved }: { onSaved?: StudioSaveHandler }) => {
  const undo = useDraftStore((state) => state.undo);
  const redo = useDraftStore((state) => state.redo);
  const canUndo = useDraftStore((state) => state.past.length > 0);
  const canRedo = useDraftStore((state) => state.future.length > 0);
  return (
    <div className="st-panel-header flex flex-wrap items-center gap-2 border-t px-3 py-2">
      <button type="button" className="st-button secondary" onClick={undo} disabled={!canUndo}>Undo</button>
      <button type="button" className="st-button secondary" onClick={redo} disabled={!canRedo}>Redo</button>
      <StudioToolbar onSaved={onSaved} />
    </div>
  );
};

const StudioModal: React.FC<Props> = ({ onClose, copilotEnabled = true, runCopilotStage, onSaved, hostOptions, wizardHost, intent, replay = null }) => {
  const [tab, setTab] = useState<StudioTab>(intent?.tab ?? "graph");
  const options = useMemo(() => hostOptions ?? readHostOptions(), [hostOptions]);
  const tabs = copilotEnabled ? [...BASE_TABS, { id: "copilot" as StudioTab, label: "Wizard" }] : BASE_TABS;
  const activeTab = tabs.some((entry) => entry.id === tab) ? tab : "graph";

  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    titleRef.current?.focus();
  }, []);

  const requestClose = async () => {
    if (useDraftStore.getState().dirty && !(await showConfirmPopup("Discard unsaved Studio changes?", { okButton: "Discard", cancelButton: "Keep editing" }))) return;
    onClose();
  };

  const handleKeyDown = focusTrapHandler(panelRef, requestClose);

  return createPortal(
    <dialog
      ref={dialogRef}
      id="so-studio-modal"
      aria-label="Checkpoint Studio"
      onKeyDown={handleKeyDown}
      onCancel={(event) => { event.preventDefault(); void requestClose(); }}
      // A native dialog can also be closed from outside React (`dialog.close()`, a debug script,
      // the browser): without this the element stays mounted but invisible and the Studio looks
      // open to everything that only counts the node (live finding, plan 05 J2 run).
      onClose={onClose}
    >
      <div ref={panelRef} className="st-panel flex h-[85dvh] w-[min(1100px,95dvw)] flex-col overflow-hidden shadow-lg">
        <StudioHeader titleRef={titleRef} onRequestClose={() => void requestClose()} />
        <StudioTabList tabs={tabs} activeTab={activeTab} onSelect={setTab} />
        <div id="so-studio-tabpanel" className="flex-1 overflow-auto p-3" role="tabpanel" tabIndex={-1} aria-labelledby={`so-studio-tab-${activeTab}`}>
          <GateReplayContext.Provider value={replay}>
            <StudioTabContent
              activeTab={activeTab}
              options={options}
              copilotEnabled={copilotEnabled}
              runCopilotStage={runCopilotStage}
              wizardHost={wizardHost}
              intent={intent}
              onSelect={setTab}
            />
          </GateReplayContext.Provider>
        </div>
        <StudioFooter onSaved={onSaved} />
      </div>
    </dialog>,
    document.body,
  );
};

export default StudioModal;
