import type { HostEventName } from "./events";

export const BADGE_CLASS = "so-story-badge";
export const CARD_CLASS = "so-story-card";

export interface StoryBadge {
  title: string;
  kind: "saga" | "story";
  kindLabel: string;
  chapterTitle?: string;
  checkpointName?: string | null;
  lastPlayed?: string | null;
  card: boolean;
}

export interface StoryBadgeSource {
  groups: ReadonlyMap<string, StoryBadge>;
  chats: ReadonlyMap<string, StoryBadge>;
}

export interface StoryBadgeHandle {
  refresh: () => void;
  dispose: () => void;
}

// The group list re-renders on every page turn (script.js:993-1067, CHARACTER_PAGE_LOADED),
// `updateGroupAvatar` replaces only `.avatar` (group-chats.js:800-848), the welcome screen renders
// `.recentChat.group[data-file]` into #chat (welcome-screen.js:329-345, welcomePanel.html:49), and the past
// chats list renders `.select_chat_block[file_name]` into #select_chat_div (index.html:6779).
const GROUP_BLOCKS = "#rm_print_characters_block .group_select[data-grid]";
const RECENT_CHATS = ".recentChat.group[data-file]";
const PAST_CHATS = "#select_chat_div .select_chat_block[file_name]";
export const BADGE_REFRESH_EVENTS: readonly HostEventName[] = ["CHARACTER_PAGE_LOADED", "GROUP_UPDATED", "CHAT_CHANGED", "APP_READY", "GROUP_CHAT_CREATED"];

const chatIdOf = (file: string) => file.replace(/\.jsonl$/i, "");

const describe = (badge: StoryBadge) => `${badge.kindLabel}: ${badge.title}`;

const cardLines = (badge: StoryBadge) => [
  badge.chapterTitle ? `Chapter: ${badge.chapterTitle}` : null,
  badge.checkpointName ? `At: ${badge.checkpointName}` : null,
  badge.lastPlayed ? `Last played ${badge.lastPlayed}` : null,
].filter((line): line is string => Boolean(line));

const placeCard = (doc: Document, anchor: HTMLElement, badge: StoryBadge): HTMLElement => {
  const card = doc.createElement("div");
  card.className = `${CARD_CLASS} ${CARD_CLASS}--${badge.kind}`;
  card.setAttribute("role", "tooltip");
  card.dataset.so = "story-card";
  const heading = doc.createElement("div");
  heading.className = `${CARD_CLASS}-title`;
  heading.textContent = badge.title;
  const kind = doc.createElement("div");
  kind.className = `${CARD_CLASS}-kind`;
  kind.textContent = badge.kindLabel;
  card.append(heading, kind, ...cardLines(badge).map((line) => {
    const row = doc.createElement("div");
    row.textContent = line;
    return row;
  }));
  const rect = anchor.getBoundingClientRect();
  card.style.left = `${Math.max(4, rect.left)}px`;
  card.style.top = `${rect.bottom + 4}px`;
  doc.body.appendChild(card);
  return card;
};

export function mountStoryBadges(read: () => StoryBadgeSource, subscribe: (refresh: () => void) => () => void, root: Document = document): StoryBadgeHandle {
  let source = read();
  let open: HTMLElement | null = null;
  let scheduled = false;

  const closeCard = () => {
    open?.remove();
    open = null;
  };

  const badgeFor = (badge: StoryBadge, slot: Element) => {
    let mark = slot.querySelector<HTMLElement>(`:scope > .${BADGE_CLASS}`);
    if (!mark) {
      mark = root.createElement("span");
      slot.appendChild(mark);
    }
    const label = describe(badge);
    mark.className = `${BADGE_CLASS} ${BADGE_CLASS}--${badge.kind} fa-solid ${badge.kind === "saga" ? "fa-book-bookmark" : "fa-route"}`;
    mark.dataset.so = "story-badge";
    mark.dataset.kind = badge.kind;
    mark.title = label;
    mark.setAttribute("aria-label", label);
    mark.setAttribute("role", "img");
    if (badge.card) mark.tabIndex = 0;
    else mark.removeAttribute("tabindex");
    mark.dataset.card = String(badge.card);
    return mark;
  };

  const mark = (selector: string, keyOf: (element: Element) => string | null, map: ReadonlyMap<string, StoryBadge>, hostOf: (element: Element) => Element | null) => {
    for (const element of Array.from(root.querySelectorAll(selector))) {
      const key = keyOf(element);
      const badge = key ? map.get(key) : undefined;
      const host = hostOf(element) ?? element;
      if (!badge) {
        host.querySelectorAll(`:scope > .${BADGE_CLASS}`).forEach((node) => node.remove());
        continue;
      }
      badgeFor(badge, host);
    }
  };

  const apply = () => {
    scheduled = false;
    mark(GROUP_BLOCKS, (element) => element.getAttribute("data-grid"), source.groups, (element) => element.querySelector(".ch_name"));
    mark(RECENT_CHATS, (element) => element.getAttribute("data-file"), source.chats, (element) => element.querySelector(".chatName"));
    mark(PAST_CHATS, (element) => chatIdOf(element.getAttribute("file_name") ?? ""), source.chats, (element) => element.querySelector(".select_chat_block_filename"));
  };

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(apply);
  };

  const refresh = () => {
    source = read();
    schedule();
  };

  const badgeOf = (target: EventTarget | null): { element: HTMLElement; badge: StoryBadge } | null => {
    const element = target instanceof Element ? target.closest<HTMLElement>(`.${BADGE_CLASS}`) : null;
    if (!element || element.dataset.card !== "true") return null;
    const block = element.closest("[data-grid], [data-file], [file_name]");
    const grid = block?.getAttribute("data-grid");
    const file = block?.getAttribute("data-file") ?? chatIdOf(block?.getAttribute("file_name") ?? "");
    const badge = grid ? source.groups.get(grid) : file ? source.chats.get(file) : undefined;
    return badge ? { element, badge } : null;
  };

  const show = (event: Event) => {
    const found = badgeOf(event.target);
    if (!found) return;
    closeCard();
    open = placeCard(root, found.element, found.badge);
  };
  const hide = (event: Event) => { if (badgeOf(event.target)) closeCard(); };
  const escape = (event: KeyboardEvent) => { if (event.key === "Escape") closeCard(); };

  root.addEventListener("mouseover", show);
  root.addEventListener("focusin", show);
  root.addEventListener("mouseout", hide);
  root.addEventListener("focusout", hide);
  root.addEventListener("keydown", escape);
  const unsubscribe = subscribe(schedule);
  const observer = typeof MutationObserver === "function" ? new MutationObserver(schedule) : null;
  const observe = () => {
    const past = root.getElementById("select_chat_div");
    const chat = root.getElementById("chat");
    if (past) observer?.observe(past, { childList: true, subtree: true });
    if (chat) observer?.observe(chat, { childList: true });
  };
  observe();
  apply();

  return {
    refresh,
    dispose: () => {
      unsubscribe();
      observer?.disconnect();
      root.removeEventListener("mouseover", show);
      root.removeEventListener("focusin", show);
      root.removeEventListener("mouseout", hide);
      root.removeEventListener("focusout", hide);
      root.removeEventListener("keydown", escape);
      closeCard();
      root.querySelectorAll(`.${BADGE_CLASS}`).forEach((node) => node.remove());
    },
  };
}
