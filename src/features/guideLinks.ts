import type { GuideTopicId } from "@copilot/guideTopics";
import * as manifestModule from "../../manifest.json";

const manifest = ((manifestModule as { default?: unknown }).default ?? manifestModule) as { homePage?: unknown };

export const HOME_PAGE: string = String(manifest.homePage ?? "").replace(/\/blob\/.*$/, "").replace(/\/+$/, "");

export const GUIDE_BRANCH = "master";

export const guideUrl = (doc: string, homePage: string = HOME_PAGE): string | null => (homePage ? `${homePage}/blob/${GUIDE_BRANCH}/docs/guide/${doc}` : null);

export const authorGuideDoc = (topic: GuideTopicId): string => `author/topics/${topic}.md`;
