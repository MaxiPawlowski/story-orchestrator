import React, { useEffect, useRef, useState } from "react";
import type { StoryV2 } from "@engine/index";
import { COPILOT_STAGES, applyOp, applyOps, isProvisioningOp, provisioningFollowUpOps, type AuthoringStageInput, type CopilotMessage, type CopilotStage, type ProposalResult } from "@copilot/index";
import { emptyEnvironment, newWizardSession, provisioningSeed, renderAnswers, wizardSessionKey, type ProvisioningEnvironment, type ProvisioningOp, type ProvisioningResult, type WizardAnswer, type WizardQuestion, type WizardSessionState } from "@wizard/index";
import { useDraftStore } from "../draft";
import ProposalReview from "./ProposalReview";
import WizardQuestions from "./WizardQuestions";

const STAGE_LABELS: Record<CopilotStage, string> = {
  qualities: "Qualities",
  checkpoints: "Checkpoints",
  transitions: "Transitions",
  effects: "Effects & Cast",
  provisioning: "Provisioning",
};

const STAGE_HINTS: Record<CopilotStage, string> = {
  qualities: "Describe your premise. The wizard proposes what this story measures.",
  checkpoints: "Ask for the beats: anchors, objectives, where the tension sits.",
  transitions: "Wire the beats together with gates the extractor can actually read.",
  effects: "Cast, requirements, dramatic shape, thread bridges.",
  provisioning: "Create the cards, lorebook and group this story needs to run.",
};

export interface WizardHost {
  environment: () => ProvisioningEnvironment;
  applyProvisioning: (op: ProvisioningOp, draft: StoryV2) => Promise<ProvisioningResult>;
  loadSession?: (key: string) => WizardSessionState | null;
  saveSession?: (session: WizardSessionState) => void;
}

type Props = {
  enabled?: boolean;
  runStage?: (input: AuthoringStageInput) => Promise<ProposalResult>;
  host?: WizardHost;
  initialStage?: CopilotStage;
  seedMissing?: { personas?: string[]; members?: string[]; lorebooks?: string[] };
};

const StudioCopilot: React.FC<Props> = ({ enabled = true, runStage, host, initialStage, seedMissing }) => {
  const mutate = useDraftStore((state) => state.mutate);
  const draftId = useDraftStore((state) => state.draft.id);
  const draftTitle = useDraftStore((state) => state.draft.title);
  const [stage, setStage] = useState<CopilotStage>(initialStage ?? "qualities");
  const [message, setMessage] = useState(seedMissing ? provisioningSeed(seedMissing) : "");
  const [history, setHistory] = useState<CopilotMessage[]>([]);
  const [result, setResult] = useState<ProposalResult | null>(null);
  const [questions, setQuestions] = useState<WizardQuestion[]>([]);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const [applied, setApplied] = useState<string[]>([]);
  const [provisioningBusy, setProvisioningBusy] = useState<number | null>(null);
  const [provisioningResults, setProvisioningResults] = useState<Record<number, { ok: boolean; message: string }>>({});
  const [environment, setEnvironment] = useState<ProvisioningEnvironment>(() => host?.environment() ?? emptyEnvironment());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionKey = wizardSessionKey({ id: draftId, title: draftTitle });
  const restored = useRef(false);

  // An interrupted setup resumes: the conversation and the stage it was on come back from the
  // persisted session, keyed by the draft it belongs to.
  useEffect(() => {
    if (restored.current || !host?.loadSession) return;
    restored.current = true;
    const session = host.loadSession(sessionKey);
    if (!session) return;
    setHistory(session.history);
    setQuestions(session.questions);
    setApplied(session.applied);
    if (!initialStage && COPILOT_STAGES.includes(session.stage as CopilotStage)) setStage(session.stage as CopilotStage);
  }, [host, sessionKey, initialStage]);

  const persist = (patch: Partial<WizardSessionState>) => {
    if (!host?.saveSession) return;
    host.saveSession({ ...newWizardSession(sessionKey), stage, history, questions, applied, ...patch });
  };

  const available = enabled && Boolean(runStage);

  const run = async (authorText: string, baseHistory: CopilotMessage[]) => {
    if (!runStage || busy) return;
    setBusy(true);
    setError(null);
    const nextHistory: CopilotMessage[] = authorText ? [...baseHistory, { role: "author", text: authorText }] : baseHistory;
    const nextEnvironment = host?.environment() ?? environment;
    setEnvironment(nextEnvironment);
    try {
      const stageResult = await runStage({ draft: useDraftStore.getState().draft, stage, message: authorText, history: baseHistory, environment: nextEnvironment });
      setAccepted(new Set());
      setProvisioningResults({});
      const summary = stageResult.status === "questions"
        ? stageResult.proposal.summary || `Asked ${stageResult.questions.length} question(s).`
        : stageResult.status === "ok"
          ? stageResult.proposal.summary || `Proposed ${stageResult.proposal.ops.length} change(s).`
          : `Could not produce a valid proposal: ${stageResult.issues[0] ?? "unknown error"}`;
      const history2: CopilotMessage[] = [...nextHistory, { role: "copilot", text: summary }];
      setResult(stageResult.status === "questions" ? null : stageResult);
      setQuestions(stageResult.questions);
      setHistory(history2);
      setMessage("");
      persist({ history: history2, questions: stageResult.questions });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Copilot request failed");
      setHistory(nextHistory);
    } finally {
      setBusy(false);
    }
  };

  const answer = (answers: WizardAnswer[]) => {
    const text = renderAnswers(questions, answers);
    setQuestions([]);
    void run(text, history);
  };

  const acceptOp = (index: number) => {
    if (!result || accepted.has(index)) return;
    mutate((current) => applyOp(current, result.proposal.ops[index]));
    setAccepted((previous) => new Set(previous).add(index));
  };

  // Provisioning writes to the install, so bulk accept only ever covers draft ops.
  const acceptAll = () => {
    if (!result) return;
    const draftOps = result.proposal.ops.map((op, index) => ({ op, index })).filter(({ op }) => !isProvisioningOp(op));
    draftOps.forEach(({ op, index }) => { if (!accepted.has(index)) mutate((current) => applyOp(current, op)); });
    setAccepted(new Set(draftOps.map(({ index }) => index)));
  };

  // Applying provisioning does two things: it creates the asset in SillyTavern, and it makes the
  // story require what was just created, so the requirements panel goes green from evidence.
  const provision = async (index: number, op: ProvisioningOp) => {
    if (!host || provisioningBusy !== null) return;
    setProvisioningBusy(index);
    try {
      const outcome = await host.applyProvisioning(op, useDraftStore.getState().draft);
      setProvisioningResults((previous) => ({ ...previous, [index]: { ok: outcome.ok, message: outcome.message } }));
      if (!outcome.ok) return;
      mutate((current) => applyOps(current, provisioningFollowUpOps(current, op)));
      const nextApplied = applied.includes(outcome.created ?? "") ? applied : [...applied, outcome.created ?? op.kind];
      setApplied(nextApplied);
      setEnvironment(host.environment());
      persist({ applied: nextApplied });
    } catch (caught) {
      setProvisioningResults((previous) => ({ ...previous, [index]: { ok: false, message: caught instanceof Error ? caught.message : "Provisioning failed" } }));
    } finally {
      setProvisioningBusy(null);
    }
  };

  const dismiss = () => {
    setResult(null);
    setQuestions([]);
    setAccepted(new Set());
    setProvisioningResults({});
  };

  if (!available) {
    return (
      <div className="st-subpanel rounded p-3 text-sm st-muted" aria-label="Copilot unavailable">
        The authoring wizard is off or no memory LLM profile is selected. Enable it in the settings panel and pick a Connection Manager profile.
      </div>
    );
  }

  return (
    <div id="so-wizard" className="flex h-full flex-col gap-3" aria-label="Story wizard">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Wizard stage">
        {COPILOT_STAGES.map((entry) => (
          <button
            key={entry}
            type="button"
            className={`st-tab rounded px-3 py-1 text-sm ${stage === entry ? "st-tab-active" : ""}`}
            aria-pressed={stage === entry}
            onClick={() => { setStage(entry); persist({ stage: entry }); }}
          >
            {STAGE_LABELS[entry]}
          </button>
        ))}
      </div>
      <div className="text-[11px] st-muted">{STAGE_HINTS[stage]}</div>

      <ul className="st-subpanel flex min-h-[80px] flex-1 flex-col gap-2 overflow-auto p-2 text-sm" aria-label="Copilot conversation">
        {history.length === 0 ? (
          <li className="st-muted">Describe your premise, then run a stage. The wizard may ask a couple of questions before it proposes.</li>
        ) : (
          history.map((entry, index) => (
            <li key={index} className={entry.role === "author" ? "text-right" : ""}>
              <span className="st-pill px-2 py-0.5 text-[10px]">{entry.role === "author" ? "You" : "Wizard"}</span>
              <span className="ml-2 whitespace-pre-wrap">{entry.text}</span>
            </li>
          ))
        )}
      </ul>

      {applied.length > 0 && (
        <div id="so-wizard-created" className="text-[11px] st-muted" aria-label="Created in SillyTavern">Created so far: {applied.join(", ")}</div>
      )}

      {error ? <div className="st-alert-error rounded px-3 py-2 text-sm" role="alert">{error}</div> : null}

      {questions.length > 0 && (
        <WizardQuestions questions={questions} summary={history[history.length - 1]?.text} busy={busy} onAnswer={answer} onDismiss={dismiss} />
      )}

      {result ? (
        <ProposalReview
          result={result}
          acceptedIndices={accepted}
          onAccept={acceptOp}
          onAcceptAll={acceptAll}
          onDismiss={dismiss}
          environment={environment}
          provisioningBusy={provisioningBusy}
          provisioningResults={provisioningResults}
          onProvision={(index, op) => void provision(index, op)}
        />
      ) : null}

      <div className="flex items-end gap-2">
        <textarea
          id="so-wizard-message"
          className="text_pole st-input min-h-[60px] flex-1"
          aria-label="Copilot message"
          placeholder={`Ask the wizard to propose ${STAGE_LABELS[stage].toLowerCase()}…`}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
        <button id="so-wizard-run" type="button" className="st-button primary" disabled={busy} onClick={() => void run(message.trim(), history)}>{busy ? "Working…" : "Run stage"}</button>
      </div>
    </div>
  );
};

export default StudioCopilot;
