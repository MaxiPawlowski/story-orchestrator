import { nearestKey } from "@utils/levenshtein";
import { authorTopics, featureTopics, guideTopics, stTopics } from "./topics";
import type { KnowledgeAudience, KnowledgeTopic } from "./types";

export * from "./types";
export { ST_TOPICS, ST_PINNED_VERSION } from "./sillytavern";
export { TOPIC_CHARS, featureTopicText, pageSections, isCoveredElsewhere, GUIDE_PAGES_COVERED_ELSEWHERE } from "./topics";

export const SEARCH_LIMIT = 6;
const SNIPPET = 160;

let cached: KnowledgeTopic[] | null = null;

export const knowledgeTopics = (): KnowledgeTopic[] => {
  cached ??= [...featureTopics(), ...guideTopics(), ...authorTopics(), ...stTopics()];
  return cached;
};

export const ALL_AUDIENCES: readonly KnowledgeAudience[] = ["player", "setup", "author"];
export const PLAYER_AUDIENCES: readonly KnowledgeAudience[] = ["player"];

export const topicsFor = (audiences: readonly KnowledgeAudience[]): KnowledgeTopic[] => knowledgeTopics().filter((topic) => audiences.includes(topic.audience));

export const findTopic = (id: unknown, audiences: readonly KnowledgeAudience[]): KnowledgeTopic | null => {
  const wanted = typeof id === "string" ? id.trim().toLowerCase() : "";
  return topicsFor(audiences).find((topic) => topic.id.toLowerCase() === wanted) ?? null;
};

export const renderTopic = (topic: KnowledgeTopic): string => `${topic.title} [${topic.id}]\n${topic.text}`;

export const readKnowledge = (id: unknown, audiences: readonly KnowledgeAudience[]): string => {
  const topic = findTopic(id, audiences);
  if (topic) return renderTopic(topic);
  const typed = typeof id === "string" ? id.trim().toLowerCase() : "";
  if (!typed) return "Name a topic id, or call searchKnowledge first to find one.";
  const near = nearestKey(typed, topicsFor(audiences).map((entry) => entry.id));
  return `No topic "${typed}"${near ? ` (did you mean "${near}"?)` : ""}. Call searchKnowledge to find topic ids.`;
};

const words = (query: string) => query.toLowerCase().split(/[^\p{L}\p{N}_-]+/u).filter((word) => word.length > 2);

const snippetOf = (text: string, word: string | undefined): string => {
  const at = word ? text.toLowerCase().indexOf(word) : -1;
  const start = Math.max(0, at - 40);
  const cut = text.slice(start, start + SNIPPET);
  return `${start > 0 ? "…" : ""}${cut}${start + SNIPPET < text.length ? "…" : ""}`;
};

export interface KnowledgeHit {
  topic: KnowledgeTopic;
  score: number;
}

export const scoreTopic = (topic: KnowledgeTopic, terms: readonly string[]): number => {
  const title = topic.title.toLowerCase();
  const id = topic.id.toLowerCase();
  const text = topic.text.toLowerCase();
  return terms.reduce((sum, term) => sum + (title.includes(term) ? 6 : 0) + (id.includes(term) ? 4 : 0) + Math.min(4, text.split(term).length - 1), 0);
};

export const searchTopics = (query: unknown, audiences: readonly KnowledgeAudience[], limit = SEARCH_LIMIT): KnowledgeHit[] => {
  const terms = words(typeof query === "string" ? query : "");
  if (!terms.length) return [];
  return topicsFor(audiences)
    .map((topic) => ({ topic, score: scoreTopic(topic, terms) }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || a.topic.id.localeCompare(b.topic.id))
    .slice(0, limit);
};

export const searchKnowledge = (query: unknown, audiences: readonly KnowledgeAudience[]): string => {
  const terms = words(typeof query === "string" ? query : "");
  if (!terms.length) return "Give a few words to search for.";
  const hits = searchTopics(query, audiences);
  if (!hits.length) return `Nothing matches "${String(query).trim()}". Try other words.`;
  return hits.map((hit) => `- ${hit.topic.id}: ${hit.topic.title} — ${snippetOf(hit.topic.text, terms.find((term) => hit.topic.text.toLowerCase().includes(term)))}`).join("\n");
};
