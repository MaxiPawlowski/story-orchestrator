import { castCardName, PARTY_LOCATION_KEY, questStatus, valueReader, type NormalizedStory } from "@engine/index";
import { codexItems, entityRef, entryName, knownEntities } from "@engine/codex";
import type { LoreState } from "@judge/loreState";

// Player-visible state only: the place, who is switched on in the group, active quest titles and the codex
// entries the player has met. Nothing from memory, so no held secret can reach the lore judge through it.
export function readLoreState(story: NormalizedStory, values: Readonly<Record<string, unknown>>, enabled: readonly string[]): LoreState {
  const place = values[PARTY_LOCATION_KEY];
  const live = new Set(enabled);
  const cast = (story.roster ?? []).filter((member) => live.has(member.id)).map((member) => ({ name: castCardName(member), aliases: member.aliases ?? [] }));
  const reader = valueReader({ ...values });
  const quests = (story.quests ?? []).filter((quest) => questStatus(quest, reader) === "active").map((quest) => quest.title);
  const known = knownEntities(story, { ...values }, enabled).entries;
  const met = codexItems(story).filter(({ page, entry }) => known.has(entityRef(page, entry.id)) && !entry.member).map(({ entry }) => entryName(story, entry));
  return { ...(typeof place === "string" && place.trim() ? { place } : {}), cast, quests, known: met };
}
