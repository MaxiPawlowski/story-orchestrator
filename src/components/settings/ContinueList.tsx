import { kindLabel, lastPlayedText, type ContinueRow } from "@runtime/playsIndex";
import { PRESENCE_TEXT } from "@features/presenceCopy";

export interface ContinueListProps {
  rows: readonly ContinueRow[];
  openChatId?: string | null;
  now?: number;
  limit?: number;
  onOpen: (row: ContinueRow) => void;
}

export const CONTINUE_LIST_LIMIT = 8;

const where = (row: ContinueRow) => [row.chapterTitle, row.checkpointName].filter(Boolean).join(" · ");

export const ContinueList = ({ rows, openChatId = null, now = Date.now(), limit = CONTINUE_LIST_LIMIT, onOpen }: ContinueListProps) => (
  <div id="so-continue-list" data-so="continue-list" className="flex flex-col gap-1">
    <div className="text-xs font-medium">{PRESENCE_TEXT.continueHeading}</div>
    {rows.length === 0 && <div data-so="continue-empty" className="text-xs opacity-70">{PRESENCE_TEXT.continueEmpty}</div>}
    <ul className="flex flex-col gap-1">
      {rows.slice(0, limit).map((row) => {
        const open = row.chatId === openChatId;
        return (
          <li key={row.chatId} data-so="continue-row" data-kind={row.kind} className="so-continue-row flex items-center justify-between gap-2">
            <div className="flex flex-col min-w-0">
              <span className="text-sm truncate"><i className={`fa-solid ${row.kind === "saga" ? "fa-book-bookmark" : "fa-route"} mr-1`} aria-hidden="true" />{row.title}</span>
              <span className="text-xs opacity-70 truncate">{[kindLabel(row.kind), where(row), lastPlayedText(row.updatedAt, now)].filter(Boolean).join(" · ")}</span>
            </div>
            <button
              type="button"
              data-so="continue-open"
              className="menu_button text-xs"
              disabled={open}
              aria-label={`${PRESENCE_TEXT.continueOpen} ${row.title}`}
              onClick={() => onOpen(row)}
            >{open ? PRESENCE_TEXT.continueOpenNow : PRESENCE_TEXT.continueOpen}</button>
          </li>
        );
      })}
    </ul>
  </div>
);

export default ContinueList;
