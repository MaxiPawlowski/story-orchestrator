import React, { useMemo, useState, useCallback } from "react";
import { getWorldInfoSettings } from "@services/SillyTavernAPI";
import { CheckpointStatus } from "@utils/story-state";
import { useStoryContext } from "@hooks/useStoryContext";
import CheckpointEditorModal from "./CheckpointEditorModal";
import type { Story } from "@utils/story-schema";

type CheckpointRow = {
  id: string | number;
  name: string;
  objective: string;
  status: CheckpointStatus;
};

type EvaluationHistoryEntry = {
  eventText: string;
  result: "win" | "fail" | null;
};

type QueuedEvaluationInfo = {
  reason: string;
  turn: number;
  matchedPattern?: string;
};

type Props = {
  title?: string;
  checkpoints?: CheckpointRow[];
  evaluationHistory?: EvaluationHistoryEntry[];
  lastQueuedEvaluation?: QueuedEvaluationInfo | null;
};

const STATUS_BORDER_CLASS: Record<CheckpointStatus, string> = {
  [CheckpointStatus.Pending]: "border-gray-200",
  [CheckpointStatus.Current]: "border-blue-300",
  [CheckpointStatus.Complete]: "border-green-300",
  [CheckpointStatus.Failed]: "border-red-300",
};

const Checkpoints: React.FC<Props> = ({
  title = "Story Checkpoints",
  checkpoints,
  lastQueuedEvaluation,
}) => {
  const rows = checkpoints?.length ? checkpoints : [];


  const queuedSummary = useMemo(() => {
    if (!lastQueuedEvaluation) return null;
    const { reason, matchedPattern } = lastQueuedEvaluation;
    let label: string;
    switch (reason) {
      case "win-trigger":
        label = "Queued after win trigger match";
        break;
      case "fail-trigger":
        label = "Queued after fail trigger match";
        break;
      case "turn-interval":
        label = "Queued for periodic check";
        break;
      default:
        label = reason;
        break;
    }
    return { label, matchedPattern };
  }, [lastQueuedEvaluation]);

  return (
    <div className="checkpoints-wrapper p-2">
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="m-0">{title}</h3>
        </div>

        {queuedSummary ? (
          <div className="text-sm opacity-70">
            <strong>Last check queued:</strong> {queuedSummary.label}
            {queuedSummary.matchedPattern ? ` | pattern ${queuedSummary.matchedPattern}` : ""}
          </div>
        ) : null}
      </div>

      <ul className="list-none p-0 mt-3">
        {rows
          .filter((cp) => {
            if (!cp) return false;
            const status = cp.status ?? CheckpointStatus.Pending;
            return status !== CheckpointStatus.Pending;
          })
          .map((cp, i) => {
            const status = cp.status ?? CheckpointStatus.Pending;
            const borderClass = STATUS_BORDER_CLASS[status] ?? STATUS_BORDER_CLASS[CheckpointStatus.Pending];
            const isComplete = status === CheckpointStatus.Complete;
            const key = cp.id ?? `cp-${i}`;

            return (
              <li
                key={key}
                className={`flex items-center py-2 px-2.5 rounded-md border ${borderClass} mb-1.5`}
              >
                <div className="flex items-center gap-2.5 flex-1">
                  <input
                    type="checkbox"
                    disabled
                    readOnly
                    checked={isComplete}
                    aria-readonly="true"
                    className="m-0"
                  />
                  <div className="flex flex-col">
                    <span className={status === CheckpointStatus.Current ? "font-semibold" : "font-medium"}>
                      {cp.name || cp.objective}
                    </span>
                    <span className="text-sm opacity-80">{cp.objective}</span>
                  </div>
                </div>
              </li>
            );
          })}
      </ul>


    </div>
  );
};

export default Checkpoints;
