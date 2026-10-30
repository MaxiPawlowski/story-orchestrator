import { useEffect, useRef, useState, type ReactNode } from "react";
import type { DriverContext, Suggestion } from "@copilot/index";
import type { AgencyPolicy } from "@engine/index";
import type { GateRow } from "@runtime/gateReadout";
import { gateLeafText } from "@runtime/gateReadout";
import type { PipelineStatus } from "@runtime/pipeline";
import { Button } from "@components/ui/Button";
import { Badge } from "@components/ui/Badge";
import { Select, TextInput } from "@components/ui/Field";

export interface DriverController {
  suggest: () => Promise<Suggestion[]>;
  nudge: (text: string) => void;
  clearNudge: () => void;
  probe: () => Promise<void>;
  advance: (checkpointId: string) => Promise<void>;
  report: () => Promise<string>;
  stepBack: () => Promise<{ ok: boolean; detail: string }>;
  resetQuality: (key: string) => Promise<void>;
}

export interface RecoveryTarget {
  from: string;
  to: string;
  keys: string[];
  checkpointName: string;
}

export interface DriverPanelProps {
  context: DriverContext | null;
  checkpoints: Array<{ id: string; name: string; active: boolean }>;
  activeNudge: string | null;
  controller: DriverController;
  authorView?: boolean;
  agency?: AgencyPolicy | null;
  recovery?: RecoveryTarget | null;
  boundary?: number;
  pipeline?: Pick<PipelineStatus, "state" | "text"> | null;
  gates?: GateRow[] | null;
  copilot?: boolean;
  alerts?: ReactNode;
  footer?: ReactNode;
}

const RecoveryControls = ({ recovery, stepBack, onStatus }: {
  recovery: RecoveryTarget;
  stepBack: () => Promise<{ ok: boolean; detail: string }>;
  onStatus: (text: string) => void;
}) => {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const doStep = async () => {
    if (!confirm) { setConfirm(true); return; }
    setConfirm(false);
    setBusy(true);
    const outcome = await stepBack();
    onStatus(outcome.ok ? `Stepped back to ${outcome.detail}.` : outcome.detail);
    setBusy(false);
  };
  return (
    <div data-so="driver-recovery" className="so-steer-block" aria-label="Transition recovery">
      <h4>Recovery</h4>
      <p>Last move: {recovery.from} → {recovery.checkpointName}. Gate: {recovery.keys.join(", ") || "none"}.</p>
      <Button size="sm" variant={confirm ? "danger" : "secondary"} busy={busy} onClick={() => void doStep()}>{confirm ? "Confirm step back" : "Step back"}</Button>
      {confirm ? <p className="so-muted">Re-opens the previous checkpoint, resets {recovery.keys.join(", ") || "no gate keys"}, and leaves the messages.</p> : null}
    </div>
  );
};

const UnmetGates = ({ gates, fallback }: { gates: GateRow[] | null | undefined; fallback: string[] }) => {
  const open = gates ? gates.filter((row) => !row.met) : null;
  if (open ? !open.length : !fallback.length) return null;
  return (
    <div className="so-steer-block" data-so="steer-gates">
      <h4>Unmet gates</h4>
      <ul className="so-steer-gates">
        {open ? open.map((row) => (
          <li key={row.to} data-so="steer-gate" title={row.raw}>
            {row.leaves.filter((leaf) => !leaf.met).map((leaf) => <span key={leaf.key} className="so-steer-leaf">{gateLeafText(leaf)}</span>)}
            <span className="so-muted">→ {row.toName}</span>
          </li>
        )) : fallback.map((gate) => <li key={gate} data-so="steer-gate">{gate}</li>)}
      </ul>
    </div>
  );
};

const DriverPanel = ({
  context, checkpoints, activeNudge, controller, authorView = true, agency = null, recovery = null, boundary, pipeline = null, gates = null, copilot = true, alerts, footer,
}: DriverPanelProps) => {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [report, setReport] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [advanceTarget, setAdvanceTarget] = useState<string>("");
  const [confirmAdvance, setConfirmAdvance] = useState(false);
  const [nudgeText, setNudgeText] = useState("");
  const suggestionsRef = useRef<HTMLDivElement | null>(null);
  const activeCheckpointId = context?.activeCheckpointId ?? null;

  useEffect(() => {
    setSuggestions([]);
    setReport("");
    setAdvanceTarget("");
    setConfirmAdvance(false);
  }, [activeCheckpointId]);

  useEffect(() => {
    if (suggestions.length > 0) suggestionsRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [suggestions]);

  if (!context) {
    return <div className="so-steer-body" aria-label="Driver unavailable"><p className="so-muted">Load a story to use the in-play driver.</p>{footer}</div>;
  }

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label);
    setStatus("");
    try {
      await action();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

  const doSuggest = () => run("suggest", async () => { setSuggestions(await controller.suggest()); });
  const doReport = () => run("report", async () => { setReport(await controller.report()); });
  const doProbe = () => run("probe", async () => { await controller.probe(); setStatus("Probe scheduled."); });
  const doAdvance = () => {
    if (!advanceTarget) return;
    if (!confirmAdvance) { setConfirmAdvance(true); return; }
    setConfirmAdvance(false);
    const name = checkpoints.find((checkpoint) => checkpoint.id === advanceTarget)?.name ?? advanceTarget;
    void run("advance", async () => { await controller.advance(advanceTarget); setStatus(`Advanced to ${name}.`); });
  };
  const applyNudge = (text: string) => { controller.nudge(text); setNudgeText(""); };

  const targets = checkpoints.filter((checkpoint) => !checkpoint.active);
  const name = context.activeCheckpointName ?? context.activeCheckpointId ?? "—";

  return (
    <div className="so-steer-body" aria-label="In-play driver">
      <div className="so-steer-block" data-so="steer-checkpoint">
        <p className="so-steer-checkpoint">
          <strong>{name}</strong>
          {context.activeCheckpointId && context.activeCheckpointId !== name ? <span className="so-mono so-muted"> {context.activeCheckpointId}</span> : null}
        </p>
        <p className="so-muted">{context.activeObjective || "No objective"}</p>
        <p>
          {boundary !== undefined ? <span data-so="steer-boundary">boundary {boundary}</span> : null}
          {pipeline ? <span data-so="steer-pipeline" data-state={pipeline.state}> · {pipeline.text}</span> : null}
        </p>
        {authorView && context.ownNote === false && (
          <p data-so="driver-objective-line" className="so-muted">No author note of its own; objective line {context.objectiveLine ? "on" : "off"}</p>
        )}
      </div>
      {alerts}
      {authorView && agency && (
        <div data-so="agency-policy" className="so-steer-block">
          <h4>Agency</h4>
          <p>
            {agency.objective_kind === "player_action" ? "Needs the player's own act" : "World pressure"}
            {agency.protect_player_choice ? " · choices protected" : " · choices not protected"}
            {agency.never_narrate_player_action ? " · never narrates the player" : ""}
            {agency.alternate ? ` · alternate: ${agency.alternate}` : ""}
          </p>
        </div>
      )}
      {authorView && <UnmetGates gates={gates} fallback={context.unmetGates} />}
      {authorView && recovery ? <RecoveryControls recovery={recovery} stepBack={controller.stepBack} onStatus={setStatus} /> : null}
      {activeNudge ? (
        <div className="so-steer-block so-steer-row" aria-label="Active nudge">
          <Badge tone="info">Nudge</Badge>
          <span className="so-grow">{activeNudge}</span>
          <Button size="sm" onClick={() => controller.clearNudge()}>Clear</Button>
        </div>
      ) : null}
      <div className="so-steer-row" data-so="steer-actions">
        {copilot && <Button size="sm" icon="fa-lightbulb" busy={busy === "suggest"} disabled={busy !== null && busy !== "suggest"} onClick={() => void doSuggest()}>Suggest</Button>}
        <Button size="sm" icon="fa-magnifying-glass" busy={busy === "probe"} disabled={busy !== null && busy !== "probe"} onClick={() => void doProbe()}>Probe</Button>
        {copilot && <Button size="sm" icon="fa-file-lines" busy={busy === "report"} disabled={busy !== null && busy !== "report"} onClick={() => void doReport()}>Report</Button>}
      </div>
      <div className="so-steer-row">
        <Select size="full" aria-label="Advance target" value={advanceTarget} onChange={(event) => { setAdvanceTarget(event.target.value); setConfirmAdvance(false); }}>
          <option value="">Advance to…</option>
          {targets.map((checkpoint) => <option key={checkpoint.id} value={checkpoint.id}>{checkpoint.name}</option>)}
        </Select>
        <Button size="sm" variant={confirmAdvance ? "danger" : "secondary"} disabled={!advanceTarget || busy !== null} onClick={doAdvance}>{confirmAdvance ? "Confirm advance" : "Advance"}</Button>
      </div>
      {copilot && (
        <div className="so-steer-row">
          <TextInput size="full" aria-label="Nudge text" placeholder="One-shot steering note" value={nudgeText} onChange={(event) => setNudgeText(event.target.value)} />
          <Button size="sm" disabled={!nudgeText.trim()} onClick={() => applyNudge(nudgeText.trim())}>Nudge</Button>
        </div>
      )}
      {suggestions.length > 0 && (
        <div ref={suggestionsRef} className="so-steer-block" aria-label="Driver suggestions">
          {suggestions.map((suggestion, index) => (
            <div key={index} className="so-steer-suggestion">
              <strong>{suggestion.title}</strong>
              <p className="so-muted">{suggestion.rationale}</p>
              <Button size="sm" variant="ghost" onClick={() => applyNudge(`${suggestion.title}. ${suggestion.rationale}`)}>Nudge with this</Button>
            </div>
          ))}
        </div>
      )}
      {report ? (
        <div className="so-steer-block" aria-label="Driver report">
          <h4>Report</h4>
          <p className="so-pre">{report}</p>
        </div>
      ) : null}
      {status ? <p role="status">{status}</p> : null}
      {footer}
    </div>
  );
};

export default DriverPanel;
