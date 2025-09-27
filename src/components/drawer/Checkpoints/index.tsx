import React, { useMemo } from "react";
import { getWorldInfoSettings } from "@services/SillyTavernAPI";
import type { EvaluationDetails } from "@services/StoryService/orchestrator";

type CheckpointStatus = "pending" | "current" | "complete" | "failed";

type CheckpointRow = {
  id: string | number;
  name: string;
  objective: string;
  status: CheckpointStatus;
};

type EvaluationHistoryEntry = {
  eventText: string;
  result: "win" | "fail" | null;
  details: EvaluationDetails;
};

type QueuedEvaluationInfo = {
  reason: string;
  turn: number;
  matchedPattern?: string;
};

type Props = {
  title?: string;
  checkpoints?: CheckpointRow[];
  progressText?: string;
  lastEvaluation?: EvaluationDetails | null;
  evaluationHistory?: EvaluationHistoryEntry[];
  turnsUntilNextCheck?: number | null;
  lastQueuedEvaluation?: QueuedEvaluationInfo | null;
};

const FALLBACK_ROWS: CheckpointRow[] = [
  { id: "demo-0", name: "Prologue", objective: "Arrive at the tavern.", status: "complete" },
  { id: "demo-1", name: "Meet the Guide", objective: "Talk with the tavernkeeper.", status: "complete" },
  { id: "demo-2", name: "First Conflict", objective: "Settle the dispute with the patron.", status: "current" },
  { id: "demo-3", name: "Secret Revealed", objective: "Uncover the hidden conspiracy.", status: "pending" },
  { id: "demo-4", name: "The Choice", objective: "Decide the patron's fate.", status: "pending" },
  { id: "demo-5", name: "Resolution", objective: "Report back to the quest giver.", status: "pending" },
];

const STATUS_LABEL: Record<CheckpointStatus, string> = {
  pending: "Pending",
  current: "In progress",
  complete: "Complete",
  failed: "Failed",
};

const STATUS_BACKGROUND: Record<CheckpointStatus, string> = {
  pending: "transparent",
  current: "rgba(0,128,255,0.08)",
  complete: "rgba(0,180,0,0.08)",
  failed: "rgba(255,0,0,0.08)",
};

const STATUS_BORDER: Record<CheckpointStatus, string> = {
  pending: "rgba(0,0,0,0.08)",
  current: "rgba(0,128,255,0.3)",
  complete: "rgba(0,180,0,0.3)",
  failed: "rgba(255,0,0,0.3)",
};

const Checkpoints: React.FC<Props> = ({
  title = "Story Checkpoints",
  checkpoints,
  progressText,
  lastEvaluation,
  evaluationHistory,
  turnsUntilNextCheck,
  lastQueuedEvaluation,
}) => {
  const rows = checkpoints?.length ? checkpoints : FALLBACK_ROWS;

  const debugActiveWI = useMemo(() => () => {
    const wi = getWorldInfoSettings();
    console.log("WI settings snapshot:", wi);
  }, []);

  const lastEvalSummary = useMemo(() => {
    if (!lastEvaluation) return null;

    const { request, parsed, outcome, completed, failed } = lastEvaluation;
    const decision = completed ? "Completed" : failed ? "Failed" : outcome === "continue" ? "Ongoing" : outcome ?? "Unknown";
    const triggerText = request?.reason ?? "No trigger recorded";
    const reason = parsed?.reason ?? (request?.matchedPattern ? `${triggerText} (${request.matchedPattern})` : triggerText);
    const confidence = typeof parsed?.confidence === "number" && Number.isFinite(parsed.confidence)
      ? `${Math.round(parsed.confidence * 100)}%`
      : null;
    const timestamp = typeof request?.timestamp === "number"
      ? new Date(request.timestamp).toLocaleTimeString()
      : null;

    return { decision, reason, confidence, timestamp };
  }, [lastEvaluation]);

  const queuedSummary = useMemo(() => {
    if (!lastQueuedEvaluation) return null;
    const { reason, matchedPattern } = lastQueuedEvaluation;
    let label: string;
    switch (reason) {
      case 'win-trigger':
        label = 'Queued after win trigger match';
        break;
      case 'fail-trigger':
        label = 'Queued after fail trigger match';
        break;
      case 'turn-interval':
        label = 'Queued for periodic check';
        break;
      default:
        label = reason;
        break;
    }
    return { label, matchedPattern };
  }, [lastQueuedEvaluation]);

  const recentEvaluations = useMemo(() => {
    if (!evaluationHistory?.length) return [] as EvaluationHistoryEntry[];
    return evaluationHistory.slice(-3).reverse();
  }, [evaluationHistory]);

  return (
    <div className="checkpoints-wrapper" style={{ padding: 8 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          {progressText ? (
            <span style={{ fontSize: 12, opacity: 0.75 }}>{progressText}</span>
          ) : null}
        </div>
        {lastEvalSummary ? (
          <div style={{ fontSize: 12, padding: "6px 8px", borderRadius: 6, background: "rgba(0,0,0,0.04)" }}>
            <strong>Last evaluation:</strong> {lastEvalSummary.decision}
            {lastEvalSummary.reason ? ` | ${lastEvalSummary.reason}` : ""}
            {lastEvalSummary.confidence ? ` | Confidence ${lastEvalSummary.confidence}` : ""}
            {lastEvalSummary.timestamp ? ` | ${lastEvalSummary.timestamp}` : ""}
          </div>
        ) : null}

        {typeof turnsUntilNextCheck === 'number' ? (
          <div style={{ fontSize: 12, opacity: 0.65 }}>
            Next interval check in {turnsUntilNextCheck} message{turnsUntilNextCheck === 1 ? '' : 's'}
          </div>
        ) : null}

        {queuedSummary ? (
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            <strong>Last check queued:</strong> {queuedSummary.label}
            {queuedSummary.matchedPattern ? ` | pattern ${queuedSummary.matchedPattern}` : ''}
          </div>
        ) : null}
      </div>

      <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
        {rows.map((cp, i) => {
          const status = cp.status ?? "pending";
          const background = STATUS_BACKGROUND[status] ?? STATUS_BACKGROUND.pending;
          const border = STATUS_BORDER[status] ?? STATUS_BORDER.pending;
          const statusLabel = STATUS_LABEL[status] ?? STATUS_LABEL.pending;
          const isComplete = status === "complete";
          const key = cp.id ?? `cp-${i}`;

          return (
            <li
              key={key}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 10px",
                borderRadius: 6,
                background,
                border: `1px solid ${border}`,
                marginBottom: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                <input
                  type="checkbox"
                  disabled
                  readOnly
                  checked={isComplete}
                  aria-readonly="true"
                  style={{ margin: 0 }}
                />
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontWeight: status === "current" ? 600 : 500 }}>
                    {cp.name || cp.objective}
                  </span>
                  <span style={{ fontSize: 12, opacity: 0.8 }}>{cp.objective}</span>
                </div>
              </div>
              <span style={{ fontSize: 12, opacity: status === "pending" ? 0.6 : 0.9 }}>
                {statusLabel}
              </span>
            </li>
          );
        })}
      </ul>

      {recentEvaluations.length ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Recent checks</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {recentEvaluations.map((entry, idx) => {
              const request = entry.details.request;
              const tag = entry.result ?? "continue";
              const label = tag === "win" ? "Win" : tag === "fail" ? "Fail" : "Continue";
              const trigger = request?.reason ?? "unknown trigger";
              return (
                <li key={`eval-${idx}`} style={{ fontSize: 12, opacity: 0.75, marginBottom: 2 }}>
                  {label} — {trigger}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
        <button
          onClick={debugActiveWI}
          style={{ fontSize: 12, backgroundColor: "transparent", border: "none", cursor: "pointer" }}
        >
          debug WI
        </button>
      </div>
    </div>
  );
};

export default Checkpoints;
