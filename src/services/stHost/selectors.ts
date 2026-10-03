import { getContext } from "./context";
import type { HostCharacter, HostSlashCommand } from "./hostTypes";
import { getWorldInfoSettings, listAllLorebooks, listSelectedLorebooks, readChatLorebookSlot, type Lorebook } from "./worldInfo";

const trim = (value: string | null | undefined) => value?.trim() ?? "";

const uniq = (values: string[]) => {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export type HostSlashCommandMeta = {
  name: string;
  aliases: string[];
  helpString?: string;
};

// The *active* global books — what a story's `requirements.lorebooks` is satisfied by. Two host
// quirks decide how this is read (live findings): activation lands in
// `selected_world_info` and only reaches `world_info.globalSelect` on a debounced save, and deleting
// a book leaves its name behind in the selection — so read the live array and intersect it with the
// books that actually exist, or a requirement goes green over a lorebook that is gone.
export function listGlobalLorebooks(): string[] {
  const existing = new Set(listAllLorebooks().map((name) => name.toLowerCase()));
  const selected = uniq(listSelectedLorebooks().map((name) => trim(name)).filter(Boolean));
  return existing.size ? selected.filter((name) => existing.has(name.toLowerCase())) : selected;
}

export interface HostLoreBindings {
  global: string[];
  chat: string | null;
  persona: string | null;
  characters: Array<{ name: string; books: string[] }>;
  listed?: string[];
}

const withoutExtension = (file: string) => file.replace(/\.[^/.]+$/, "");

// Who ST can draft here: a group's enabled members (group-chats.js:1003).
function draftableCharacters(): HostCharacter[] {
  const { groupId, groups, characters } = getContext();
  const activeGroupId = trim(groupId == null ? "" : String(groupId));
  const group = activeGroupId ? groups.find((entry) => trim(entry.id) === activeGroupId) : null;
  if (!group) return [];
  return group.members.filter((member) => !group.disabled_members.includes(member))
    .flatMap((member): HostCharacter[] => characters.filter((character) => character.avatar === member).slice(0, 1));
}

// The books ST scans beyond the global selection: the chat slot, the persona's book and each draftable
// character's books (world-info.js:4475-4588). A binding to a book that no longer exists counts as empty.
export function readLoreBindings(): HostLoreBindings {
  const context = getContext();
  const existing = new Map(listAllLorebooks().map((name) => [name.toLowerCase(), name]));
  const live = (value: unknown): string | null => {
    const name = typeof value === "string" ? value.trim() : "";
    if (!name) return null;
    return existing.size ? existing.get(name.toLowerCase()) ?? null : name;
  };
  const charLore = getWorldInfoSettings().world_info?.charLore ?? [];
  const extraBooks = (avatar: string) => {
    const found = charLore.find((entry) => entry.name === withoutExtension(avatar))?.extraBooks;
    return Array.isArray(found) ? found : [];
  };
  return {
    global: listGlobalLorebooks(),
    chat: live(readChatLorebookSlot()),
    persona: live(context.powerUserSettings?.persona_description_lorebook),
    characters: draftableCharacters().map((character) => ({
      name: trim(character.name),
      books: uniq([character.data?.extensions?.world, ...extraBooks(trim(character.avatar))].flatMap((book) => live(book) ?? [])),
    })),
    listed: [...existing.values()],
  };
}

// Every book that exists, active or not — the set create-only validation must use. Lives in
// worldInfo.ts (selectors imports from it, never the other way round).
export { listAllLorebooks } from "./worldInfo";

export async function listLorebookComments(lorebook: string): Promise<string[]> {
  const name = trim(lorebook);
  if (!name) return [];
  const loaded = await getContext().loadWorldInfo(name) as Lorebook | null;
  if (!loaded?.entries) return [];
  return uniq(Object.values(loaded.entries).map((entry) => trim(entry.comment)).filter(Boolean));
}

export function listActiveWorldInfoComments(): string[] {
  const { worldInfo } = getContext();
  return uniq(Object.values(worldInfo ?? {}).filter((entry) => !entry.disable).map((entry) => trim(entry.comment)).filter(Boolean));
}

// power_user.personas maps avatar file -> persona name (power-user.js:286, exposed on the context
// as powerUserSettings in st-context.js:229). Names are what a story's requirements reference.
export function listPersonas(): string[] {
  const personas = getContext().powerUserSettings?.personas ?? {};
  return uniq(Object.values(personas).map((name) => trim(name)).filter(Boolean));
}

const memberStem = (member: string) => trim(member).replace(/\.[a-z0-9]+$/i, "");

const activeGroupEntry = () => {
  const { groupId, groups } = getContext();
  const activeGroupId = trim(groupId == null ? "" : String(groupId));
  if (!activeGroupId) return null;
  return groups.find((entry) => trim(entry.id) === activeGroupId) ?? null;
};

export function listGroupMembers(): string[] {
  const group = activeGroupEntry();
  if (!group) return [];
  const characters = getContext().characters ?? [];
  return uniq(group.members.flatMap((member) => [memberStem(member), trim(characters.find((character) => character.avatar === member)?.name ?? "")]).filter(Boolean));
}

export function listMutedGroupMembers(): string[] {
  const group = activeGroupEntry();
  if (!group) return [];
  const disabled = new Set((group.disabled_members ?? []).map((member) => trim(member)));
  const characters = getContext().characters ?? [];
  return uniq(group.members.filter((member) => disabled.has(trim(member))).flatMap((member) => {
    const name = trim(characters.find((character) => character.avatar === member)?.name ?? "");
    return [memberStem(member), name].filter(Boolean);
  }));
}

export function listSlashCommands(): HostSlashCommandMeta[] {
  const commands = getContext().SlashCommandParser?.commands ?? {};
  const seen = new Set<HostSlashCommand>();
  const entries: HostSlashCommandMeta[] = [];
  for (const [name, command] of Object.entries(commands)) {
    if (!name || seen.has(command)) continue;
    seen.add(command);
    entries.push({
      name,
      aliases: (command.aliases ?? []).map((alias) => trim(alias)).filter(Boolean),
      helpString: trim(command.helpString) || undefined,
    });
  }
  return entries;
}
