import React, { useId, useRef, useState } from "react";
import { applyOps, provisioningFollowUpOps } from "@copilot/index";
import { applyAgentOp, opPreview } from "@copilot/agent/loop";
import {
  emptyTutorialCard, FIELD_LABELS, parseTutorialDraft, renderTutorialDraftPrompt, reviewTutorialCard, TUTORIAL_STEPS, tutorialBlocked, tutorialCardOp, tutorialLookOps,
  type TutorialCard, type TutorialField, type TutorialStepId,
} from "@copilot/characterTutorial";
import { ALL_AUDIENCES, findTopic } from "@copilot/knowledge/index";
import type { KnowledgeShowMe } from "@copilot/knowledge/types";
import { emptyEnvironment, newWizardSession, wizardSessionKey, type ProvisioningOp } from "@wizard/index";
import { studioFailure } from "../errorCopy";
import { draftOwnership } from "../agentHost";
import { useDraftStore } from "../draft";
import { lapsedProvisioningCopy, provisionOwned } from "./ownedProvisioning";
import ProvisioningCard from "./ProvisioningCard";
import type { WizardHost } from "./StudioCopilot";
import { Button } from "@components/ui/Button";
import { StatusText } from "@components/ui/StatusText";

export interface CharacterTutorialProps {
  host?: WizardHost;
  draftStep?: (prompt: string) => Promise<string>;
  onShowTopic?: (target: KnowledgeShowMe) => void;
}

export const TUTORIAL_TEXT = {
  heading: "Build a character",
  intro: "One character card, one step at a time. Nothing is created until you confirm the card at the end.",
  draft: "Draft it for me",
  write: "I'll write it",
  drafting: "Drafting…",
  draftFailed: "No draft came back. Write it yourself, or try again.",
  opening: "In the opening scene",
  next: "Next",
  back: "Back",
  proposeLook: "Propose the look",
  lookCard: "Change to the story: the look",
  accept: "Accept",
  reject: "Reject",
  accepted: "Accepted: the look is in the draft.",
  rejected: "Rejected.",
  noFindings: "No problems found.",
  blocked: "Fix the problems marked as blocking, then the card can be created.",
  created: "Created.",
} as const;

const LONG_FIELDS: ReadonlySet<TutorialField> = new Set(["appearance", "description", "personality", "first_mes", "mes_example"]);

type LookDecision = "accepted" | "rejected" | null;

const FieldInput = ({ field, value, onChange, inputRef }: { field: TutorialField; value: string; onChange: (value: string) => void; inputRef?: React.Ref<HTMLTextAreaElement & HTMLInputElement> }) => {
  const id = useId();
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-xs">
      <span className="font-medium">{FIELD_LABELS[field]}</span>
      {LONG_FIELDS.has(field)
        ? <textarea id={id} ref={inputRef} data-so="tutorial-field" data-field={field} className="text_pole st-input" rows={field === "description" || field === "mes_example" ? 5 : 3}
          value={value} onChange={(event) => onChange(event.target.value)} />
        : <input id={id} ref={inputRef} data-so="tutorial-field" data-field={field} className="text_pole st-input" value={value} onChange={(event) => onChange(event.target.value)} />}
    </label>
  );
};

const TopicLinks = ({ topics, onShowTopic }: { topics: readonly string[]; onShowTopic?: (target: KnowledgeShowMe) => void }) => (
  <div className="flex flex-wrap items-center gap-1 text-[11px]">
    {topics.map((id) => {
      const topic = findTopic(id, ALL_AUDIENCES);
      if (!topic) return null;
      const target = topic.showMe;
      return target && onShowTopic
        ? <button key={id} type="button" data-so="tutorial-topic" data-topic={id} className="st-pill px-2 py-0.5" onClick={() => onShowTopic(target)}>{topic.title}</button>
        : (
          <details key={id} data-so="tutorial-topic" data-topic={id} className="st-pill px-2 py-0.5">
            <summary className="cursor-pointer">{topic.title}</summary>
            <div className="pt-1">{topic.text}</div>
          </details>
        );
    })}
  </div>
);

const LookCard = ({ card, decision, onDecide }: { card: TutorialCard; decision: LookDecision; onDecide: (decision: Exclude<LookDecision, null>) => void }) => {
  const draft = useDraftStore((state) => state.draft);
  const ops = tutorialLookOps(draft, card);
  if (!ops.length && !decision) return null;
  return (
    <div data-so="tutorial-look-card" className="st-subpanel flex flex-col gap-1 p-2 text-xs" role="group" aria-label={TUTORIAL_TEXT.lookCard}>
      <span className="font-medium">{TUTORIAL_TEXT.lookCard}</span>
      {ops.map((op, index) => <span key={index} data-so="tutorial-look-op">{opPreview(draft, op).label}</span>)}
      {decision ? <span data-so="tutorial-look-decision" role="status">{decision === "accepted" ? TUTORIAL_TEXT.accepted : TUTORIAL_TEXT.rejected}</span> : (
        <div className="flex gap-2">
          <Button variant="primary" data-so="tutorial-look-accept" onClick={() => onDecide("accepted")}>{TUTORIAL_TEXT.accept}</Button>
          <Button data-so="tutorial-look-reject" onClick={() => onDecide("rejected")}>{TUTORIAL_TEXT.reject}</Button>
        </div>
      )}
    </div>
  );
};

const ReviewStep = ({ card, host, onCreated }: { card: TutorialCard; host?: WizardHost; onCreated: (message: string, ok: boolean) => void }) => {
  const draft = useDraftStore((state) => state.draft);
  const mutate = useDraftStore((state) => state.mutate);
  const environment = host?.environment(draft) ?? emptyEnvironment();
  const findings = reviewTutorialCard(card, environment);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const apply = async (op: ProvisioningOp) => {
    if (!host || busy) return;
    setBusy(true);
    const key = wizardSessionKey(useDraftStore.getState().draft);
    try {
      const { outcome, lapsed } = await provisionOwned(op, {
        ownership: draftOwnership,
        draft: () => useDraftStore.getState().draft,
        provision: (created, draft) => host.applyProvisioning(created, draft),
        recordCreated: (created) => {
          if (!host.loadSession || !host.saveSession) return;
          const { createdLorebooks: _coordinatorOwned, ...stored } = host.loadSession(key) ?? newWizardSession(key);
          if (!stored.applied.includes(created)) host.saveSession({ ...stored, applied: [...stored.applied, created] });
        },
        applyFollowUps: (created) => mutate((current) => applyOps(current, provisioningFollowUpOps(current, created))),
      });
      const message = lapsed ? lapsedProvisioningCopy(outcome.message, lapsed) : outcome.message;
      setResult({ ok: outcome.ok, message });
      onCreated(message, outcome.ok);
    } catch (caught) {
      setResult({ ok: false, message: studioFailure("Creating that card failed", caught) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      {findings.length === 0 ? <StatusText as="div" tone="ok" data-so="tutorial-clean">{TUTORIAL_TEXT.noFindings}</StatusText> : (
        <ul data-so="tutorial-findings" className="flex flex-col gap-1 text-xs">
          {findings.map((finding) => (
            <li key={finding.id} data-so="tutorial-finding" data-finding={finding.id} data-severity={finding.severity}>
              {finding.severity === "blocks" ? <StatusText as="span" tone="warn">Blocking: {finding.text}</StatusText> : finding.text}
            </li>
          ))}
        </ul>
      )}
      {tutorialBlocked(findings)
        ? <div data-so="tutorial-blocked" role="status" className="text-xs">{TUTORIAL_TEXT.blocked}</div>
        : <ProvisioningCard op={tutorialCardOp(card)} environment={environment} busy={busy} applied={result?.ok === true} result={result?.message ?? null}
          failed={result?.ok === false} onApply={(op) => void apply(op)} />}
    </div>
  );
};

const CharacterTutorial: React.FC<CharacterTutorialProps> = ({ host, draftStep, onShowTopic }) => {
  const mutate = useDraftStore((state) => state.mutate);
  const draft = useDraftStore((state) => state.draft);
  const [card, setCard] = useState<TutorialCard>(emptyTutorialCard);
  const [stepId, setStepId] = useState<TutorialStepId>("who");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [look, setLook] = useState<LookDecision>(null);
  const [lookShown, setLookShown] = useState(false);
  const firstField = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const index = TUTORIAL_STEPS.findIndex((entry) => entry.id === stepId);
  const step = TUTORIAL_STEPS[index];
  const update = (field: TutorialField, value: string) => {
    setCard((current) => ({ ...current, [field]: value }));
    if (field === "appearance" || field === "name") { setLook(null); setLookShown(false); }
  };
  const draftIt = async () => {
    if (!draftStep || busy || stepId === "review") return;
    setBusy(true);
    setNotice(null);
    try {
      const fields = parseTutorialDraft(stepId, await draftStep(renderTutorialDraftPrompt(stepId, card, { title: draft.title, description: draft.description })));
      if (!Object.keys(fields).length) setNotice(TUTORIAL_TEXT.draftFailed);
      setCard((current) => ({ ...current, ...fields }));
    } catch (caught) {
      setNotice(studioFailure("Drafting that step failed", caught));
    } finally {
      setBusy(false);
    }
  };
  const decideLook = (decision: Exclude<LookDecision, null>) => {
    if (decision === "accepted") {
      const ops = tutorialLookOps(useDraftStore.getState().draft, card);
      mutate((current) => ops.reduce(applyAgentOp, current));
    }
    setLook(decision);
  };
  return (
    <section id="so-character-tutorial" className="flex flex-col gap-3" aria-label={TUTORIAL_TEXT.heading}>
      <div className="text-[11px] st-muted">{TUTORIAL_TEXT.intro}</div>
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Character step">
        {TUTORIAL_STEPS.map((entry) => (
          <button key={entry.id} type="button" data-so="tutorial-step" data-step={entry.id} aria-pressed={entry.id === stepId}
            className={`st-tab rounded px-2 py-1 text-xs ${entry.id === stepId ? "st-tab-active" : ""}`} onClick={() => setStepId(entry.id)}>
            {entry.label}
          </button>
        ))}
      </div>
      <div data-so="tutorial-panel" data-step={step.id} className="st-subpanel flex flex-col gap-2 p-3">
        <span className="font-medium text-sm">{step.label}</span>
        <div data-so="tutorial-why" className="text-xs">{step.why}</div>
        <TopicLinks topics={step.topics} onShowTopic={onShowTopic} />
        {step.fields.map((field, position) => (
          <FieldInput key={field} field={field} value={card[field]} onChange={(value) => update(field, value)} inputRef={position === 0 ? firstField : undefined} />
        ))}
        {step.id === "first" && (
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" data-so="tutorial-opening" checked={card.opening} onChange={(event) => setCard((current) => ({ ...current, opening: event.target.checked }))} />
            {TUTORIAL_TEXT.opening}
          </label>
        )}
        {step.id !== "review" && (
          <div className="flex flex-wrap items-center gap-2">
            <Button data-so="tutorial-draft" disabled={!draftStep || busy} onClick={() => void draftIt()}>
              {busy ? TUTORIAL_TEXT.drafting : TUTORIAL_TEXT.draft}
            </Button>
            <Button data-so="tutorial-write" onClick={() => firstField.current?.focus()}>{TUTORIAL_TEXT.write}</Button>
          </div>
        )}
        {notice && <StatusText as="div" tone="warn" data-so="tutorial-notice" role="status">{notice}</StatusText>}
        {step.id === "look" && card.appearance.trim() && card.name.trim() && !lookShown && (
          <Button variant="primary" data-so="tutorial-propose-look" className="self-start" onClick={() => setLookShown(true)}>{TUTORIAL_TEXT.proposeLook}</Button>
        )}
        {step.id === "look" && lookShown && <LookCard card={card} decision={look} onDecide={decideLook} />}
        {step.id === "review" && <ReviewStep card={card} host={host} onCreated={(message, ok) => setNotice(ok ? null : message)} />}
      </div>
      <div className="flex gap-2">
        <Button data-so="tutorial-back" disabled={index === 0} onClick={() => setStepId(TUTORIAL_STEPS[index - 1]?.id ?? stepId)}>
          {TUTORIAL_TEXT.back}
        </Button>
        <Button data-so="tutorial-next" disabled={index === TUTORIAL_STEPS.length - 1}
          onClick={() => setStepId(TUTORIAL_STEPS[index + 1]?.id ?? stepId)}>
          {TUTORIAL_TEXT.next}
        </Button>
      </div>
    </section>
  );
};

export default CharacterTutorial;
