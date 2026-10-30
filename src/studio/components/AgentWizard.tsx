import { routeFailure, studioFailure } from "../errorCopy";
import React, { useEffect, useRef, useState } from "react";

import {
  AGENT_MODES, addAuthorNote, addUndoNote,
  agentStats, applyAgentOp, applyProvisioningFollowUps, approvePlan, budgetSliceText, isProvisionOp, checkToolCall, confirmProvisioning, decideStep, driveAgent,
  newAgentSession,
  opPreview, pendingStep, continueAgent, recheckReadBack, setAgentMode, unsettledReadBacks, type AgentMode, type AgentOp, type AgentRunner, type AgentSession, type AgentStep,
} from "@copilot/agent/index";
import { emptyEnvironment, type ProvisioningOp } from "@wizard/index";
import { draftOwnership } from "../agentHost";
import { coverageGaps, storyCoverage } from "../coverage";
import { useDraftStore } from "../draft";
import ProvisioningCard from "./ProvisioningCard";
import type { WizardHost } from "./StudioCopilot";
import { Button } from "@components/ui/Button";
import { Callout } from "@components/ui/Callout";
import { StatusText } from "@components/ui/StatusText";

export type AgentTurnRunner = AgentRunner;

type Props = {
  runTurn?: AgentTurnRunner;
  host?: WizardHost;
  initial?: AgentSession | null;
  onPersist?: (session: AgentSession | null) => void;
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

const FAILED_TEXT = "Failed";

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
  ops: readonly ProvisioningOp[];
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
      {problem ? <Callout tone="error" size="sm" role="alert"><p>{problem}</p></Callout> : null}
      <div className="flex flex-wrap items-center gap-2">
        {editing
          ? <Button variant="primary" data-so="agent-accept" disabled={busy} onClick={acceptEdited}>Accept edited</Button>
          : <Button variant="primary" data-so="agent-accept" disabled={busy} onClick={() => onAccept()}>Accept</Button>}
        {!editing ? <Button data-so="agent-edit" disabled={busy} onClick={() => setEditing(true)}>Edit</Button> : null}
        <ReasonInput reason={reason} onChange={setReason} />
        <Button data-so="agent-reject" disabled={busy} onClick={() => onReject(reason)}>Reject</Button>
      </div>
    </section>
  );
};

const ProvisionCard = ({ step, busy, host, ops, onReject, onProvision }: CardProps) => {
  const [reason, setReason] = useState("");
  const draft = useDraftStore((state) => state.draft);
  if (!step.op || !isProvisionOp(step.op)) return null;
  return (
    <section data-so="agent-card" data-kind="provision" className="flex flex-col gap-2" aria-label="Agent asset">
      {step.thought ? <div className="text-xs st-muted">{step.thought}</div> : null}
      <ProvisioningCard op={step.op} environment={host?.environment(draft) ?? emptyEnvironment()} busy={busy} context={{ draft, ops }} onApply={(op) => onProvision(op)} />
      <div className="flex items-center gap-2">
        <ReasonInput reason={reason} onChange={setReason} />
        <Button data-so="agent-reject" disabled={busy} onClick={() => onReject(reason)}>Reject</Button>
      </div>
    </section>
  );
};

const KEPT_STEPS: ReadonlySet<AgentStep["status"]> = new Set(["review", "pending", "applied"]);

const sessionOps = (session: AgentSession): ProvisioningOp[] =>
  session.steps.flatMap((step) => (step.op && KEPT_STEPS.has(step.status) && isProvisionOp(step.op) ? [step.op] : []));

const ReadBacks = ({ session, busy, onRecheck }: { session: AgentSession; busy: boolean; onRecheck: (step: AgentStep) => void }) => {
  const steps = unsettledReadBacks(session);
  if (!steps.length) return null;
  return (
    <ul data-so="agent-readbacks" className="flex flex-col gap-1 text-[11px]" aria-label="Cards to check">
      {steps.map((step) => (
        <li key={step.id} data-so="agent-readback" data-state={step.readBack.state}>
          <Callout tone="warn" size="sm" actions={<Button data-so="agent-recheck" size="sm" disabled={busy} onClick={() => onRecheck(step)}>Check again</Button>}>
            <p>#{step.id} {step.observation}</p>
          </Callout>
        </li>
      ))}
    </ul>
  );
};

const recheckCard = async (host: WizardHost | undefined, step: AgentStep, from: AgentSession): Promise<AgentSession> => {
  if (!host?.recheckCard || !step.readBack || step.op?.kind !== "createCharacterCard") return from;
  const readBack = await host.recheckCard(step.op, step.readBack.avatar, useDraftStore.getState().draft);
  return recheckReadBack(from, step.id, readBack, step.op.name);
};

const recheckAll = (host: WizardHost, initial: AgentSession) => unsettledReadBacks(initial)
  .filter((step) => step.readBack.state === "unconfirmed")
  .reduce<Promise<AgentSession>>(async (from, step) => recheckCard(host, step, await from), Promise.resolve(initial));

type ReadBackChecks = {
  session: AgentSession | null;
  initial: AgentSession | null;
  host?: WizardHost;
  commit: (session: AgentSession) => AgentSession;
  setError: (error: string | null) => void;
};

const useReadBackChecks = ({ session, initial, host, commit, setError }: ReadBackChecks) => {
  const opened = useRef<{ initial: AgentSession | null; commit: ReadBackChecks["commit"] }>({ initial, commit });
  useEffect(() => {
    const { initial: first, commit: save } = opened.current;
    if (!first || !host?.recheckCard) return;
    void recheckAll(host, first).then((next) => { if (next !== first) save(next); }, () => undefined);
  }, [host]);
  return async (step: AgentStep) => {
    if (!session) return;
    try {
      commit(await recheckCard(host, step, session));
    } catch (caught) {
      setError(studioFailure("Checking that card failed", caught));
    }
  };
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
        <Button variant="primary" id="so-agent-start" disabled={busy || !goal.trim()} onClick={() => onStart(goal, mode)}>Plan it</Button>
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
      <Button variant="primary" id="so-agent-go" className="self-start" disabled={busy || !text.trim()} onClick={() => onGo(text.split("\n"))}>Go</Button>
    </div>
  );
};

const lapsedCopy = (lapsed: string) => `The agent stopped: the draft changed under it (${lapsed}). Nothing more was written.`;

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

  const drive = async (resumed: AgentSession) => {
    if (!runTurn) return;
    const undone = useDraftStore.getState().takeUndone();
    const start = undone.reduce((session, note) => addUndoNote(session, note), resumed);
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
      setError(routeFailure("The agent call failed", caught));
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
      setError(studioFailure("Creating that asset failed", caught));
      setBusy(false);
    }
  };

  const recheckOne = useReadBackChecks({ session, initial, host, commit, setError });
  const newGoal = () => {
    useDraftStore.getState().endRuns();
    void runTurn?.close?.();
    setSession(null);
    onPersist?.(null);
  };

  if (!runTurn) {
    return (
      <div className="st-subpanel rounded p-3 text-sm st-muted" role="status" aria-label="Agent unavailable">
        The agent needs the authoring model. Pick a Connection Manager profile in the settings panel.
      </div>
    );
  }

  const pending = session ? pendingStep(session) : null;
  const stats = session ? agentStats(session) : null;

  return (
    <div id="so-agent" className="flex flex-col gap-3" role="region" aria-label="Story agent">
      {!session ? <Start busy={busy} onStart={(goal, mode) => void drive(newAgentSession(goal, mode))} /> : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span id="so-agent-status" role="status" className="st-pill px-2 py-0.5" data-status={session.status}>{busy ? "Working…" : error ? FAILED_TEXT : STATUS_TEXT[session.status]}</span>
            <select aria-label="Agent mode" className="text_pole st-input" value={session.mode} disabled={busy} onChange={(event) => commit(setAgentMode(session, event.target.value as AgentMode))}>
              {AGENT_MODES.map((entry) => <option key={entry} value={entry}>{MODE_LABELS[entry]}</option>)}
            </select>
            <span className="st-muted">step {session.steps.length} of {session.budget.maxSteps} · ~{Math.round(session.budget.usedTokens / 1000)}k tokens</span>
            {stats ? <span className="st-muted">{stats.accepted}/{stats.proposed} changes kept</span> : null}
            {busy ? <Button id="so-agent-stop" onClick={() => { stopRequested.current = true; }}>Stop</Button> : null}
            {!busy && (session.status === "stopped" || session.status === "budget" || session.status === "done") ? (
              <Button id="so-agent-continue" onClick={() => void drive(continueAgent(session))}>Continue</Button>
            ) : null}
            {!busy && session.status === "budget" ? (
              <span data-so="agent-budget-note" className="st-muted">Continue grants a fresh budget: {budgetSliceText()}.</span>
            ) : null}
            {!busy && error && session.status !== "stopped" && session.status !== "budget" ? (
              <Button id="so-agent-retry" onClick={() => void drive(session)}>Retry</Button>
            ) : null}
            {!busy && session.status !== "awaiting-author" ? <Button id="so-agent-new-goal" onClick={newGoal}>New goal</Button> : null}
          </div>
          {session.fallback ? <StatusText as="div" tone="warn" data-so="agent-fell-back" role="status">{session.fallback}</StatusText> : null}
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
              ops={sessionOps(session)}
              onAccept={(op) => decide(pending, { kind: "accept", op })}
              onReject={(reason) => decide(pending, { kind: "reject", reason })}
              onProvision={(op) => void provision(pending, op)}
            />
          ) : null}
          {session.status === "stopped" && session.stopReason ? (
            <Callout tone="error" size="sm" data-so="agent-stop-reason" role="status"><p>{session.stopReason}</p></Callout>
          ) : null}
          {session.status === "done" ? (
            <div data-so="agent-done" className="st-subpanel rounded p-2 text-sm">
              {session.summary || "The agent finished its plan."} Review the changes, then Save — nothing reaches the library until you do.
            </div>
          ) : null}
          <ReadBacks session={session} busy={busy} onRecheck={(step) => void recheckOne(step)} />
          <StepLog steps={session.steps} />
          <AuthorNote busy={busy} onSend={(text) => commit(addAuthorNote(session, text))} />
        </>
      )}
      {error ? <Callout tone="error" role="alert"><p>{error}</p></Callout> : null}
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
      <Button disabled={busy || !text.trim()} onClick={() => { onSend(text); setText(""); }}>Tell the agent</Button>
    </div>
  );
};

export default AgentWizard;
