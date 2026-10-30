import { useState } from "react";
import type { ActivityCategory, ActivityRow } from "@runtime/activityFeed";
import { INLINE_CATEGORY_LABELS } from "@runtime/messageInspector";
import { PRESENCE_TEXT } from "@features/presenceCopy";
import { Chip } from "@components/ui/Badge";
import "../drawer/author.css";

export interface ActivityPanelProps {
  rows: readonly ActivityRow[];
  onJump?: (messageId: number) => void;
  setupCount?: number;
  onOpenHealth?: () => void;
}

const LABELS: Record<ActivityCategory, string> = { ...INLINE_CATEGORY_LABELS, rolls: PRESENCE_TEXT.rollsLabel };

export const ActivityPanel = ({ rows, onJump, setupCount = 0, onOpenHealth }: ActivityPanelProps) => {
  const [category, setCategory] = useState<ActivityCategory | "all">("all");
  const present = [...new Set(rows.map((row) => row.category))];
  const shown = category === "all" ? rows : rows.filter((row) => row.category === category);
  const count = (entry: ActivityCategory) => rows.filter((row) => row.category === entry).length;
  return (
    <div id="so-activity" data-so="activity" className="so-activity">
      {setupCount > 0 && (
        <p data-so="activity-checks" className="so-activity-setup">
          {setupCount} setup check{setupCount === 1 ? "" : "s"} need attention.{" "}
          {onOpenHealth && <button type="button" className="so-link-btn" data-so="activity-open-health" onClick={onOpenHealth}>Open Health</button>}
        </p>
      )}
      <div className="so-chip-row" role="group" aria-label={PRESENCE_TEXT.activityShow} data-so="activity-filter">
        <Chip selected={category === "all"} onClick={() => setCategory("all")}>{PRESENCE_TEXT.activityEverything} {rows.length}</Chip>
        {present.map((entry) => (
          <Chip key={entry} selected={category === entry} onClick={() => setCategory(category === entry ? "all" : entry)}>{LABELS[entry]} {count(entry)}</Chip>
        ))}
        <span data-so="activity-count" className="so-muted">{shown.length}</span>
      </div>
      {shown.length === 0 && <p data-so="activity-empty" className="so-muted">{PRESENCE_TEXT.activityEmpty}</p>}
      <ol className="so-activity-list">
        {shown.map((row) => (
          <li key={row.id} data-so="activity-row" data-category={row.category} className="so-activity-row">
            <span className="so-activity-meta">
              {onJump ? (
                <button type="button" data-so="activity-jump" className="so-link-btn" aria-label={`Go to message ${row.messageId}`} onClick={() => onJump(row.messageId)}>#{row.messageId}</button>
              ) : <span className="so-muted">#{row.messageId}</span>}
              <span className="so-muted">{LABELS[row.category]}</span>
              {row.state && row.state !== "applied" && <span className="so-muted">· {row.state}</span>}
            </span>
            <span className="so-activity-text">{row.text}</span>
            {row.detail && <details className="so-activity-detail"><summary>Detail</summary><pre>{row.detail}</pre></details>}
          </li>
        ))}
      </ol>
    </div>
  );
};

export default ActivityPanel;
