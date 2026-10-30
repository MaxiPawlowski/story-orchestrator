import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { codexGame } from "../../codex/codexFixtures";
import { peekJournalPage, requestJournalPage, takeJournalPage } from "@runtime/drawerTab";
import { PeopleTab } from "./PeopleTab";

const selected = (html: string, page: string) => new RegExp(`id="so-journal-tab-${page}"[^>]*aria-selected="true"`).test(html);

describe("PeopleTab page request", () => {
  const host = globalThis as { window?: unknown };
  const before = host.window;
  beforeEach(() => { host.window = new EventTarget(); });
  afterEach(() => { takeJournalPage(); host.window = before; });

  it("keeps a Places request across a render React throws away before it mounts", () => {
    const codex = codexGame().codex;
    if (!codex) throw new Error("fixture has no codex");
    requestJournalPage({ page: "places", name: codex.places[0]?.name ?? "" });
    const first = renderToStaticMarkup(createElement(PeopleTab, { codex }));
    const retried = renderToStaticMarkup(createElement(PeopleTab, { codex }));
    expect(selected(first, "places")).toBe(true);
    expect(selected(retried, "places")).toBe(true);
    expect(peekJournalPage()?.page).toBe("places");
  });

  it("control: without a request the People page is open", () => {
    const codex = codexGame().codex;
    if (!codex) throw new Error("fixture has no codex");
    const html = renderToStaticMarkup(createElement(PeopleTab, { codex }));
    expect(selected(html, "people")).toBe(true);
    expect(selected(html, "places")).toBe(false);
  });
});
