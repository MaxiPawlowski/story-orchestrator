import React, { useEffect, useRef, useState } from "react";
import type { StoryV2 } from "@engine/index";
import { COPILOT_STAGES, applyOp, applyOps, isProvisioningOp, provisioningFollowUpOps, type AuthoringStageInput, type CopilotMessage, type CopilotStage, type ProposalResult } from "@copilot/index";
import { emptyEnvironment, entryKey, grantCandidates, revokeCandidates, newWizardSession, provisioningSeed, renderAnswers, wizardSessionKey, type ExistingEntry, type ProvisioningEnvironment, type ProvisioningOp, type ProvisioningResult, type WizardAnswer, type WizardQuestion, type WizardSessionState } from "@wizard/index";
import { useDraftStore } from "../draft";
import ProposalReview from "./ProposalReview";
import ProvisioningCard from "./ProvisioningCard";
import WizardQuestions from "./WizardQuestions";

// Grant and revoke cards share the results map with the model's proposal, which counts up from 0.
// Addressing the derived cards by name keeps their keys stable when the other list changes under
// them, and keeps every one of them off the proposal's indices.
const grantIndex = (book: string) => `grant:${book}`;
const revokeIndex = (book: string) => `revoke:${book}`;

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

// v2.3 plan 09: five stages, four things an author is actually doing. The steps are the control; the
// stage names are the machine's vocabulary and live behind "Details". A step maps to one or two
// stages, so nothing about the pipeline changed — only what the author is asked to think about.
export interface WizardStep {
  id: "premise" | "turningPoints" | "characters" | "setup";
  label: string;
  blurb: string;
  stages: CopilotStage[];
}

export const WIZARD_STEPS: WizardStep[] = [
  { id: "premise", label: "Premise", blurb: "What the story is about, and what it measures as it goes.", stages: ["qualities"] },
  { id: "turningPoints", label: "Turning points", blurb: "The beats, and what has to be true to move between them.", stages: ["checkpoints", "transitions"] },
  { id: "characters", label: "Characters", blurb: "Who is in it, what they want, and where their threads point.", stages: ["effects"] },
  { id: "setup", label: "Setup", blurb: "Create the cards, lore and group this story needs to run.", stages: ["provisioning"] },
];

export const stepForStage = (stage: CopilotStage): WizardStep => WIZARD_STEPS.find((step) => step.stages.includes(stage)) ?? WIZARD_STEPS[0];

export interface WizardHost {
  environment: (draft?: StoryV2) => ProvisioningEnvironment;
  applyProvisioning: (op: ProvisioningOp, draft: StoryV2) => Promise<ProvisioningResult>;
  readEntry?: (lorebook: string, comment: string) => Promise<ExistingEntry | null>;
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
  const [provisioningBusy, setProvisioningBusy] = useState<string | number | null>(null);
  const [provisioningResults, setProvisioningResults] = useState<Record<string | number, { ok: boolean; message: string }>>({});
  const [environment, setEnvironment] = useState<ProvisioningEnvironment>(() => host?.environment(useDraftStore.getState().draft) ?? emptyEnvironment());
  const [entryPreviews, setEntryPreviews] = useState<Record<string, ExistingEntry | null>>({});
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

  // R8: what an entry holds right now, read once per proposed write. The card is presentational —
  // the host call happens here so Storybook can render the card against a fixed preview.
  useEffect(() => {
    const readEntry = host?.readEntry;
    if (!result || !readEntry) return;
    let live = true;
    const pending = result.proposal.ops.filter((op): op is Extract<ProvisioningOp, { kind: "upsertLorebookEntry" }> => op.kind === "upsertLorebookEntry");
    void Promise.all(pending.map(async (op) => [entryKey(op.lorebook, op.comment), await readEntry(op.lorebook, op.comment)] as const))
      .then((read) => { if (live) setEntryPreviews(Object.fromEntries(read)); })
      .catch(() => { if (live) setEntryPreviews({}); });
    return () => { live = false; };
  }, [host, result]);

  const persist = (patch: Partial<WizardSessionState>) => {
    if (!host?.saveSession) return;
    host.saveSession({ ...newWizardSession(sessionKey), stage, history, questions, applied, ...patch });
  };

  const currentStep = stepForStage(stage);
  const selectStage = (entry: CopilotStage) => {
    setStage(entry);
    persist({ stage: entry });
  };

  const available = enabled && Boolean(runStage);

  const run = async (authorText: string, baseHistory: CopilotMessage[]) => {
    if (!runStage || busy) return;
    setBusy(true);
    setError(null);
    const nextHistory: CopilotMessage[] = authorText ? [...baseHistory, { role: "author", text: authorText }] : baseHistory;
    const nextEnvironment = host?.environment(useDraftStore.getState().draft) ?? environment;
    setEnvironment(nextEnvironment);
    try {
      const stageResult = await runStage({ draft: useDraftStore.getState().draft, stage, message: authorText, history: baseHistory, environment: nextEnvironment });
      setAccepted(new Set());
      setProvisioningResults({});
      setEntryPreviews({});
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
  const provision = async (index: string | number, op: ProvisioningOp) => {
    if (!host || provisioningBusy !== null) return;
    setProvisioningBusy(index);
    try {
      const outcome = await host.applyProvisioning(op, useDraftStore.getState().draft);
      // A grant and its revoke are two keys for one book. Confirming one makes the other card
      // reappear, and its old success line is about the opposite decision — so the flip clears both
      // before the new outcome is recorded (found live, R8 scenario).
      setProvisioningResults((previous) => {
        const next = { ...previous };
        if (op.kind === "grantLorebook") { delete next[grantIndex(op.lorebook)]; delete next[revokeIndex(op.lorebook)]; }
        next[index] = { ok: outcome.ok, message: outcome.message };
        return next;
      });
      if (!outcome.ok) return;
      mutate((current) => applyOps(current, provisioningFollowUpOps(current, op)));
      // A grant is permission over an existing user asset, not something this wizard created. Never
      // put it in `applied`: that ledger is the cleanup scope for test-created assets.
      const nextApplied = outcome.created
        ? applied.includes(outcome.created) ? applied : [...applied, outcome.created]
        : applied;
      setApplied(nextApplied);
      setEnvironment(host.environment(useDraftStore.getState().draft));
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
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Wizard step">
          {WIZARD_STEPS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              data-so="wizard-step"
              data-step={entry.id}
              className={`st-tab rounded px-3 py-1 text-sm ${currentStep.id === entry.id ? "st-tab-active" : ""}`}
              aria-pressed={currentStep.id === entry.id}
              onClick={() => selectStage(entry.stages[0])}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div className="text-[11px] st-muted">{currentStep.blurb}</div>
        <div className="text-[11px] st-muted">{STAGE_HINTS[stage]}</div>
        {/* The stage names are the machine's, not the author's (plan 09): they are here for the
            author who wants to drive one directly, and out of the way for the one who does not. */}
        <details data-so="wizard-stage-details" className="text-[11px]">
          <summary className="cursor-pointer st-muted">Details — the stage the wizard is running</summary>
          <div className="flex flex-wrap items-center gap-1 pt-1" role="group" aria-label="Wizard stage">
            {COPILOT_STAGES.map((entry) => (
              <button
                key={entry}
                type="button"
                data-so="wizard-stage"
                className={`st-tab rounded px-2 py-1 text-xs ${stage === entry ? "st-tab-active" : ""}`}
                aria-pressed={stage === entry}
                onClick={() => selectStage(entry)}
              >
                {STAGE_LABELS[entry]}
              </button>
            ))}
          </div>
        </details>
      </div>

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
          entryPreviews={entryPreviews}
          onProvision={(index, op) => void provision(index, op)}
        />
      ) : null}

      {/* R8: a book the story requires but does not own is the author's decision, so it is offered
          here rather than proposed by the model — and a granted one stays on screen, offered back.
          Negative indices keep their results off the proposal's map. */}
      {grantCandidates(environment).map((book) => (
        <ProvisioningCard
          key={`grant:${book}`}
          op={{ kind: "grantLorebook", lorebook: book }}
          environment={environment}
          result={provisioningResults[grantIndex(book)]?.message ?? null}
          failed={provisioningResults[grantIndex(book)]?.ok === false}
          busy={provisioningBusy !== null}
          onApply={(op) => void provision(grantIndex(book), op)}
        />
      ))}
      {revokeCandidates(environment).map((book) => (
        <ProvisioningCard
          key={`revoke:${book}`}
          op={{ kind: "grantLorebook", lorebook: book, revoke: true }}
          environment={environment}
          result={provisioningResults[revokeIndex(book)]?.message ?? null}
          failed={provisioningResults[revokeIndex(book)]?.ok === false}
          busy={provisioningBusy !== null}
          onApply={(op) => void provision(revokeIndex(book), op)}
        />
      ))}

      <div className="flex items-end gap-2">
        <textarea
          id="so-wizard-message"
          className="text_pole st-input min-h-[60px] flex-1"
          aria-label="Copilot message"
          placeholder={`${currentStep.label}: tell the wizard what you want, or ask a question.`}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
        <button id="so-wizard-run" type="button" className="st-button primary" disabled={busy} onClick={() => void run(message.trim(), history)}>{busy ? "Working…" : "Run stage"}</button>
      </div>
    </div>
  );
};

export default StudioCopilot;
