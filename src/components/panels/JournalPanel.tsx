import type { GameAuthorView, GameView } from "@runtime/gameTypes";
import { GAME_TEXT } from "@features/gameCopy";
import { WidgetCard } from "../widgets/WidgetCard";

export interface JournalPanelProps {
  game: GameView;
  author?: GameAuthorView | null;
}

const AuthorQuests = ({ author }: { author: GameAuthorView }) => {
  const hidden = author.quests.filter((quest) => quest.status === "hidden");
  if (!hidden.length && !author.scopeOverflow.length && !author.widgets.length) return null;
  return (
    <section data-so="journal-author" aria-label={GAME_TEXT.authorHeading} className="flex flex-col gap-1 border-t pt-2 text-xs">
      <div className="font-medium">{GAME_TEXT.authorHeading}</div>
      {hidden.length > 0 && <div data-so="journal-hidden">{GAME_TEXT.authorHidden}: {hidden.map((quest) => `${quest.title} (${quest.id})`).join(", ")}</div>}
      {author.scopeOverflow.length > 0 && <div data-so="journal-overflow">{GAME_TEXT.authorOverflow}: {author.scopeOverflow.join(", ")}</div>}
      {author.widgets.map((widget) => <WidgetCard key={widget.id} widget={widget} provenance={author.provenance?.[widget.id]} />)}
    </section>
  );
};

export function JournalPanel({ game, author }: JournalPanelProps) {
  const empty = !game.journal.length && !game.milestones.length;
  return (
    <div id="so-journal" data-so="journal" className="flex flex-col gap-3 text-sm">
      {empty && <div data-so="journal-empty" className="text-xs st-muted">{GAME_TEXT.journalEmpty}</div>}
      {game.journal.map((widget) => <WidgetCard key={widget.id} widget={widget} />)}
      {game.milestones.length > 0 && (
        <section data-so="milestones" aria-label={GAME_TEXT.milestones} className="flex flex-col gap-1">
          <div className="text-xs font-medium">{GAME_TEXT.milestones}</div>
          <ul className="flex flex-col gap-0.5 list-none p-0 m-0 text-xs">
            {game.milestones.map((milestone, index) => (
              <li key={index} data-so="milestone" data-earned={milestone.earned} className={milestone.earned ? "" : "st-muted"}>
                <span aria-hidden="true">{milestone.earned ? "★ " : "☆ "}</span>{milestone.title}
              </li>
            ))}
          </ul>
        </section>
      )}
      {author && <AuthorQuests author={author} />}
    </div>
  );
}

export default JournalPanel;
