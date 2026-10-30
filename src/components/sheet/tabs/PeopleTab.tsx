import { useEffect, useState } from "react";
import type { CodexView } from "@runtime/gameTypes";
import { JOURNAL_PAGE_EVENT, peekJournalPage, takeJournalPage, type JournalPageRequest } from "@runtime/drawerTab";
import { CODEX_TEXT } from "@features/codexCopy";
import { Tab, TabList, TabPanel, Tabs } from "@components/ui/Tabs";
import { CodexPage } from "../../codex/CodexPage";

export type PeoplePage = JournalPageRequest["page"];

export interface PeopleTabProps {
  codex: CodexView;
  page?: PeoplePage;
}

const firstPage = (codex: CodexView, wanted: PeoplePage | undefined): PeoplePage => {
  if (wanted && codex[wanted].length) return wanted;
  return codex.people.length ? "people" : "places";
};

export const peopleTabEmpty = (codex: CodexView | undefined): boolean => !codex || (!codex.people.length && !codex.places.length);

export function PeopleTab({ codex, page }: PeopleTabProps) {
  const [picked, setPicked] = useState<PeoplePage | undefined>(() => peekJournalPage()?.page ?? page);
  useEffect(() => {
    const follow = () => { const request = takeJournalPage(); if (request) setPicked(request.page); };
    follow();
    window.addEventListener(JOURNAL_PAGE_EVENT, follow);
    return () => window.removeEventListener(JOURNAL_PAGE_EVENT, follow);
  }, []);
  const shown = firstPage(codex, picked);
  const pages: PeoplePage[] = (["people", "places"] as const).filter((entry) => codex[entry].length > 0);
  return (
    <div id="so-people" data-so="people" className="so-sheet-body">
      <Tabs value={shown} onChange={(value) => setPicked(value as PeoplePage)} idPrefix="so-journal-tab-">
        {pages.length > 1 && (
          <TabList label={CODEX_TEXT.tabsLabel} variant="segmented">
            {pages.map((entry) => (
              <Tab key={entry} value={entry} controls="so-people-page" count={codex[entry].length}>{entry === "people" ? CODEX_TEXT.people : CODEX_TEXT.places}</Tab>
            ))}
          </TabList>
        )}
        <TabPanel id="so-people-page">
          <CodexPage page={shown} entries={codex[shown]} />
        </TabPanel>
      </Tabs>
    </div>
  );
}

export default PeopleTab;
