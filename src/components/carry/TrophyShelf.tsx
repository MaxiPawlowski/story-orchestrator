import { useState } from "react";
import type { ContinueRow } from "@runtime/playsIndex";
import type { TrophyRow } from "@runtime/carryPort";
import { CARRY_COPY } from "@features/carryCopy";

export interface TrophyShelfProps {
  rows: readonly ContinueRow[];
  load: (rows: readonly ContinueRow[]) => Promise<TrophyRow[]>;
  onOpen?: (row: ContinueRow) => void;
}

const dateOf = (iso: string) => (Number.isNaN(Date.parse(iso)) ? "" : new Date(iso).toLocaleDateString());

export const TrophyShelf = ({ rows, load, onOpen }: TrophyShelfProps) => {
  const [shelf, setShelf] = useState<TrophyRow[] | null>(null);
  const [asked, setAsked] = useState(false);
  if (!rows.some((row) => row.ended)) return null;
  const open = (event: React.SyntheticEvent<HTMLDetailsElement>) => {
    if (!event.currentTarget.open || asked) return;
    setAsked(true);
    void load(rows).then(setShelf, () => setShelf([]));
  };
  const play = (chatId: string) => rows.find((row) => row.chatId === chatId);
  return (
    <details id="so-trophy-shelf" data-so="trophy-shelf" className="flex flex-col gap-1" onToggle={open}>
      <summary className="text-xs font-medium cursor-pointer">{CARRY_COPY.shelfHeading}</summary>
      {asked && shelf === null && <div className="text-xs opacity-70">{CARRY_COPY.shelfLoading}</div>}
      {shelf?.length === 0 && <div data-so="trophy-empty" className="text-xs opacity-70">{CARRY_COPY.shelfEmpty}</div>}
      {shelf && shelf.length > 0 && (
        <ul className="flex flex-col gap-1">
          {shelf.map((trophy) => {
            const row = play(trophy.chatId);
            return (
              <li key={trophy.chatId} data-so="trophy-row" className="so-continue-row flex items-center justify-between gap-2">
                <div className="flex flex-col min-w-0">
                  <span className="text-sm truncate"><i className="fa-solid fa-trophy mr-1" aria-hidden="true" />{CARRY_COPY.ended(trophy.storyTitle, trophy.endingTitle)}</span>
                  <span className="text-xs opacity-70">{dateOf(trophy.endedAt)}</span>
                  {trophy.milestones.length > 0 && (
                    <ul data-so="trophy-milestones" aria-label={CARRY_COPY.shelfMilestones} className="flex flex-wrap gap-1 list-none p-0 m-0">
                      {trophy.milestones.map((title) => <li key={title} data-so="trophy-milestone" className="st-pill px-1.5 text-[10px]">{title}</li>)}
                    </ul>
                  )}
                </div>
                {row && onOpen && (
                  <button type="button" data-so="trophy-open" className="menu_button text-xs" aria-label={`${CARRY_COPY.shelfOpen} ${trophy.storyTitle}`} onClick={() => onOpen(row)}>
                    {CARRY_COPY.shelfOpen}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </details>
  );
};

export default TrophyShelf;
