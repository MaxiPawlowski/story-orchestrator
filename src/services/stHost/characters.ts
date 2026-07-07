import { getContext } from "./context";
import type { HostCharacter } from "./hostTypes";
import { rossModsModule } from "./modules";

export type StoryOrchestratorCharacter = HostCharacter;

const hostCharacters = (): StoryOrchestratorCharacter[] => {
  const characters = (getContext() as unknown as { characters?: unknown }).characters;
  return Array.isArray(characters) ? characters as StoryOrchestratorCharacter[] : [];
};

export function getCharacterNameById(id: number | undefined): string | undefined {
  if (id === undefined) return undefined;
  return hostCharacters()[id]?.name;
}

export function getCharacterIdByName(name: string): number | undefined {
  if (!name) return undefined;
  const searchName = name.trim().toLowerCase();
  return hostCharacters().findIndex((character) => character.name?.trim().toLowerCase() === searchName);
}

export function getAllCharacterNames(): string[] {
  try {
    return hostCharacters()
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
    return hostCharacters();
  } catch {
    return [];
  }
}

export const getMessageTimeStamp = rossModsModule.getMessageTimeStamp;
