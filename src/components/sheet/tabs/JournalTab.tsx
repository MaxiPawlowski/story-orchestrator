import type { GameAuthorView, GameView, ObservationLineView } from "@runtime/gameTypes";
import { GAME_TEXT } from "@features/gameCopy";
import { Button } from "@components/ui/Button";
import { EmptyState } from "@components/ui/EmptyState";
import { WidgetCard } from "../../widgets/WidgetCard";

export interface JournalTabProps {
  game: GameView;
  author?: GameAuthorView | null;
  onJump?: (messageId: number) => void;
}

const Noticed = ({ lines, onJump }: { lines: ObservationLineView[]; onJump?: (messageId: number) => void }) => (
  <section data-so="journal-noticed" aria-label={GAME_TEXT.noticed} className="so-sheet-section">
    <h3 className="so-sheet-heading">{GAME_TEXT.noticed}</h3>
    {lines.length === 0 && <div data-so="journal-noticed-empty" className="so-sheet-muted">{GAME_TEXT.noticedEmpty}</div>}
    <ul className="so-sheet-list">
      {lines.map((line, index) => (
        <li key={`${line.boundary}-${index}`} data-so="journal-noticed-line" data-fresh={line.fresh} className="so-sheet-row">
          <span>{line.text}</span>
          {(line.from || line.at || (onJump && line.messageId !== undefined)) && (
            <span className="so-sheet-meta">
              {line.from && <span data-so="journal-noticed-from">{line.from}</span>}
              {line.at && <span data-so="journal-noticed-at">{line.at}</span>}
              {onJump && line.messageId !== undefined && (
                <Button size="sm" variant="ghost" icon="fa-arrow-turn-up" data-so="journal-noticed-jump" onClick={() => onJump(line.messageId as number)}>
                  {GAME_TEXT.noticedJump}
                </Button>
              )}
            </span>
          )}
        </li>
      ))}
    </ul>
  </section>
);

const AuthorQuests = ({ author }: { author: GameAuthorView }) => {
  const hidden = author.quests.filter((quest) => quest.status === "hidden");
  if (!hidden.length && !author.scopeOverflow.length && !author.widgets.length) return null;
  return (
    <section data-so="journal-author" aria-label={GAME_TEXT.authorHeading} className="so-sheet-section so-sheet-author">
      <h3 className="so-sheet-heading">{GAME_TEXT.authorHeading}</h3>
      {hidden.length > 0 && <div data-so="journal-hidden">{GAME_TEXT.authorHidden}: {hidden.map((quest) => `${quest.title} (${quest.id})`).join(", ")}</div>}
      {author.scopeOverflow.length > 0 && <div data-so="journal-overflow">{GAME_TEXT.authorOverflow}: {author.scopeOverflow.join(", ")}</div>}
      {author.widgets.map((widget) => <WidgetCard key={widget.id} widget={widget} provenance={author.provenance?.[widget.id]} />)}
    </section>
  );
};

export const journalTabEmpty = (game: GameView): boolean => !game.journal.length && !game.milestones.length && !game.observations;

export function JournalTab({ game, author, onJump }: JournalTabProps) {
  return (
    <div id="so-journal" data-so="journal" className="so-sheet-body">
      {journalTabEmpty(game) && <div data-so="journal-empty"><EmptyState icon="fa-book" title={GAME_TEXT.journalEmpty} /></div>}
      {game.journal.map((widget) => <WidgetCard key={widget.id} widget={widget} onJump={onJump} />)}
      {game.observations && <Noticed lines={game.observations} onJump={onJump} />}
      {game.milestones.length > 0 && (
        <section data-so="milestones" aria-label={GAME_TEXT.milestones} className="so-sheet-section">
          <h3 className="so-sheet-heading">{GAME_TEXT.milestones}</h3>
          <ul className="so-sheet-list">
            {game.milestones.map((milestone, index) => (
              <li key={index} data-so="milestone" data-earned={milestone.earned} className={milestone.earned ? undefined : "so-sheet-muted"}>
                <i className={milestone.earned ? "fa-solid fa-star" : "fa-regular fa-star"} aria-hidden="true" /> {milestone.title}
              </li>
            ))}
          </ul>
        </section>
      )}
      {author && <AuthorQuests author={author} />}
    </div>
  );
}

export default JournalTab;
