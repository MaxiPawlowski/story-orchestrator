import { useId, useState } from "react";
import type { ActivityCategory, ActivityRow } from "@runtime/activityFeed";
import type { RepairStep } from "@runtime/repair";
import { SETUP_COPY } from "../drawer/SetupSection";
import { INLINE_CATEGORY_LABELS } from "@runtime/messageInspector";
import { PRESENCE_TEXT } from "@features/presenceCopy";

export interface ActivityPanelProps {
  rows: readonly ActivityRow[];
  onJump?: (messageId: number) => void;
  checks?: readonly RepairStep[];
}

const LABELS: Record<ActivityCategory, string> = { ...INLINE_CATEGORY_LABELS, rolls: PRESENCE_TEXT.rollsLabel };

const SEVERITY_LABEL: Record<RepairStep["severity"], string> = { blocks: SETUP_COPY.blocks, degrades: SETUP_COPY.degrades, info: SETUP_COPY.info };

export const ActivityPanel = ({ rows, onJump, checks = [] }: ActivityPanelProps) => {
  const [category, setCategory] = useState<ActivityCategory | "all">("all");
  const filterId = useId();
  const present = [...new Set(rows.map((row) => row.category))];
  const shown = category === "all" ? rows : rows.filter((row) => row.category === category);
  return (
    <div id="so-activity" data-so="activity" className="flex flex-col gap-2 text-sm">
      {checks.length > 0 && (
        <section data-so="activity-checks" aria-label={PRESENCE_TEXT.activitySetup} className="flex flex-col gap-1">
          <div className="font-medium text-xs">{PRESENCE_TEXT.activitySetup}</div>
          <ul className="flex flex-col gap-1">
            {checks.map((step) => (
              <li key={step.check} data-so="activity-check" data-check={step.check} data-severity={step.severity} className="flex flex-col gap-0.5">
                <span className="text-xs st-muted">{SEVERITY_LABEL[step.severity]}</span>
                <span>{step.consequence}</span>
                {step.detail !== step.consequence && <span className="text-xs st-muted">{step.detail}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="flex items-center gap-2">
        <label htmlFor={filterId} className="text-xs st-muted">{PRESENCE_TEXT.activityShow}</label>
        <select id={filterId} data-so="activity-filter" className="text_pole st-input text-xs" value={category} onChange={(event) => setCategory(event.target.value as ActivityCategory | "all")}>
          <option value="all">{PRESENCE_TEXT.activityEverything}</option>
          {present.map((entry) => <option key={entry} value={entry}>{LABELS[entry]}</option>)}
        </select>
        <span data-so="activity-count" className="text-xs st-muted">{shown.length}</span>
      </div>
      {shown.length === 0 && <div data-so="activity-empty" className="text-xs st-muted">{PRESENCE_TEXT.activityEmpty}</div>}
      <ul className="so-activity-list flex flex-col gap-1">
        {shown.map((row) => (
          <li key={row.id} data-so="activity-row" data-category={row.category} className="so-activity-row flex flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs st-muted">{LABELS[row.category]}</span>
              {onJump ? (
                <button type="button" data-so="activity-jump" className="menu_button text-xs" aria-label={`Go to message ${row.messageId}`}
                  onClick={() => onJump(row.messageId)}>#{row.messageId}</button>
              ) : <span className="text-xs st-muted">#{row.messageId}</span>}
              {row.state && row.state !== "applied" && <span className="text-xs st-muted">{row.state}</span>}
            </div>
            <div className="so-activity-text">{row.text}</div>
            {row.detail && <details className="text-xs"><summary className="cursor-pointer st-muted">Detail</summary><pre className="whitespace-pre-wrap">{row.detail}</pre></details>}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ActivityPanel;
