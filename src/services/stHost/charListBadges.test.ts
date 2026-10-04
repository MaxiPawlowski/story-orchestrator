/**
 * @jest-environment jsdom
 */
import { BADGE_CLASS, BADGE_REFRESH_EVENTS, CARD_CLASS, mountStoryBadges as mountWith, type StoryBadge, type StoryBadgeSource } from "./charListBadges";

const handlers = new Map<string, () => void>();
const unsubscribe = jest.fn();
const subscribe = (refresh: () => void) => {
  BADGE_REFRESH_EVENTS.forEach((eventName) => handlers.set(eventName, refresh));
  return unsubscribe;
};
const mountStoryBadges = (read: () => StoryBadgeSource) => mountWith(read, subscribe);
import { composeBadges } from "../../runtime/presenceBadges";
import { defaultPresenceSettings } from "../../runtime/displayToggles";

const saga: StoryBadge = { title: "Sun Ruins", kind: "saga", kindLabel: "Saga", chapterTitle: "The Siege", checkpointName: "The Gate", lastPlayed: "2 days ago", card: true };
const act: StoryBadge = { title: "Moon Well", kind: "story", kindLabel: "Story", lastPlayed: "just now", card: false };

const groupBlock = (id: string) => `<div class="group_select entity_block" data-grid="${id}"><div class="avatar"></div><div class="ch_name">Group ${id}</div></div>`;

const renderPage = (ids: string[]) => {
  document.body.innerHTML = `<div id="rm_print_characters_block">${ids.map(groupBlock).join("")}<div class="character_select" data-chid="1"><span class="ch_name">Solo</span></div></div>
    <div id="chat"></div><div id="select_chat_div"></div>`;
};

const flush = () => new Promise<void>((resolve) => { queueMicrotask(resolve); });
const source = (groups: Record<string, StoryBadge>, chats: Record<string, StoryBadge> = {}): StoryBadgeSource => ({ groups: new Map(Object.entries(groups)), chats: new Map(Object.entries(chats)) });

describe("v2.7 06 B: list badges over a fake list DOM", () => {
  beforeEach(() => { handlers.clear(); document.body.innerHTML = ""; });

  it("marks story groups on .ch_name, never the avatar, never a solo character, and names the kind", () => {
    renderPage(["g1", "g2", "g3"]);
    const handle = mountStoryBadges(() => source({ g1: saga, g2: act }));
    const badges = Array.from(document.querySelectorAll<HTMLElement>(`.${BADGE_CLASS}`));
    expect(badges.map((badge) => badge.closest("[data-grid]")?.getAttribute("data-grid"))).toEqual(["g1", "g2"]);
    expect(badges.every((badge) => badge.parentElement?.classList.contains("ch_name"))).toBe(true);
    expect(document.querySelector(".avatar")?.children.length).toBe(0);
    expect(document.querySelector(".character_select .so-story-badge")).toBeNull();
    expect(badges.map((badge) => [badge.dataset.kind, badge.getAttribute("aria-label"), badge.title])).toEqual([["saga", "Saga: Sun Ruins", "Saga: Sun Ruins"], ["story", "Story: Moon Well", "Story: Moon Well"]]);
    handle.dispose();
  });

  it("a page turn wipes the list and CHARACTER_PAGE_LOADED re-applies the marks, idempotently", async () => {
    renderPage(["g1"]);
    const handle = mountStoryBadges(() => source({ g1: saga, g5: act }));
    renderPage(["g5", "g1"]);
    expect(document.querySelectorAll(`.${BADGE_CLASS}`)).toHaveLength(0);
    handlers.get("CHARACTER_PAGE_LOADED")?.();
    handlers.get("GROUP_UPDATED")?.();
    await flush();
    expect(document.querySelectorAll(`.${BADGE_CLASS}`)).toHaveLength(2);
    handlers.get("CHAT_CHANGED")?.();
    await flush();
    expect(document.querySelectorAll(`[data-grid="g1"] .${BADGE_CLASS}`)).toHaveLength(1);
    handle.dispose();
  });

  it("an index change removes a mark whose group no longer plays a story", async () => {
    renderPage(["g1"]);
    let groups: Record<string, StoryBadge> = { g1: saga };
    const handle = mountStoryBadges(() => source(groups));
    groups = {};
    handle.refresh();
    await flush();
    expect(document.querySelectorAll(`.${BADGE_CLASS}`)).toHaveLength(0);
    handle.dispose();
  });

  it("marks welcome-screen recent group chats and the past-chats list per chat", async () => {
    renderPage([]);
    const handle = mountStoryBadges(() => source({}, { "chat-a": saga }));
    document.getElementById("chat")!.innerHTML = `<div class="recentChat group" data-file="chat-a" data-group="g1"><div class="chatName"></div></div><div class="recentChat group" data-file="chat-b"><div class="chatName"></div></div>`;
    document.getElementById("select_chat_div")!.innerHTML = `<div class="select_chat_block" file_name="chat-a.jsonl"><small class="select_chat_block_filename"></small></div>`;
    handle.refresh();
    await flush();
    expect(document.querySelectorAll(`[data-file="chat-a"] .${BADGE_CLASS}`)).toHaveLength(1);
    expect(document.querySelectorAll(`[data-file="chat-b"] .${BADGE_CLASS}`)).toHaveLength(0);
    expect(document.querySelectorAll(`.select_chat_block .${BADGE_CLASS}`)).toHaveLength(1);
    handle.dispose();
  });

  it("C2: focusing a badge shows the story card with title, kind, chapter and last played; blur and Escape close it", () => {
    renderPage(["g1", "g2"]);
    const handle = mountStoryBadges(() => source({ g1: saga, g2: act }));
    const badge = document.querySelector<HTMLElement>(`[data-grid="g1"] .${BADGE_CLASS}`)!;
    badge.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    const card = document.querySelector<HTMLElement>(`.${CARD_CLASS}`);
    expect(card?.textContent).toContain("Sun Ruins");
    expect(card?.textContent).toContain("Saga");
    expect(card?.textContent).toContain("Chapter: The Siege");
    expect(card?.textContent).toContain("Last played 2 days ago");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector(`.${CARD_CLASS}`)).toBeNull();
    document.querySelector<HTMLElement>(`[data-grid="g2"] .${BADGE_CLASS}`)!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    expect(document.querySelector(`.${CARD_CLASS}`)).toBeNull();
    handle.dispose();
  });

  it("dispose removes every mark and the open card, and unsubscribes", () => {
    renderPage(["g1"]);
    const handle = mountStoryBadges(() => source({ g1: saga }));
    document.querySelector(`.${BADGE_CLASS}`)!.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    handle.dispose();
    expect(document.querySelectorAll(`.${BADGE_CLASS}, .${CARD_CLASS}`)).toHaveLength(0);
    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe("v2.7 06 B: badge composition", () => {
  const plays = {
    "chat-1": { storyId: "sun", title: "Sun Ruins", groupId: "g1", checkpointName: "The Gate", kind: "saga" as const, updatedAt: "2026-10-01T00:00:00.000Z" },
  };
  const library = [{ id: "sun", title: "Sun Ruins", raw: { display: { group_card: false } } }, { id: "moon", title: "Moon Well", raw: { kind: "saga" } }];

  it("marks played groups and bound groups, per chat too, with the story's card toggle", () => {
    const maps = composeBadges({ plays, bindings: { g2: "moon", g3: "gone" }, library, settings: defaultPresenceSettings(), now: Date.parse("2026-10-03T00:00:00.000Z") });
    expect([...maps.groups.keys()].sort()).toEqual(["g1", "g2"]);
    expect(maps.groups.get("g1")).toMatchObject({ kind: "saga", lastPlayed: "2 days ago", card: false });
    expect(maps.groups.get("g2")).toMatchObject({ title: "Moon Well", kind: "saga", card: true });
    expect(maps.chats.get("chat-1")?.title).toBe("Sun Ruins");
  });

  it("the install-wide listBadges off marks nothing", () => {
    const maps = composeBadges({ plays, bindings: {}, library, settings: { ...defaultPresenceSettings(), listBadges: false }, now: 0 });
    expect(maps.groups.size + maps.chats.size).toBe(0);
  });
});
