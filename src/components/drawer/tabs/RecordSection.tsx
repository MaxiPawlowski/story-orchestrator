import type { RecordView } from "@runtime/authorConsole";
import { EmptyState } from "@components/ui/EmptyState";
import { Button } from "@components/ui/Button";

const causeText = (row: RecordView["rows"][number]): string => (row.causes.length === 1
  ? `the player's line in message ${row.causes[0].playerSpan.messageId} (${row.causes[0].key} = ${String(row.causes[0].value)})`
  : "unknown");

const told = (row: RecordView["rows"][number]): string[] => Object.entries(row.audience).filter(([, state]) => state === "told" || state === "witnessed").map(([member]) => member);

export const RecordSection = ({ view, onJump }: { view: RecordView | null | undefined; onJump?: (messageId: number) => void }) => {
  if (!view) return <EmptyState title="The story record is off">Switch on Story record in Settings › Features to list what happened.</EmptyState>;
  if (!view.rows.length) return <EmptyState title="Nothing recorded yet">Rows appear as the story moves: places reached, quests closed, consequences applied.</EmptyState>;
  return (
    <div className="so-console-stack" data-so="story-record">
      {view.open.length > 0 && <div className="so-console-block" data-so="record-open"><h4>Still open</h4><div>{view.open.join(", ")}</div></div>}
      <ol className="so-console-block list-none m-0 p-0 flex flex-col gap-1">
        {[...view.rows].reverse().map((row) => (
          <li key={`${row.boundary}:${row.event.kind}:${row.event.id}`} data-so="record-row" data-kind={row.event.kind}>
            <div>
              <Button variant="ghost" size="sm" onClick={() => onJump?.(row.messageId)}>Turn {row.boundary}</Button> · {row.label}
            </div>
            <div className="text-xs st-muted">
              Why: {causeText(row)}
              {row.effects.length > 0 ? ` · effects: ${row.effects.length}` : ""}
              {told(row).length > 0 ? ` · told: ${told(row).join(", ")}` : ""}
              {row.opens.length > 0 ? ` · opens: ${row.opens.join(", ")}` : ""}
              {row.closes.length > 0 ? ` · closes: ${row.closes.join(", ")}` : ""}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
};
