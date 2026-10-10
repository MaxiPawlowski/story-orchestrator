import { plainText } from "./markdown";
import type { GuideAudience, GuideNavSection, GuidePage } from "./types";

export interface GuideHit {
  page: GuidePage;
  score: number;
  snippet: string;
}

export interface GuideIndexEntry {
  page: GuidePage;
  title: string;
  headings: string;
  text: string;
}

export const visiblePages = (pages: readonly GuidePage[], authorView: boolean): GuidePage[] => pages.filter((page) => authorView || page.audience !== "author");

export const indexPages = (pages: readonly GuidePage[]): GuideIndexEntry[] => pages.map((page) => ({
  page,
  title: page.title.toLowerCase(),
  headings: page.headings.map((heading) => heading.text).join(" ").toLowerCase(),
  text: plainText(page.body),
}));

const SNIPPET = 140;

const snippetOf = (text: string, word: string): string => {
  const flat = text.replace(/\s+/g, " ");
  const at = flat.toLowerCase().indexOf(word);
  if (at < 0) return flat.slice(0, SNIPPET);
  const start = Math.max(0, at - 40);
  return `${start > 0 ? "…" : ""}${flat.slice(start, start + SNIPPET)}${start + SNIPPET < flat.length ? "…" : ""}`;
};

export const searchGuide = (index: readonly GuideIndexEntry[], query: string): GuideHit[] => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits: GuideHit[] = [];
  for (const entry of index) {
    const lower = entry.text.toLowerCase();
    if (!words.every((word) => entry.title.includes(word) || entry.headings.includes(word) || lower.includes(word))) continue;
    const score = words.reduce((sum, word) => sum + (entry.title.includes(word) ? 6 : 0) + (entry.headings.includes(word) ? 3 : 0) + Math.min(5, lower.split(word).length - 1), 0);
    hits.push({ page: entry.page, score, snippet: snippetOf(entry.text, words[0]) });
  }
  return hits.sort((a, b) => b.score - a.score || a.page.id.localeCompare(b.page.id));
};

export const AUDIENCE_ORDER: readonly GuideAudience[] = ["player", "setup", "author"];

export interface GuideNavGroup {
  audience: GuideAudience;
  sections: Array<{ title: string; pages: GuidePage[] }>;
}

export const NAV_MORE = "More pages";
export const NAV_ALL = "Pages";

const readmeFirst = (page: GuidePage) => (page.id.endsWith("README") ? 0 : 1);

export const groupPages = (pages: readonly GuidePage[], nav: readonly GuideNavSection[] = []): GuideNavGroup[] => {
  const byId = new Map(pages.map((page) => [page.id, page]));
  const placed = new Set<string>();
  const take = (id: string, audience: GuideAudience): GuidePage[] => {
    const page = byId.get(id);
    if (!page || page.audience !== audience || placed.has(id)) return [];
    placed.add(id);
    return [page];
  };
  return AUDIENCE_ORDER.map((audience) => {
    const listed = nav.filter((section) => section.audience === audience).map((section) => ({ title: section.title, pages: section.ids.flatMap((id) => take(id, audience)) }));
    const rest = pages.filter((page) => page.audience === audience && !placed.has(page.id)).sort((a, b) => readmeFirst(a) - readmeFirst(b) || a.title.localeCompare(b.title));
    const sections = [...listed, { title: nav.length ? NAV_MORE : NAV_ALL, pages: rest }].filter((section) => section.pages.length > 0);
    return { audience, sections };
  }).filter((group) => group.sections.length > 0);
};
