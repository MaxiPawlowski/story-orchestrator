import type { WidgetDrawerTab } from "@engine/index";

export const DRAWER_TAB_EVENT = "so-drawer-tab";

export const requestDrawerTab = (tab: WidgetDrawerTab): boolean => window.dispatchEvent(new CustomEvent(DRAWER_TAB_EVENT, { detail: tab }));

export const JOURNAL_PAGE_EVENT = "so-journal-page";

export interface JournalPageRequest {
  page: "people" | "places";
  name: string;
}

let pendingJournalPage: JournalPageRequest | null = null;

export const takeJournalPage = (): JournalPageRequest | null => {
  const request = pendingJournalPage;
  pendingJournalPage = null;
  return request;
};

export const requestJournalPage = (request: JournalPageRequest): boolean => {
  pendingJournalPage = request;
  return window.dispatchEvent(new CustomEvent(JOURNAL_PAGE_EVENT, { detail: request }));
};
