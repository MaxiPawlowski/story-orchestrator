import type { InlineItem, InlineView } from "./inlineTimeline";
import { INLINE_CATEGORIES, type InlineCategory } from "./settingsModel";

export const INLINE_CATEGORY_LABELS: Record<InlineCategory, string> = {
  progress: "Progress",
  memory: "Memory",
  threads: "Threads",
  lore: "World Info",
  cast: "Cast & direction",
  pacing: "Pacing",
  calls: "Model calls",
  health: "Health",
};

export interface InspectorSection {
  category: InlineCategory;
  label: string;
  items: InlineItem[];
}

export interface MessageInspection {
  messageId: number;
  inWindow: boolean;
  sections: InspectorSection[];
}

export function inspectMessage(view: InlineView, messageId: number): MessageInspection {
  const items = view.byMessage[messageId] ?? [];
  const inWindow = messageId <= view.newestMessageId && messageId > view.newestMessageId - view.window;
  const sections = INLINE_CATEGORIES
    .map((category) => ({ category, label: INLINE_CATEGORY_LABELS[category], items: items.filter((item) => item.category === category && item.until === undefined) }))
    .filter((section) => section.items.length > 0);
  return { messageId, inWindow, sections };
}
