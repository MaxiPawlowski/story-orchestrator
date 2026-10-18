import type { WidgetDrawerTab } from "@engine/index";
import type { WorkspaceIntent } from "./workspaceNavigation";

export const STORY_MEMORY_CONTROL = "so-open-memory";

export const storyPageFor = (tab?: WidgetDrawerTab): WorkspaceIntent => ({ context: "story", page: "play", ...(tab === "memory" ? { control: STORY_MEMORY_CONTROL } : {}) });

export const JOURNAL_PAGE_EVENT = "so-journal-page";

export interface JournalPageRequest {
  page: "people" | "places";
  name: string;
}

let pendingJournalPage: JournalPageRequest | null = null;

export const peekJournalPage = (): JournalPageRequest | null => pendingJournalPage;

export const takeJournalPage = (): JournalPageRequest | null => {
  const request = pendingJournalPage;
  pendingJournalPage = null;
  return request;
};

export const requestJournalPage = (request: JournalPageRequest): boolean => {
  pendingJournalPage = request;
  return window.dispatchEvent(new CustomEvent(JOURNAL_PAGE_EVENT, { detail: request }));
};
