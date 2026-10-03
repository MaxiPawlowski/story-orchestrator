import type { InlineView } from "./inlineTimeline";
import { rollText, type RollRecord } from "./rolls";
import type { InlineCategory } from "./settingsModel";

export type ActivityCategory = InlineCategory | "rolls";

export interface ActivityRow {
  id: string;
  messageId: number;
  category: ActivityCategory;
  text: string;
  detail?: string;
  state?: string;
}

export const ACTIVITY_LIMIT = 120;

export function composeActivity(inline: InlineView, rolls: readonly RollRecord[], limit = ACTIVITY_LIMIT): ActivityRow[] {
  const items = Object.entries(inline.byMessage).flatMap(([messageId, list]) => list.map((item): ActivityRow => ({
    id: item.id, messageId: Number(messageId), category: item.category, text: item.text, state: item.state, ...(item.detail ? { detail: item.detail } : {}),
  })));
  const draws = rolls.filter((roll) => roll.messageId >= 0).map((roll): ActivityRow => ({
    id: `roll:${roll.source}:${roll.key}:${roll.boundary}:${roll.messageId}:${roll.draw}`, messageId: roll.messageId, category: "rolls", text: rollText(roll),
  }));
  return [...items, ...draws].sort((left, right) => right.messageId - left.messageId).slice(0, limit);
}
