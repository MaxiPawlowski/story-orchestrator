import type { InlineItem, InlineView, MessagePrompt } from "./inlineTimeline";
import type { BoundaryDigest } from "./boundaryDigest";
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

export const RAW_LEVEL = 4;

export interface InspectorSection {
  category: InlineCategory;
  label: string;
  items: InlineItem[];
}

export interface MessageInspection {
  messageId: number;
  inWindow: boolean;
  boundaries: BoundaryDigest[];
  prompt: MessagePrompt | null;
  health: InlineItem[];
  sections: InspectorSection[];
  raw: InlineItem[];
  rawShown: boolean;
}

const current = (item: InlineItem) => item.until === undefined;

export function inspectMessage(view: InlineView, messageId: number): MessageInspection {
  const items = (view.byMessage[messageId] ?? []).filter(current);
  const inWindow = messageId <= view.newestMessageId && messageId > view.newestMessageId - view.window;
  const rawShown = view.level >= RAW_LEVEL;
  const notes = items.filter((item) => item.level < RAW_LEVEL);
  const sections = INLINE_CATEGORIES.filter((category) => category !== "health")
    .map((category) => ({ category, label: INLINE_CATEGORY_LABELS[category], items: notes.filter((item) => item.category === category) }))
    .filter((section) => section.items.length > 0);
  return {
    messageId,
    inWindow,
    boundaries: view.boundaries?.[messageId] ?? [],
    prompt: view.prompts?.[messageId] ?? null,
    health: notes.filter((item) => item.category === "health"),
    sections,
    raw: rawShown ? items.filter((item) => item.level >= RAW_LEVEL) : [],
    rawShown,
  };
}

export const inspectableIds = (view: InlineView): number[] => [...new Set([
  ...Object.keys(view.byMessage).map(Number).filter((id) => (view.byMessage[id] ?? []).length > 0),
  ...Object.keys(view.boundaries ?? {}).map(Number),
  ...Object.keys(view.prompts ?? {}).map(Number),
])].filter(Number.isFinite).sort((left, right) => left - right);

export const stepMessage = (view: InlineView, messageId: number, direction: -1 | 1): number | null => {
  const ids = inspectableIds(view);
  const next = direction < 0 ? [...ids].reverse().find((id) => id < messageId) : ids.find((id) => id > messageId);
  return next ?? null;
};
