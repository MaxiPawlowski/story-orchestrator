import type { GameAuthorView, GameView } from "@runtime/gameTypes";
import { GAME_TEXT } from "@features/gameCopy";
import { WidgetCard } from "../widgets/WidgetCard";
import { useState } from "react";
import { CODEX_TEXT } from "@features/codexCopy";
import { CodexPage } from "../codex/CodexPage";

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

type JournalTab = "journal" | "people" | "places";

const CodexTabs = ({ game, tab, onTab }: { game: GameView; tab: JournalTab; onTab: (tab: JournalTab) => void }) => {
  const tabs: Array<{ id: JournalTab; label: string }> = [
    { id: "journal", label: CODEX_TEXT.journalTab },
    ...(game.codex?.people.length ? [{ id: "people" as const, label: `${CODEX_TEXT.people} · ${game.codex.people.length}` }] : []),
    ...(game.codex?.places.length ? [{ id: "places" as const, label: `${CODEX_TEXT.places} · ${game.codex.places.length}` }] : []),
  ];
  return (
    <div role="tablist" aria-label={CODEX_TEXT.tabsLabel} data-so="journal-tabs" className="flex flex-wrap gap-1">
      {tabs.map((entry) => (
        <button key={entry.id} type="button" role="tab" id={`so-journal-tab-${entry.id}`} aria-selected={tab === entry.id}
          className={`st-button ${tab === entry.id ? "" : "secondary"} text-xs`} onClick={() => onTab(entry.id)}>{entry.label}</button>
      ))}
    </div>
  );
};

export function JournalPanel({ game, author }: JournalPanelProps) {
  const [picked, setTab] = useState<JournalTab>("journal");
  const tab: JournalTab = picked !== "journal" && !game.codex?.[picked].length ? "journal" : picked;
  const empty = !game.journal.length && !game.milestones.length;
  if (game.codex && tab !== "journal") {
    return (
      <div id="so-journal" data-so="journal" className="flex flex-col gap-3 text-sm">
        <CodexTabs game={game} tab={tab} onTab={setTab} />
        <CodexPage page={tab} entries={game.codex[tab]} />
      </div>
    );
  }
  return (
    <div id="so-journal" data-so="journal" className="flex flex-col gap-3 text-sm">
      {game.codex && <CodexTabs game={game} tab={tab} onTab={setTab} />}
      {empty && !game.codex && <div data-so="journal-empty" className="text-xs st-muted">{GAME_TEXT.journalEmpty}</div>}
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
