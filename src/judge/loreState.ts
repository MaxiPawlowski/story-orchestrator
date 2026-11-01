export interface LoreStateEntity {
  name: string;
  aliases: string[];
}

export interface LoreState {
  place?: string;
  cast: LoreStateEntity[];
  quests: string[];
  known: string[];
}

export const LORE_STATE_CAST = 8;
export const LORE_STATE_ALIASES = 3;
export const LORE_STATE_QUESTS = 4;
export const LORE_STATE_KNOWN = 12;
export const LORE_STATE_CHARS = 60;

const clip = (text: string) => text.trim().slice(0, LORE_STATE_CHARS).trim();

const distinct = (names: readonly string[]) => {
  const seen = new Set<string>();
  return names.map(clip).filter((name) => name && !seen.has(name.toLowerCase()) && Boolean(seen.add(name.toLowerCase())));
};

export const isEmptyLoreState = (state: LoreState): boolean => !state.place && !state.cast.length && !state.quests.length && !state.known.length;

// What the judge reads beside the scene name and goal: short, capped, and only what the player could see.
export function loreStateFields(state: LoreState): Record<string, string | string[]> {
  const cast = state.cast.slice(0, LORE_STATE_CAST).map((member) => {
    const aliases = distinct(member.aliases).filter((alias) => alias.toLowerCase() !== member.name.trim().toLowerCase()).slice(0, LORE_STATE_ALIASES);
    return aliases.length ? `${clip(member.name)} (also ${aliases.join(", ")})` : clip(member.name);
  }).filter(Boolean);
  const quests = distinct(state.quests).slice(0, LORE_STATE_QUESTS);
  const known = distinct(state.known).slice(0, LORE_STATE_KNOWN);
  return {
    ...(state.place?.trim() ? { place: clip(state.place) } : {}),
    ...(cast.length ? { cast } : {}),
    ...(quests.length ? { quests } : {}),
    ...(known.length ? { known } : {}),
  };
}

export const loreStateTerms = (state: LoreState): string[] =>
  distinct([state.place ?? "", ...state.cast.flatMap((member) => [member.name, ...member.aliases]), ...state.quests, ...state.known]);
