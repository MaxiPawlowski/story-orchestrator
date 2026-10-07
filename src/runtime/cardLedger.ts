import type { EngineState, NormalizedStoryV2 } from "@engine/index";
import { ledgerKey, type LedgerView } from "@memory/index";
import { spriteLookIssues } from "./spriteLookHealth";

export const cardSurface = (story: NormalizedStoryV2 | null, state: EngineState | null, chatId: string | null, ledger: LedgerView[]) => ({
  ledger: cardLedgerView(story, state, ledger), spriteLookIssues: spriteLookIssues(chatId),
});

export function cardLedgerView(story: NormalizedStoryV2 | null, state: EngineState | null, rows: LedgerView[]): LedgerView[] {
  if (!story || !state) return rows;
  const cards = Object.entries(story.cardFieldByQuality ?? {}).flatMap(([key, binding]): LedgerView[] => {
    const value = state.blackboard.values[key];
    if (typeof value !== "string" || !value.trim()) return [];
    const member = story.roster.find((member) => member.id === binding.owner);
    const entity = binding.owner === "player" ? "Player" : member?.name ?? binding.owner;
    const source = state.blackboard.writerOf?.[key];
    const cardWriter = source?.writer === "card-entry" ? "authored" : source?.writer === "manual" ? "manual" : "read";
    return [{ entity, field: binding.field, value, bound: true, turn: source?.boundary ?? 0, cardWriter }];
  });
  const keys = new Set(cards.map((row) => ledgerKey(row.entity, row.field)));
  return [...rows.filter((row) => !keys.has(ledgerKey(row.entity, row.field))), ...cards];
}
