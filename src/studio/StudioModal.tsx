import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { listAllLorebooks, listBackgrounds, listGroupMembers, listPersonas, readCharacterCardTexts, showConfirmPopup } from "@services/STAPI";
import type { AuthoringStageInput, CopilotStage, ProposalResult } from "@copilot/index";
import { useDraftStore } from "./draft";
import { setStoryField } from "./mutations";
import QualityEditor from "./components/QualityEditor";
import CheckpointEditor from "./components/CheckpointEditor";
import TransitionEditor from "./components/TransitionEditor";
import DiagnosticsPanel from "./components/DiagnosticsPanel";
import SpriteBuilder from "./components/SpriteBuilder";
import RosterEditor from "./components/RosterEditor";
import GameEditor from "./components/GameEditor";
import StoryEditor from "./components/StoryEditor";
import StoryFeaturesEditor from "./components/StoryFeaturesEditor";
import StudioGraph from "./components/StudioGraph";
import GuideDisclosure from "./components/GuideDisclosure";
import StudioGuideDialog from "./components/StudioGuideDialog";
import { STUDIO_TAB_GUIDE } from "./guideTabs";
import StudioCopilot, { type WizardHost, type WizardMode } from "./components/StudioCopilot";
import type { AgentTurnRunner } from "./components/AgentWizard";
import * as wizardAgent from "@copilot/agent/index";
import type { ModelCall } from "@extraction/modelRoute";
import StudioToolbar, { type StudioSaveHandler } from "./components/StudioToolbar";
import { GateReplayContext } from "./replayContext";
import { PreparePresentationContext } from "./presentationNavigation";
import type { GateReplaySource } from "./gateReplay";
import { resolveAgentHarness } from "./agentHost";
import { studioAssist, studioTopicTarget } from "./studioAssist";
import type { KnowledgeShowMe } from "@copilot/knowledge/types";
import type { StudioAskRunner } from "./components/StudioAsk";
import { Dialog, DialogHeader } from "@components/ui/Dialog";
import { Badge } from "@components/ui/Badge";
import { IconButton } from "@components/ui/IconButton";
import { Button } from "@components/ui/Button";
import { STUDIO_TAB_IDS, studioNav, type StudioPage, type StudioTab } from "./studioNav";
import { StudioSectionSelect, StudioSidebar } from "./components/StudioNav";
import type { DiagnosticTarget } from "./diagnosticTarget";
import "./mobile.css";

export type { StudioTab } from "./studioNav";
export { STUDIO_TAB_IDS } from "./studioNav";

export interface StudioOpenIntent {
  tab?: StudioTab;
  stage?: CopilotStage;
  missing?: { personas?: string[]; members?: string[]; lorebooks?: string[] };
  fromChat?: boolean;
}

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
  return { personaNames: safe(listPersonas), memberNames: safe(listGroupMembers), lorebookNames: safe(listAllLorebooks), backgroundNames: safe(listBackgrounds) };
};

export const WIZARD_AGENT = wizardAgent;
export const WIZARD_HARNESS = resolveAgentHarness;
export const WIZARD_CARDS = readCharacterCardTexts;

const agentTurnRunner = (model: ModelCall | undefined, host: WizardHost | undefined): AgentTurnRunner | undefined =>
  (model && host
    ? wizardAgent.createAgentRunner({
      model, environment: (draft) => host.environment(draft), backgrounds: () => readHostOptions().backgroundNames, cards: readCharacterCardTexts,
      harness: () => resolveAgentHarness(),
    })
    : undefined);

type Props = {
  onClose: () => void;
  copilotEnabled?: boolean;
  runCopilotStage?: (input: AuthoringStageInput) => Promise<ProposalResult>;
  agentModel?: ModelCall;
  askEnabled?: boolean;
  onSaved?: StudioSaveHandler;
  hostOptions?: StudioHostOptions;
  wizardHost?: WizardHost;
  intent?: StudioOpenIntent;
  replay?: GateReplaySource | null;
};

export const FOCUSABLE = "a[href], summary, button, input, select, textarea, [tabindex]:not([tabindex='-1'])";

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
  const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter((element) => !element.hasAttribute("disabled") && element.getAttribute("tabindex") !== "-1" && element.offsetParent !== null);
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
  onIssues: () => void;
  guide: React.ReactNode;
  actions: React.ReactNode;
}

const StudioHeader = ({ titleRef, onRequestClose, onIssues, guide, actions }: HeaderProps) => {
  const draft = useDraftStore((state) => state.draft);
  const errors = useDraftStore((state) => state.errors);
  const diagnostics = useDraftStore((state) => state.diagnostics);
  const mutate = useDraftStore((state) => state.mutate);
  const undo = useDraftStore((state) => state.undo);
  const redo = useDraftStore((state) => state.redo);
  const canUndo = useDraftStore((state) => state.past.length > 0);
  const canRedo = useDraftStore((state) => state.future.length > 0);
  const issueCount = diagnostics.filter((entry) => entry.severity !== "info").length;
  const errorWord = errors.length === 1 ? "error" : "errors";
  return (
    <DialogHeader titleId="so-studio-heading" title="Checkpoint Studio" onClose={onRequestClose} closeLabel="Close studio" className="so-studio-head">
      <div className="so-studio-title-row">
        <input
          ref={titleRef}
          id="so-studio-title"
          className="so-studio-title"
          aria-label="Story title"
          value={draft.title}
          onChange={(event) => mutate((current) => setStoryField(current, "title", event.target.value))}
        />
        <IconButton icon="fa-pen" size="sm" label="Edit the story title" onClick={() => titleRef.current?.focus()} />
        {errors.length > 0 || issueCount > 0 ? (
          <button type="button" id="so-studio-issues" className="so-studio-issues" title="Open validation" onClick={onIssues}>
            {errors.length > 0 ? <Badge tone="error" aria-label={`${errors.length} validation ${errorWord}`}>{errors.length} {errorWord}</Badge> : null}
            {issueCount > 0 ? <Badge tone="warn" aria-label={`${issueCount} diagnostics`}>{issueCount} {issueCount === 1 ? "issue" : "issues"}</Badge> : null}
          </button>
        ) : null}
      </div>
      <div className="so-studio-tools">
        <IconButton id="so-studio-undo" icon="fa-rotate-left" label="Undo" disabled={!canUndo} onClick={undo} />
        <IconButton id="so-studio-redo" icon="fa-rotate-right" label="Redo" disabled={!canRedo} onClick={redo} />
        {guide}
        {actions}
      </div>
    </DialogHeader>
  );
};

interface TabContentProps {
  activeTab: StudioTab;
  member?: string;
  onNavigate: (page: StudioPage) => void;
  onGoTo: (target: DiagnosticTarget) => void;
  options: StudioHostOptions;
  copilotEnabled: boolean;
  runCopilotStage?: (input: AuthoringStageInput) => Promise<ProposalResult>;
  runAgentTurn?: AgentTurnRunner;
  wizardHost?: WizardHost;
  intent?: StudioOpenIntent;
  onSelect: (tab: StudioTab) => void;
  wizardMode: WizardMode;
  onWizardMode: (mode: WizardMode) => void;
  ask?: StudioAskRunner;
  draftTutorialStep?: (prompt: string) => Promise<string>;
  onShowTopic?: (target: KnowledgeShowMe) => void;
}

const GraphTab = ({ copilotEnabled, onSelect, backgroundNames }: { copilotEnabled: boolean; onSelect: (tab: StudioTab) => void; backgroundNames: string[] }) => {
  const draft = useDraftStore((state) => state.draft);
  const isEmptyDraft = draft.qualities.length === 0 && draft.transitions.length === 0 && draft.checkpoints.length <= 1;
  return (
    <div className="flex h-full flex-col gap-3">
      {!copilotEnabled && isEmptyDraft && (
        <div id="so-studio-wizard-off" className="st-subpanel p-3 text-sm">The wizard is off. Turn it on under Authoring in the extension settings to start from a premise.</div>
      )}
      {copilotEnabled && isEmptyDraft && (
        <div id="so-studio-empty" className="st-subpanel flex flex-wrap items-center gap-2 p-3 text-sm">
          <span>Nothing authored yet. The wizard can take you from a one-line premise to a playable story.</span>
          <Button id="so-start-wizard" variant="primary" onClick={() => onSelect("copilot")}>Start with the wizard</Button>
        </div>
      )}
      <StudioGraph backgroundNames={backgroundNames} />
    </div>
  );
};

const StudioTabContent = ({
  activeTab, member, onNavigate, onGoTo, options, copilotEnabled, runCopilotStage, runAgentTurn, wizardHost, intent, onSelect, wizardMode, onWizardMode, ask, draftTutorialStep, onShowTopic,
}: TabContentProps) => {
  const idLocked = useDraftStore((state) => state.sourceHash !== null);
  const hasCast = useDraftStore((state) => Boolean(state.draft.roster?.length));
  if (activeTab === "story") {
    return <StoryEditor section="setup" personaNames={options.personaNames} memberNames={options.memberNames} lorebookNames={options.lorebookNames} idLocked={idLocked} />;
  }
  if (activeTab === "world" || activeTab === "presentation" || activeTab === "rules" || activeTab === "chapters") return <StoryEditor
    section={activeTab === "chapters" ? "flow" : activeTab} lorebookNames={options.lorebookNames} />;
  if (activeTab === "qualities") return <QualityEditor />;
  if (activeTab === "features") return <StoryFeaturesEditor />;
  if (activeTab === "checkpoints") return <CheckpointEditor backgroundNames={options.backgroundNames} />;
  if (activeTab === "transitions") return <TransitionEditor />;
  if (activeTab === "roster") return <RosterEditor memberNames={options.memberNames} memberId={member} onNavigate={onNavigate} />;
  if (activeTab === "game") return <GameEditor />;
  if (activeTab === "sprites") return <SpriteBuilder />;
  if (activeTab === "diagnostics") return <DiagnosticsPanel onGoTo={onGoTo} />;
  if (activeTab === "copilot") {
    return (
      <PreparePresentationContext.Provider value={() => onSelect("sprites")}><div className="flex flex-col gap-3"><StudioCopilot
        mode={wizardMode}
        onModeChange={onWizardMode}
        enabled={copilotEnabled}
        runStage={runCopilotStage}
        runAgentTurn={runAgentTurn}
        host={wizardHost}
        initialStage={intent?.stage}
        seedMissing={intent?.missing}
        ask={ask}
        draftTutorialStep={draftTutorialStep}
        onShowTopic={onShowTopic}
      />{hasCast && <Button id="so-wizard-prepare-presentation" className="self-start"
        onClick={() => onSelect("sprites")}>Next: prepare cast presentation</Button>}</div></PreparePresentationContext.Provider>
    );
  }
  return <GraphTab copilotEnabled={copilotEnabled} onSelect={onSelect} backgroundNames={options.backgroundNames} />;
};

const useFocusRequest = () => {
  const [request, setRequest] = useState<{ section?: string; nonce: number } | null>(null);
  useEffect(() => {
    if (!request) return undefined;
    const timer = window.setTimeout(() => {
      const panel = document.getElementById("so-studio-tabpanel");
      const target = (request.section && panel?.querySelector<HTMLElement>(`[data-so-section="${request.section}"]`)) || panel?.querySelector<HTMLElement>("[data-so-focus]") || panel;
      if (!target) return;
      target.scrollIntoView?.({ block: "start" });
      const field = target.matches(FOCUSABLE) ? target : target.querySelector<HTMLElement>(FOCUSABLE);
      (field ?? target).focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [request]);
  return (section?: string) => setRequest((current) => ({ section, nonce: (current?.nonce ?? 0) + 1 }));
};

const StudioModal: React.FC<Props> = ({ onClose, copilotEnabled = true, runCopilotStage, agentModel, askEnabled = true, onSaved, hostOptions, wizardHost, intent, replay = null }) => {
  const [page, setPage] = useState<StudioPage>({ tab: intent?.tab ?? "graph" });
  const [history, setHistory] = useState<StudioPage[]>([]);
  const [wizardMode, setWizardMode] = useState<WizardMode>("staged");
  const [guideDoc, setGuideDoc] = useState<string | null>(null);
  const options = useMemo(() => hostOptions ?? readHostOptions(), [hostOptions]);
  const roster = useDraftStore((state) => state.draft.roster);
  const issues = useDraftStore((state) => state.errors.length + state.diagnostics.filter((entry) => entry.severity !== "info").length);
  const tabs = useMemo(() => (copilotEnabled ? STUDIO_TAB_IDS : STUDIO_TAB_IDS.filter((entry) => entry !== "copilot")), [copilotEnabled]);
  const groups = useMemo(() => studioNav(tabs, roster, issues), [tabs, roster, issues]);
  const activeTab = tabs.includes(page.tab) ? page.tab : "graph";
  const memberKnown = !page.member || roster.some((entry) => entry.id === page.member);
  const activePage: StudioPage = memberKnown && activeTab === page.tab ? page : { tab: activeTab };
  const requestFocus = useFocusRequest();
  const navigate = (next: StudioPage) => {
    if (next.tab === activePage.tab && next.member === activePage.member) return;
    setHistory((current) => [...current.slice(-19), activePage]);
    setPage(next);
  };
  const setTab = (tab: StudioTab) => navigate({ tab });
  const back = () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory(history.slice(0, -1));
    setPage(previous);
  };
  const goTo = (target: DiagnosticTarget) => {
    const store = useDraftStore.getState();
    if (target.checkpointId) store.selectCheckpoint(target.checkpointId);
    if (target.transitionIndex !== undefined) store.selectTransition(target.transitionIndex);
    navigate({ tab: target.tab, ...(target.member ? { member: target.member } : {}) });
    requestFocus(target.section);
  };
  const tabElementId = groups.flatMap((group) => group.links).find((link) => link.page.tab === activePage.tab && link.page.member === activePage.member)?.elementId
    ?? `so-studio-tab-${activeTab}`;

  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [opener] = useState(() => (typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    titleRef.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, [opener]);
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => {
      dialogRef.current?.style.setProperty("--so-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
      dialogRef.current?.style.setProperty("--so-viewport-top", `${viewport?.offsetTop ?? 0}px`);
    };
    resize(); viewport?.addEventListener("resize", resize); viewport?.addEventListener("scroll", resize);
    return () => { viewport?.removeEventListener("resize", resize); viewport?.removeEventListener("scroll", resize); };
  }, []);

  const requestClose = async () => {
    if (useDraftStore.getState().dirty && !(await showConfirmPopup("Discard unsaved Studio changes?", { okButton: "Discard", cancelButton: "Keep editing" }))) return;
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    else onClose();
  };

  const handleKeyDown = focusTrapHandler(panelRef, requestClose);
  const agentRunner = useMemo(() => agentTurnRunner(agentModel, wizardHost), [agentModel, wizardHost]);
  const assist = useMemo(() => (agentModel && wizardHost ? studioAssist(agentModel, wizardHost, () => readHostOptions().backgroundNames) : null), [agentModel, wizardHost]);
  const showTopic = (target: KnowledgeShowMe) => {
    const resolved = studioTopicTarget(target);
    if (resolved && "tab" in resolved) navigate({ tab: resolved.tab });
    else if (resolved) setGuideDoc(resolved.doc);
  };

  return createPortal(
    <Dialog
      ref={dialogRef}
      id="so-studio-modal"
      size="full"
      aria-labelledby="so-studio-heading"
      onKeyDown={handleKeyDown}
      onCancel={(event) => { event.preventDefault(); void requestClose(); }}
      // A native dialog can also be closed from outside React (`dialog.close()`, a debug script,
      // the browser): without this the element stays mounted but invisible and the Studio looks
      // open to everything that only counts the node (live finding run).
      onClose={onClose}
    >
      <div ref={panelRef} className="so-studio-frame so-dialog-frame">
        <StudioHeader titleRef={titleRef} onRequestClose={() => void requestClose()} onIssues={() => navigate({ tab: "diagnostics" })}
          guide={<GuideDisclosure key={activeTab} topics={STUDIO_TAB_GUIDE[activeTab] ?? []} onOpenGuide={setGuideDoc} />}
          actions={<StudioToolbar onSaved={onSaved} onRekeySession={wizardHost?.rekeySession} />} />
        <StudioSectionSelect groups={groups} page={activePage} onSelect={navigate} onBack={history.length ? back : undefined} />
        <div className="so-studio-body">
          <StudioSidebar groups={groups} page={activePage} onSelect={navigate} />
          <div id="so-studio-tabpanel" className="so-studio-page" role="tabpanel" tabIndex={-1} aria-labelledby={tabElementId} data-page={activeTab}>
            <GateReplayContext.Provider value={replay}>
              <StudioTabContent
                activeTab={activeTab}
                member={activePage.member}
                onNavigate={navigate}
                onGoTo={goTo}
                options={options}
                copilotEnabled={copilotEnabled}
                runCopilotStage={runCopilotStage}
                runAgentTurn={agentRunner}
                wizardHost={wizardHost}
                intent={intent}
                onSelect={setTab}
                wizardMode={wizardMode}
                onWizardMode={setWizardMode}
                ask={askEnabled ? assist?.ask : undefined}
                draftTutorialStep={assist?.draftStep}
                onShowTopic={showTopic}
              />
            </GateReplayContext.Provider>
          </div>
        </div>
      </div>
      {guideDoc && <StudioGuideDialog doc={guideDoc} onClose={() => setGuideDoc(null)} />}
    </Dialog>,
    document.body,
  );
};

export default StudioModal;
