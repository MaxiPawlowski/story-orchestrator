import type { MemoryEntry } from "@memory/index";
import { SHEET_TEXT } from "@features/sheetCopy";
import { Button } from "@components/ui/Button";
import { EmptyState } from "@components/ui/EmptyState";

export interface MemoryTabProps {
  entries: readonly MemoryEntry[];
  onOpenMemory?: () => void;
}

export function MemoryTab({ entries, onOpenMemory }: MemoryTabProps) {
  return (
    <div id="so-sheet-memory-peek" data-so="memory-peek" className="so-sheet-body">
      {entries.length
        ? (
          <>
            <p className="so-sheet-muted">{SHEET_TEXT.memoryHint}</p>
            <ul className="so-sheet-list so-sheet-bullets">{entries.map((entry) => <li key={entry.id} data-so="hud-card-memory">{entry.text}</li>)}</ul>
          </>
        )
        : <EmptyState icon="fa-brain" title={SHEET_TEXT.memoryEmpty} />}
      {onOpenMemory && <Button id="so-sheet-memory-all" icon="fa-arrow-up-right-from-square" className="self-start" onClick={onOpenMemory}>{SHEET_TEXT.memoryAll}</Button>}
    </div>
  );
}

export default MemoryTab;
