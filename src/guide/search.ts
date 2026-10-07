import { plainText } from "./markdown";
import type { GuideAudience, GuidePage } from "./types";

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

export const groupPages = (pages: readonly GuidePage[]): Array<{ audience: GuideAudience; pages: GuidePage[] }> => AUDIENCE_ORDER
  .map((audience) => ({ audience, pages: pages.filter((page) => page.audience === audience).sort((a, b) => sectionRank(a) - sectionRank(b) || a.title.localeCompare(b.title)) }))
  .filter((group) => group.pages.length > 0);

const sectionRank = (page: GuidePage) => (page.id.endsWith("README") ? 0 : page.id.includes("/topics/") ? 2 : 1);
