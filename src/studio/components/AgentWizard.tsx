import React, { useEffect, useRef, useState } from "react";

import {
  AGENT_MODES, addAuthorNote, agentStats, applyAgentOp, applyProvisioningFollowUps, approvePlan, isProvisionOp, checkToolCall, confirmProvisioning, decideStep, driveAgent, newAgentSession,
  opPreview, pendingStep, resumeAgent, setAgentMode, type AgentMode, type AgentOp, type AgentRunner, type AgentSession, type AgentStep,
} from "@copilot/agent/index";
import { emptyEnvironment } from "@wizard/index";
import { draftOwnership } from "../agentHost";
import { coverageGaps, storyCoverage } from "../coverage";
import { useDraftStore } from "../draft";
import ProvisioningCard from "./ProvisioningCard";
import type { WizardHost } from "./StudioCopilot";

export type AgentTurnRunner = AgentRunner;

type Props = {
  runTurn?: AgentTurnRunner;
  host?: WizardHost;
  initial?: AgentSession | null;
  onPersist?: (session: AgentSession) => void;
};

const MODE_LABELS: Record<AgentMode, string> = {
  review: "Review every change",
  "auto-draft": "Write to the draft, review before saving",
};

const STATUS_TEXT: Record<AgentSession["status"], string> = {
  planning: "Planning",
  "awaiting-plan": "Waiting for you to agree the plan",
  running: "Working",
  "awaiting-author": "Waiting for your decision",
  done: "Finished",
  stopped: "Stopped",
  budget: "Out of budget",
};

const pretty = (value: unknown) => JSON.stringify(value, null, 2);

const Coverage = () => {
  const draft = useDraftStore((state) => state.draft);
  const gaps = coverageGaps(storyCoverage(draft));
  return (
    <details id="so-agent-coverage" className="text-[11px]">
      <summary className="cursor-pointer st-muted">Coverage — {gaps.length ? `${gaps.length} field(s) this story does not use yet` : "every field is in use"}</summary>
      <ul className="flex flex-col gap-1 pt-1">
        {gaps.map((row) => (
          <li key={row.id} data-so="coverage-row">
            <span className="st-pill px-1 text-[10px]">{row.scope === "story" ? "story" : `${row.used}/${row.total}`}</span>
            <span className="ml-2">{row.label}</span>
            <span className="ml-2 st-muted">{row.adds}</span>
          </li>
        ))}
      </ul>
    </details>
  );
};

const StepLog = ({ steps }: { steps: AgentStep[] }) => (
  <ol className="st-subpanel flex flex-col gap-1 overflow-auto p-2 text-xs" aria-label="Agent steps">
    {steps.length === 0 ? <li className="st-muted">No steps yet.</li> : steps.map((step) => (
      <li key={step.id} data-so="agent-step" data-status={step.status}>
        <details>
          <summary className="cursor-pointer">
            #{step.id} <code>{step.call.tool}</code> <span className="st-pill px-1 text-[10px]">{step.status}</span>
            {step.route === "harness" ? <span className="ml-2 st-muted">harness</span> : null}
            {step.thought ? <span className="ml-2 st-muted">{step.thought}</span> : null}
          </summary>
          <pre className="whitespace-pre-wrap">{step.observation}</pre>
          {step.check ? <pre className="whitespace-pre-wrap st-muted">{step.check}</pre> : null}
        </details>
      </li>
    ))}
  </ol>
);

const ReasonInput = ({ reason, onChange }: { reason: string; onChange: (reason: string) => void }) => (
  <input
    data-so="agent-reject-reason"
    aria-label="Why not"
    className="text_pole st-input flex-1"
    placeholder="Why not? (goes back to the agent)"
    value={reason}
    onChange={(event) => onChange(event.target.value)}
  />
);

interface CardProps {
  step: AgentStep;
  busy: boolean;
  host?: WizardHost;
  onAccept: (op?: AgentOp) => void;
  onReject: (reason: string) => void;
  onProvision: (op: AgentOp) => void;
}

const EditCard = ({ step, busy, onAccept, onReject }: CardProps) => {
  const draft = useDraftStore((state) => state.draft);
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(() => pretty(step.op));
  const [problem, setProblem] = useState<string | null>(null);
  const preview = step.op ? opPreview(draft, step.op) : null;
  const acceptEdited = () => {
    try {
      const { kind, ...args } = JSON.parse(text) as Record<string, unknown>;
      const check = checkToolCall({ tool: String(kind), args });
      if (!check.ok || !check.op || isProvisionOp(check.op)) return setProblem(check.ok ? "That is not a draft change." : check.message);
      setProblem(null);
      onAccept(check.op);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Not JSON");
    }
  };
  return (
    <section data-so="agent-card" className="st-subpanel flex flex-col gap-2 p-2" aria-label="Agent change">
      <div className="flex flex-wrap items-center gap-2">
        <span className="st-pill px-2 py-0.5 text-[10px]">{preview?.action ?? "change"}</span>
        <span className="text-sm">{preview?.label}</span>
      </div>
      {step.thought ? <div className="text-xs st-muted">{step.thought}</div> : null}
      {preview ? (
        <div className="grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-2">
          <div className="st-subpanel rounded px-2 py-1" aria-label="Before"><span className="st-muted">Before</span><pre className="whitespace-pre-wrap">{pretty(preview.before)}</pre></div>
          <div className="st-subpanel rounded px-2 py-1" aria-label="After"><span className="st-muted">After</span><pre className="whitespace-pre-wrap">{pretty(preview.after)}</pre></div>
        </div>
      ) : null}
      {editing ? (
        <textarea
          data-so="agent-edit-text"
          aria-label="Edit the change"
          className="text_pole st-input min-h-[60px] text-xs"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      ) : null}
      {problem ? <div className="st-alert-error rounded px-2 py-1 text-[11px]" role="alert">{problem}</div> : null}
      <div className="flex flex-wrap items-center gap-2">
        {editing
          ? <button type="button" data-so="agent-accept" className="st-button primary" disabled={busy} onClick={acceptEdited}>Accept edited</button>
          : <button type="button" data-so="agent-accept" className="st-button primary" disabled={busy} onClick={() => onAccept()}>Accept</button>}
        {!editing ? <button type="button" data-so="agent-edit" className="st-button secondary" disabled={busy} onClick={() => setEditing(true)}>Edit</button> : null}
        <ReasonInput reason={reason} onChange={setReason} />
        <button type="button" data-so="agent-reject" className="st-button secondary" disabled={busy} onClick={() => onReject(reason)}>Reject</button>
      </div>
    </section>
  );
};

const ProvisionCard = ({ step, busy, host, onReject, onProvision }: CardProps) => {
  const [reason, setReason] = useState("");
  const draft = useDraftStore((state) => state.draft);
  if (!step.op || !isProvisionOp(step.op)) return null;
  return (
    <section data-so="agent-card" data-kind="provision" className="flex flex-col gap-2" aria-label="Agent asset">
      {step.thought ? <div className="text-xs st-muted">{step.thought}</div> : null}
      <ProvisioningCard op={step.op} environment={host?.environment(draft) ?? emptyEnvironment()} busy={busy} onApply={(op) => onProvision(op)} />
      <div className="flex items-center gap-2">
        <ReasonInput reason={reason} onChange={setReason} />
        <button type="button" data-so="agent-reject" className="st-button secondary" disabled={busy} onClick={() => onReject(reason)}>Reject</button>
      </div>
    </section>
  );
};

const PendingCard = (props: CardProps) => (props.step.family === "provision" ? <ProvisionCard {...props} /> : <EditCard {...props} />);

const Start = ({ busy, onStart }: { busy: boolean; onStart: (goal: string, mode: AgentMode) => void }) => {
  const [goal, setGoal] = useState("");
  const [mode, setMode] = useState<AgentMode>("review");
  return (
    <div className="flex flex-col gap-2">
      <textarea
        id="so-agent-goal"
        aria-label="What should the agent build"
        className="text_pole st-input min-h-[60px]"
        placeholder="The premise, and what you want the agent to build or fix."
        value={goal}
        onChange={(event) => setGoal(event.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <select id="so-agent-mode" aria-label="Agent mode" className="text_pole st-input" value={mode} onChange={(event) => setMode(event.target.value as AgentMode)}>
          {AGENT_MODES.map((entry) => <option key={entry} value={entry}>{MODE_LABELS[entry]}</option>)}
        </select>
        <button id="so-agent-start" type="button" className="st-button primary" disabled={busy || !goal.trim()} onClick={() => onStart(goal, mode)}>Plan it</button>
      </div>
      <div className="text-[11px] st-muted">The agent plans first. Cards, lorebooks and groups always wait for you, in both modes, and only your Save writes the story.</div>
    </div>
  );
};

const PlanEditor = ({ session, busy, onGo }: { session: AgentSession; busy: boolean; onGo: (plan: string[]) => void }) => {
  const [text, setText] = useState(session.plan.join("\n"));
  return (
    <div className="flex flex-col gap-2">
      <textarea id="so-agent-plan" aria-label="The agent's plan" className="text_pole st-input min-h-[60px]" value={text} onChange={(event) => setText(event.target.value)} />
      <button id="so-agent-go" type="button" className="st-button primary self-start" disabled={busy || !text.trim()} onClick={() => onGo(text.split("\n"))}>Go</button>
    </div>
  );
};

const AgentWizard: React.FC<Props> = ({ runTurn, host, initial = null, onPersist }) => {
  const mutate = useDraftStore((state) => state.mutate);
  const [session, setSession] = useState<AgentSession | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopRequested = useRef(false);

  const commit = (next: AgentSession) => {
    setSession(next);
    onPersist?.(next);
    return next;
  };

  useEffect(() => () => {
    useDraftStore.getState().endRuns();
    void runTurn?.close?.();
  }, [runTurn]);

  const lapsedCopy = (lapsed: string) => `The agent stopped: the draft changed under it (${lapsed}). Nothing more was written.`;

  const drive = async (start: AgentSession) => {
    if (!runTurn) return;
    stopRequested.current = false;
    setBusy(true);
    setError(null);
    try {
      const outcome = await driveAgent(start, {
        runner: runTurn,
        ownership: draftOwnership,
        draft: () => useDraftStore.getState().draft,
        applyOp: (op) => mutate((draft) => applyAgentOp(draft, op)),
        commit,
        stopRequested: () => stopRequested.current,
      });
      if (outcome.lapsed) setError(lapsedCopy(outcome.lapsed));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The agent call failed");
    } finally {
      setBusy(false);
    }
  };

  const decide = (step: AgentStep, decision: Parameters<typeof decideStep>[2]) => {
    if (!session) return;
    const result = decideStep(session, step.id, decision, useDraftStore.getState().draft);
    const apply = result.apply;
    if (apply) mutate((draft) => applyAgentOp(draft, apply));
    void drive(result.session);
  };

  const provision = async (step: AgentStep, op: AgentOp) => {
    if (!session || !host || !isProvisionOp(op)) return;
    setBusy(true);
    try {
      const outcome = await confirmProvisioning(session, step, op, {
        ownership: draftOwnership,
        draft: () => useDraftStore.getState().draft,
        provision: (created, draft) => host.applyProvisioning(created, draft),
        applyFollowUps: (created) => mutate((draft) => applyProvisioningFollowUps(draft, created)),
      });
      setBusy(false);
      if (outcome.lapsed) {
        setError(lapsedCopy(outcome.lapsed));
        return;
      }
      void drive(outcome.session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Provisioning failed");
      setBusy(false);
    }
  };

  const newGoal = () => {
    useDraftStore.getState().endRuns();
    void runTurn?.close?.();
    setSession(null);
  };

  if (!runTurn) {
    return <div className="st-subpanel rounded p-3 text-sm st-muted" aria-label="Agent unavailable">The agent needs the authoring model. Pick a Connection Manager profile in the settings panel.</div>;
  }

  const pending = session ? pendingStep(session) : null;
  const stats = session ? agentStats(session) : null;

  return (
    <div id="so-agent" className="flex flex-col gap-3" aria-label="Story agent">
      {!session ? <Start busy={busy} onStart={(goal, mode) => void drive(newAgentSession(goal, mode))} /> : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span id="so-agent-status" className="st-pill px-2 py-0.5" data-status={session.status}>{busy ? "Working…" : STATUS_TEXT[session.status]}</span>
            <select aria-label="Agent mode" className="text_pole st-input" value={session.mode} disabled={busy} onChange={(event) => commit(setAgentMode(session, event.target.value as AgentMode))}>
              {AGENT_MODES.map((entry) => <option key={entry} value={entry}>{MODE_LABELS[entry]}</option>)}
            </select>
            <span className="st-muted">step {session.steps.length} of {session.budget.maxSteps} · ~{Math.round(session.budget.usedTokens / 1000)}k tokens</span>
            {stats ? <span className="st-muted">{stats.accepted}/{stats.proposed} changes kept</span> : null}
            {busy ? <button id="so-agent-stop" type="button" className="st-button secondary" onClick={() => { stopRequested.current = true; }}>Stop</button> : null}
            {!busy && (session.status === "stopped" || session.status === "budget") ? (
              <button id="so-agent-continue" type="button" className="st-button secondary" onClick={() => void drive(resumeAgent(session))}>Continue</button>
            ) : null}
            {!busy && session.status !== "awaiting-author" ? <button type="button" className="st-button secondary" onClick={newGoal}>New goal</button> : null}
          </div>
          {session.status === "awaiting-plan" ? <PlanEditor session={session} busy={busy} onGo={(plan) => void drive(approvePlan(session, plan))} /> : null}
          {session.plan.length && session.status !== "awaiting-plan" ? (
            <ol className="text-xs" aria-label="Agreed plan">{session.plan.map((step, index) => <li key={index}>{`${index + 1}. ${step}`}</li>)}</ol>
          ) : null}
          {pending ? (
            <PendingCard
              key={pending.id}
              step={pending}
              busy={busy}
              host={host}
              onAccept={(op) => decide(pending, { kind: "accept", op })}
              onReject={(reason) => decide(pending, { kind: "reject", reason })}
              onProvision={(op) => void provision(pending, op)}
            />
          ) : null}
          {session.status === "done" ? (
            <div data-so="agent-done" className="st-subpanel rounded p-2 text-sm">
              {session.summary || "The agent finished its plan."} Review the changes, then Save — nothing reaches the library until you do.
            </div>
          ) : null}
          <StepLog steps={session.steps} />
          <AuthorNote busy={busy} onSend={(text) => commit(addAuthorNote(session, text))} />
        </>
      )}
      {error ? <div className="st-alert-error rounded px-3 py-2 text-sm" role="alert">{error}</div> : null}
      <Coverage />
    </div>
  );
};

const AuthorNote = ({ busy, onSend }: { busy: boolean; onSend: (text: string) => void }) => {
  const [text, setText] = useState("");
  return (
    <div className="flex items-center gap-2">
      <input
        aria-label="Note to the agent"
        className="text_pole st-input flex-1"
        placeholder="A note the agent reads on its next step"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <button type="button" className="st-button secondary" disabled={busy || !text.trim()} onClick={() => { onSend(text); setText(""); }}>Tell the agent</button>
    </div>
  );
};

export default AgentWizard;
