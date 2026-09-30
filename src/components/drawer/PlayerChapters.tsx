import type { ChapterView } from "@runtime/chapters";

export interface PlayerChaptersProps {
  chapters: ChapterView;
  onFlag?: (title: string) => void;
}

// "Your story": the chapters that have ended, one line each, opening to the full summary. A player can
// only flag a summary for the author; editing it is author view.
export const PlayerChapters = ({ chapters, onFlag }: PlayerChaptersProps) => (
  <div id="so-player-chapters" className="flex flex-col gap-1">
    <div className="font-medium">Your story</div>
    {chapters.records.map((record) => (
      <details key={record.id} data-so="player-chapter" className="text-sm">
        <summary className="cursor-pointer">
          <span className="font-semibold">{record.playerTitle}</span>
          <span className="opacity-80"> — {record.short}</span>
        </summary>
        <div className="flex flex-col gap-1 pl-3 pt-1">
          <div className="whitespace-pre-wrap opacity-90">{record.summary}</div>
          {onFlag && (
            <button type="button" data-so="player-chapter-flag" className="menu_button self-start opacity-70" aria-label={`Flag the summary of ${record.playerTitle}`}
              title="Something is wrong in this summary: flag it for the author" onClick={() => onFlag(record.playerTitle)}>⚑</button>
          )}
        </div>
      </details>
    ))}
    {chapters.current && !chapters.ended && <div data-so="player-chapter-current" className="text-sm opacity-80">Now: {chapters.current.playerTitle}</div>}
  </div>
);

export default PlayerChapters;
