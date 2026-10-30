import type { RosterMember } from "@engine/index";

export type StudioTab = "graph" | "story" | "features" | "qualities" | "checkpoints" | "transitions" | "roster" | "game"
  | "sprites" | "diagnostics" | "copilot" | "world" | "presentation" | "rules" | "chapters";

export const STUDIO_TAB_IDS: StudioTab[] = [
  "graph", "story", "features", "qualities", "checkpoints", "transitions", "roster", "game", "sprites", "diagnostics", "world", "presentation", "rules", "chapters", "copilot",
];

export interface StudioPage {
  tab: StudioTab;
  member?: string;
}

export interface StudioNavLink {
  key: string;
  page: StudioPage;
  label: string;
  elementId: string;
  badge?: number;
}

export interface StudioNavGroup {
  label: string;
  links: StudioNavLink[];
}

export const STUDIO_TAB_LABELS: Record<StudioTab, string> = {
  story: "Story", graph: "Graph", checkpoints: "Checkpoints", transitions: "Transitions", chapters: "Chapters",
  qualities: "Qualities", game: "Game", rules: "Story rules", roster: "Roster", sprites: "Sprites", world: "World",
  presentation: "Presentation", features: "Story features", copilot: "Wizard", diagnostics: "Diagnostics",
};

const GROUPS: Array<{ label: string; tabs: StudioTab[] }> = [
  { label: "Story", tabs: ["story"] },
  { label: "Flow", tabs: ["graph", "checkpoints", "transitions", "chapters"] },
  { label: "State", tabs: ["qualities", "game", "rules"] },
  { label: "Characters", tabs: ["roster", "sprites"] },
  { label: "World", tabs: ["world"] },
  { label: "Presentation", tabs: ["presentation"] },
  { label: "Features", tabs: ["features"] },
  { label: "Assistant", tabs: ["copilot"] },
  { label: "Validation", tabs: ["diagnostics"] },
];

const slug = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "member";

export const pageKey = (page: StudioPage): string => (page.member ? `${page.tab}:${page.member}` : page.tab);

export const characterElementId = (memberId: string): string => `so-studio-tab-character-${slug(memberId)}`;

const tabLink = (tab: StudioTab, badge?: number): StudioNavLink => ({
  key: tab, page: { tab }, label: STUDIO_TAB_LABELS[tab], elementId: `so-studio-tab-${tab}`, ...(badge ? { badge } : {}),
});

const memberLink = (member: RosterMember): StudioNavLink => ({
  key: `roster:${member.id}`, page: { tab: "roster", member: member.id }, label: member.name?.trim() || member.id, elementId: characterElementId(member.id),
});

export const studioNav = (tabs: readonly StudioTab[], roster: readonly RosterMember[], issues = 0): StudioNavGroup[] => GROUPS
  .map((group) => {
    const links = group.tabs.filter((tab) => tabs.includes(tab)).flatMap((tab) => {
      const link = tabLink(tab, tab === "diagnostics" ? issues : undefined);
      return tab === "roster" ? [link, ...roster.filter((member) => member.id).map(memberLink)] : [link];
    });
    return { label: group.label, links };
  })
  .filter((group) => group.links.length > 0);

export const navLinks = (groups: readonly StudioNavGroup[]): StudioNavLink[] => groups.flatMap((group) => group.links);

export const sectionLabel = (groups: readonly StudioNavGroup[], page: StudioPage): string => {
  const key = pageKey(page);
  const group = groups.find((entry) => entry.links.some((link) => link.key === key));
  const link = group?.links.find((entry) => entry.key === key);
  if (!group || !link) return STUDIO_TAB_LABELS[page.tab];
  return group.links.length === 1 || group.label === link.label ? link.label : `${group.label} · ${link.label}`;
};

const ALIASES: Record<string, StudioTab> = {
  ...Object.fromEntries(Object.entries(STUDIO_TAB_LABELS).map(([tab, label]) => [label.toLowerCase(), tab as StudioTab])),
  characters: "roster", features: "features", rules: "rules", validation: "diagnostics", assistant: "copilot", flow: "graph",
};

export const pageForLabel = (label: string, roster: readonly RosterMember[] = []): StudioPage | null => {
  const wanted = label.trim().toLowerCase();
  const tab = ALIASES[wanted];
  if (tab) return { tab };
  const member = roster.find((entry) => entry.id.toLowerCase() === wanted || (entry.name ?? "").trim().toLowerCase() === wanted);
  return member ? { tab: "roster", member: member.id } : null;
};
