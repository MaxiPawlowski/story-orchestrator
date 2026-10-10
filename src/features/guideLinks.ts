import type { GuideTopicId } from "@copilot/guideTopics";
import * as manifestModule from "../../manifest.json";
import * as groupsModule from "./guideTopicGroups.json";

const manifest = ((manifestModule as { default?: unknown }).default ?? manifestModule) as { homePage?: unknown };

export const HOME_PAGE: string = String(manifest.homePage ?? "").replace(/\/blob\/.*$/, "").replace(/\/+$/, "");

export const GUIDE_BRANCH = "master";

export const guideUrl = (doc: string, homePage: string = HOME_PAGE): string | null => (homePage ? `${homePage}/blob/${GUIDE_BRANCH}/docs/guide/${doc}` : null);

export interface GuideTopicGroup {
  page: string;
  title: string;
  topics: string[];
}

export const GUIDE_TOPIC_GROUPS = ((groupsModule as { default?: unknown }).default ?? groupsModule) as readonly GuideTopicGroup[];

export const authorFieldsDoc = (page: string): string => `author/fields/${page}.md`;

const PAGE_OF_TOPIC = new Map(GUIDE_TOPIC_GROUPS.flatMap((group) => group.topics.map((topic) => [topic, group.page] as const)));

export const authorGuideDoc = (topic: GuideTopicId): string => `${authorFieldsDoc(PAGE_OF_TOPIC.get(topic) ?? "missing")}#${topic}`;
