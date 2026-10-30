import type { InlineItem } from "./inlineTimeline";
import { INLINE_CATEGORIES, type InlineCategory, type InlineLevel } from "./settingsModel";
import { INLINE_CATEGORY_LABELS } from "./messageInspector";
import { INLINE_LINE_WORDS } from "@features/inlineCopy";

export interface InlineLinePart {
  category: InlineCategory;
  label: string;
  text: string;
  count: number;
}

export const INLINE_RAW_LEVEL: InlineLevel = 4;

export const inlineGroups = (items: readonly InlineItem[]): Array<{ category: InlineCategory; items: InlineItem[] }> =>
  INLINE_CATEGORIES.map((category) => ({ category, items: items.filter((item) => item.category === category) })).filter((group) => group.items.length > 0);

export const inlineLineParts = (items: readonly InlineItem[]): InlineLinePart[] =>
  inlineGroups(items).map(({ category, items: group }) => ({
    category, label: INLINE_CATEGORY_LABELS[category], text: INLINE_LINE_WORDS[category](group.length), count: group.length,
  }));

export const inlineLineText = (parts: readonly InlineLinePart[]): string => parts.map((part) => part.text).join(" · ");
