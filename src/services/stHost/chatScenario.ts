import { couldNot, wrote, type WriteResult } from "@utils/writeResult";
import type { SillyTavernContext } from "./hostTypes";

type ScenarioContext = Pick<SillyTavernContext, "chatId" | "chatMetadata" | "characters" | "characterId" | "groupId" | "groups">;

const SCENARIO_KEY = "scenario";

const text = (value: unknown): string => (typeof value === "string" ? value : "");

export function readChatScenario(context: ScenarioContext): { chatId: string; text: string } | null {
  const chatId = String(context.chatId ?? "");
  if (!chatId) return null;
  return { chatId, text: text(context.chatMetadata?.[SCENARIO_KEY]) };
}

export function writeChatScenario(context: ScenarioContext, chatId: string, value: string): WriteResult<{ chatId: string; text: string }> {
  if (!chatId || String(context.chatId ?? "") !== chatId) return couldNot("the open chat is not the chat this scenario belongs to");
  if (value) context.chatMetadata[SCENARIO_KEY] = value;
  else delete context.chatMetadata[SCENARIO_KEY];
  return wrote({ chatId, text: value });
}

export function readCastScenarios(context: ScenarioContext): Array<{ name: string; scenario: string }> {
  const card = (avatar: string | undefined) => context.characters.find((character) => character.avatar === avatar);
  const groupId = String(context.groupId ?? "");
  const group = groupId ? context.groups.find((entry) => String(entry.id) === groupId) : null;
  const cards = group
    ? group.members.filter((member) => !(group.disabled_members ?? []).includes(member)).map(card)
    : [context.characters[Number(context.characterId)]];
  return cards
    .filter((character): character is NonNullable<typeof character> => Boolean(character))
    .map((character) => ({ name: text(character.name), scenario: text(character.scenario).trim() }))
    .filter((entry) => entry.name && entry.scenario);
}
