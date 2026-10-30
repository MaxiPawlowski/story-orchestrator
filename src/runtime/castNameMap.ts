import type { NormalizedStory } from "@engine/index";

const stem = (value: string) =>value.replace(/\.(png|webp|jpe?g)$/i, "");

export const buildCastNames = (story: NormalizedStory | null, characters: ReadonlyArray<{ avatar?: string; name?: string }>): Record<string, string> => {
  const names: Record<string, string> = {};
  for (const character of characters) {
    if (!character.avatar || !character.name) continue;
    names[character.avatar] = character.name;
    names[stem(character.avatar)] = character.name;
  }
  for (const member of story?.roster ?? []) names[member.id] = member.name ?? names[member.id] ?? member.id;
  return names;
};
