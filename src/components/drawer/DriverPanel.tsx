import React, { useEffect, useRef, useState } from "react";
import type { DriverContext, Suggestion } from "@copilot/index";
import type { AgencyPolicy } from "@engine/index";

export interface DriverController {
  suggest: () => Promise<Suggestion[]>;
  nudge: (text: string) => void;
  clearNudge: () => void;
  probe: () => Promise<void>;
  advance: (checkpointId: string) => Promise<void>;
  report: () => Promise<string>;
  /** Author recovery: undo the last gate advance (resetting its gate keys) or one latched value. */
  stepBack: () => Promise<{ ok: boolean; detail: string }>;
  resetQuality: (key: string) => Promise<void>;
}

export interface RecoveryTarget {
  from: string;
  to: string;
  keys: string[];
  checkpointName: string;
}

type Props = {
  context: DriverContext | null;
  checkpoints: Array<{ id: string; name: string; active: boolean }>;
  activeNudge: string | null;
  controller: DriverController;
  authorView?: boolean;
  /** The policy in effect, so the author can see what steering must respect. */
  agency?: AgencyPolicy | null;
  /** The last gate advance into the active checkpoint, for the author's step-back control. */
  recovery?: RecoveryTarget | null;
};

const RecoveryControls: React.FC<{
  recovery: RecoveryTarget;
  stepBack: () => Promise<{ ok: boolean; detail: string }>;
  onStatus: (text: string) => void;
}> = ({ recovery, stepBack, onStatus }) => {
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
    <div data-so="driver-recovery" className="st-subpanel flex flex-col gap-1 p-2" aria-label="Transition recovery">
      <div className="font-medium opacity-100">Recovery</div>
      <div className="opacity-80">
        Last move: {recovery.from} → {recovery.checkpointName}. Gate: {recovery.keys.join(", ") || "none"}.
      </div>
      <button type="button" className="st-button secondary self-start" disabled={busy} onClick={() => void doStep()}>
        {busy ? "…" : confirm ? "Confirm step back" : "Step back"}
      </button>
      {confirm ? (
        <span className="opacity-70">
          Re-opens the previous checkpoint, resets {recovery.keys.join(", ") || "no gate keys"}, and leaves the messages.
        </span>
      ) : null}
    </div>
  );
};

const DriverPanel: React.FC<Props> = ({ context, checkpoints, activeNudge, controller, authorView = true, agency = null, recovery = null }) => {
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
    return <div className="text-xs opacity-70" aria-label="Driver unavailable">Load a story to use the in-play driver.</div>;
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

  return (
    <div className="flex flex-col gap-2 text-xs" aria-label="In-play driver">
      <div className="font-medium opacity-100">Driver</div>
      <div className="opacity-80">Active: {context.activeCheckpointName ?? context.activeCheckpointId ?? "—"} — {context.activeObjective || "(no objective)"}</div>
      {authorView && context.ownNote === false && (
        <div data-so="driver-objective-line" className="opacity-80">No author note of its own; objective line {context.objectiveLine ? "on" : "off"}</div>
      )}
      {authorView && agency && (
        <div data-so="agency-policy" className="opacity-80">
          <div className="font-medium opacity-100">Agency</div>
          <div>
            {agency.objective_kind === "player_action" ? "Needs the player's own act" : "World pressure"}
            {agency.protect_player_choice ? " · choices protected" : " · choices not protected"}
            {agency.never_narrate_player_action ? " · never narrates the player" : ""}
            {agency.alternate ? ` · alternate: ${agency.alternate}` : ""}
          </div>
        </div>
      )}
      {authorView && context.unmetGates.length > 0 && (
        <div className="opacity-80">
          <div className="font-medium opacity-100">Unmet gates</div>
          {context.unmetGates.map((gate, index) => <div key={index}>{gate}</div>)}
        </div>
      )}

      {authorView && recovery ? <RecoveryControls recovery={recovery} stepBack={controller.stepBack} onStatus={setStatus} /> : null}

      {activeNudge ? (
        <div className="st-subpanel flex items-center gap-2 p-2" aria-label="Active nudge">
          <span className="st-pill px-2 py-0.5 text-[10px]">Nudge</span>
          <span className="flex-1">{activeNudge}</span>
          <button type="button" className="st-button secondary" onClick={() => controller.clearNudge()}>Clear</button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="st-button secondary" disabled={busy !== null} onClick={() => void doSuggest()}>{busy === "suggest" ? "…" : "Suggest"}</button>
        <button type="button" className="st-button secondary" disabled={busy !== null} onClick={() => void doProbe()}>{busy === "probe" ? "…" : "Probe"}</button>
        <button type="button" className="st-button secondary" disabled={busy !== null} onClick={() => void doReport()}>{busy === "report" ? "…" : "Report"}</button>
      </div>

      <div className="flex items-center gap-2">
        <select className="st-input flex-1" aria-label="Advance target" value={advanceTarget} onChange={(event) => { setAdvanceTarget(event.target.value); setConfirmAdvance(false); }}>
          <option value="">Advance to…</option>
          {targets.map((checkpoint) => <option key={checkpoint.id} value={checkpoint.id}>{checkpoint.name}</option>)}
        </select>
        <button type="button" className="st-button secondary" disabled={!advanceTarget || busy !== null} onClick={doAdvance}>{confirmAdvance ? "Confirm advance" : "Advance"}</button>
      </div>

      <div className="flex items-center gap-2">
        <input className="text_pole st-input flex-1" aria-label="Nudge text" placeholder="One-shot steering note" value={nudgeText} onChange={(event) => setNudgeText(event.target.value)} />
        <button type="button" className="st-button secondary" disabled={!nudgeText.trim()} onClick={() => applyNudge(nudgeText.trim())}>Nudge</button>
      </div>

      {suggestions.length > 0 && (
        <div ref={suggestionsRef} className="flex flex-col gap-1" aria-label="Driver suggestions">
          {suggestions.map((suggestion, index) => (
            <div key={index} className="st-subpanel flex flex-col gap-1 p-2">
              <div className="font-medium opacity-100">{suggestion.title}</div>
              <div className="opacity-80">{suggestion.rationale}</div>
              <button type="button" className="st-button secondary self-start" onClick={() => applyNudge(`${suggestion.title}. ${suggestion.rationale}`)}>Nudge with this</button>
            </div>
          ))}
        </div>
      )}

      {report ? (
        <div className="st-subpanel p-2" aria-label="Driver report">
          <div className="font-medium opacity-100">Report</div>
          <div className="opacity-80 whitespace-pre-wrap">{report}</div>
        </div>
      ) : null}

      {status ? <div className="opacity-80" role="status">{status}</div> : null}
    </div>
  );
};

export default DriverPanel;
