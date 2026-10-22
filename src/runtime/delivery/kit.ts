import { polishOn, type NormalizedStory } from "@engine/index";
import { mineRepetitionBy, repeatedPhrases, type MemberRepetition } from "./mine";
import { renderDelivery } from "./render";

export { mineRepetitionBy, repeatedPhrases, renderDelivery };
export type { MemberRepetition };

export interface DeliveryDraft {
  story: NormalizedStory;
  rosterId: string;
  rows: readonly unknown[];
  mood: string | null;
  repetition: boolean;
}

export const deliveryLines = (draft: DeliveryDraft): string[] => {
  const member = draft.story.roster.find((entry) => entry.id === draft.rosterId);
  if (!member || member.polish?.enabled === false) return [];
  const repeated = draft.repetition ? repeatedPhrases(mineRepetitionBy(draft.rows, draft.story).get(member.id)) : [];
  return renderDelivery({ sheet: polishOn(member.polish) ? member.polish : undefined, mood: draft.mood, repeated }).lines;
};

export const deliveryReadout = (story: NormalizedStory, rows: readonly unknown[]): Record<string, MemberRepetition> =>
  Object.fromEntries(mineRepetitionBy(rows, story));
