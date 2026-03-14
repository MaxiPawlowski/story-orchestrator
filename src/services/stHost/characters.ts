import { rossModsModule, scriptModule } from "./modules";

export type StoryOrchestratorCharacter = Character;

export function getCharacterNameById(id: number | undefined): string | undefined {
  if (id === undefined) return undefined;
  const characters = scriptModule.characters;
  return characters[id]?.name;
}

export function getCharacterIdByName(name: string): number | undefined {
  if (!name) return undefined;
  const characters = scriptModule.characters;
  const searchName = name.trim().toLowerCase();
  return characters.findIndex((character) => character.name?.trim().toLowerCase() === searchName);
}

export function getAllCharacterNames(): string[] {
  try {
    return scriptModule.characters
      .map((character) => character?.name)
      .filter((name): name is string => typeof name === "string" && name.trim().length > 0)
      .map((name) => name.trim());
  } catch (err) {
    console.warn("[Story - STAPI] Failed to get character names", err);
    return [];
  }
}

export function getCharacters(): StoryOrchestratorCharacter[] {
  try {
    return scriptModule.characters;
  } catch {
    return [];
  }
}

export const getMessageTimeStamp = rossModsModule.getMessageTimeStamp;
