import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { codexGame } from "../codex/codexFixtures";
import { peekJournalPage, requestJournalPage, takeJournalPage } from "@runtime/drawerTab";
import { JournalPanel } from "./JournalPanel";

const peopleSelected = (html: string) => /id="so-journal-tab-people" aria-selected="true"/.test(html);

describe("JournalPanel page request", () => {
  const host = globalThis as { window?: unknown };
  const before = host.window;
  beforeEach(() => { host.window = new EventTarget(); });
  afterEach(() => { takeJournalPage(); host.window = before; });

  it("keeps a People request across a render React throws away before it mounts", () => {
    const game = codexGame();
    requestJournalPage({ page: "people", name: game.codex?.people[0]?.name ?? "" });
    const first = renderToStaticMarkup(createElement(JournalPanel, { game }));
    const retried = renderToStaticMarkup(createElement(JournalPanel, { game }));
    expect(peopleSelected(first)).toBe(true);
    expect(peopleSelected(retried)).toBe(true);
    expect(peekJournalPage()?.page).toBe("people");
  });
});
