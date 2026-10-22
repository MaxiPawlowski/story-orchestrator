import type { GameAuthorView, GameView, ObservationLineView } from "@runtime/gameTypes";
import { GAME_TEXT } from "@features/gameCopy";
import { WidgetCard } from "../widgets/WidgetCard";
import { useEffect, useState } from "react";
import { JOURNAL_PAGE_EVENT, peekJournalPage, takeJournalPage } from "@runtime/drawerTab";
import { CODEX_TEXT } from "@features/codexCopy";
import { CodexPage } from "../codex/CodexPage";

export interface JournalPanelProps {
  game: GameView;
  author?: GameAuthorView | null;
  onJump?: (messageId: number) => void;
}

const Noticed = ({ lines, onJump }: { lines: ObservationLineView[]; onJump?: (messageId: number) => void }) => (
  <section data-so="journal-noticed" aria-label={GAME_TEXT.noticed} className="flex flex-col gap-1">
    <div className="text-xs font-medium">{GAME_TEXT.noticed}</div>
    {lines.length === 0 && <div data-so="journal-noticed-empty" className="text-xs st-muted">{GAME_TEXT.noticedEmpty}</div>}
    <ul className="flex flex-col gap-1 list-none p-0 m-0 text-xs">
      {lines.map((line, index) => (
        <li key={`${line.boundary}-${index}`} data-so="journal-noticed-line" data-fresh={line.fresh} className="flex flex-col">
          <span>{line.text}</span>
          {(line.from || line.at || (onJump && line.messageId !== undefined)) && (
            <span className="flex flex-wrap items-center gap-1 st-muted">
              {line.from && <span data-so="journal-noticed-from">{line.from}</span>}
              {line.at && <span data-so="journal-noticed-at">{line.at}</span>}
              {onJump && line.messageId !== undefined && (
                <button type="button" data-so="journal-noticed-jump" className="menu_button text-xs" onClick={() => onJump(line.messageId as number)}>{GAME_TEXT.noticedJump}</button>
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

export function JournalPanel({ game, author, onJump }: JournalPanelProps) {
  const [picked, setTab] = useState<JournalTab>(() => peekJournalPage()?.page ?? "journal");
  useEffect(() => {
    const follow = () => { const request = takeJournalPage(); if (request) setTab(request.page); };
    follow();
    window.addEventListener(JOURNAL_PAGE_EVENT, follow);
    return () => window.removeEventListener(JOURNAL_PAGE_EVENT, follow);
  }, []);
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
      {empty && !game.codex && !game.observations && <div data-so="journal-empty" className="text-xs st-muted">{GAME_TEXT.journalEmpty}</div>}
      {game.journal.map((widget) => <WidgetCard key={widget.id} widget={widget} />)}
      {game.observations && <Noticed lines={game.observations} onJump={onJump} />}
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
