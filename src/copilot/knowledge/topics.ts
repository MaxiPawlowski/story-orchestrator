import { FEATURES, NEED_LABELS, type Feature } from "@features/registry";
import { GUIDE_PAGES } from "@guide/pages.generated";
import { plainText } from "@guide/markdown";
import type { GuidePage } from "@guide/types";
import { GUIDE_TOPIC_IDS, renderGuideTopic, GUIDE_TOPICS } from "../guideTopics";
import { ST_PINNED_VERSION, ST_TOPICS } from "./sillytavern";
import type { KnowledgeTopic } from "./types";

export const TOPIC_CHARS = 1500;

export const REGISTRY_SINCE = "v2.7 01";
export const AUTHOR_GUIDE_SINCE = "v2.6";

export const GUIDE_PAGES_COVERED_ELSEWHERE: Readonly<Record<string, string>> = {
  "setup/settings-reference": "each setting is in its feature topic",
};

export const isCoveredElsewhere = (page: GuidePage): boolean => Object.hasOwn(GUIDE_PAGES_COVERED_ELSEWHERE, page.id) || page.id.startsWith("author/fields/");

const flat = (text: string) => text.replace(/\s+/g, " ").trim();

export const clipTopic = (text: string): string => (text.length > TOPIC_CHARS ? `${text.slice(0, TOPIC_CHARS).trimEnd()}…` : text);

export const featureTopicText = (feature: Feature): string => [
  feature.oneLine,
  feature.what,
  `Where: ${feature.where.label}.`,
  ...(feature.needs?.length ? [`Needs: ${feature.needs.map((need) => NEED_LABELS[need]).join(", ")}.`] : []),
  ...(feature.settings.length ? [`Settings: ${feature.settings.join(", ")}.`] : []),
  `Guide: ${feature.doc}.`,
].join(" ");

export const featureTopics = (): KnowledgeTopic[] => FEATURES.map((feature) => ({
  id: `feature/${feature.id}`,
  family: "feature",
  title: feature.name,
  text: featureTopicText(feature),
  audience: feature.audience,
  source: `src/features/registry.ts (${feature.id}); docs/guide/${feature.doc}`,
  since: REGISTRY_SINCE,
  showMe: { kind: "feature", target: feature.id },
}));

export interface PageSection {
  slug: string | null;
  heading: string;
  markdown: string;
}

export const pageSections = (page: GuidePage): PageSection[] => {
  const parts = page.body.replace(/\r\n/g, "\n").split(/^## .*$/m);
  const headings = page.headings.filter((heading) => heading.level === 2);
  const [intro, ...rest] = parts;
  return [
    { slug: null, heading: page.title, markdown: intro },
    ...rest.map((markdown, index) => ({ slug: headings[index]?.slug ?? null, heading: headings[index]?.text ?? page.title, markdown })),
  ].filter((section) => flat(plainText(section.markdown)).length > 0);
};

export const guideTopics = (): KnowledgeTopic[] => GUIDE_PAGES.filter((page) => !isCoveredElsewhere(page)).flatMap((page) => pageSections(page).map((section) => ({
  id: `guide/${page.id}${section.slug ? `#${section.slug}` : ""}`,
  family: "guide" as const,
  title: section.slug ? `${page.title}: ${section.heading}` : page.title,
  text: clipTopic(flat(plainText(section.markdown))),
  audience: page.audience,
  source: `docs/guide/${page.doc}`,
  since: REGISTRY_SINCE,
  showMe: { kind: "doc" as const, target: `${page.doc}${section.slug ? `#${section.slug}` : ""}` },
})));

export const authorTopics = (): KnowledgeTopic[] => GUIDE_TOPIC_IDS.map((id) => ({
  id: `author/${id}`,
  family: "author",
  title: GUIDE_TOPICS[id].title,
  text: renderGuideTopic(id),
  audience: "author",
  source: `docs/authoring/story-guide.md (${id}); src/copilot/guideTopics.ts`,
  since: AUTHOR_GUIDE_SINCE,
  showMe: { kind: "studio", target: id },
}));

export const stTopics = (): KnowledgeTopic[] => ST_TOPICS.map((topic) => ({
  id: `st/${topic.id}`,
  family: "st",
  title: topic.title,
  text: topic.text,
  audience: topic.audience,
  source: topic.sources.map((source) => `SillyTavern ${source.file} (${source.anchor})`).join("; "),
  since: `SillyTavern ${ST_PINNED_VERSION}`,
  showMe: null,
}));
