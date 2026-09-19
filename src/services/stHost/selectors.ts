import { getContext } from "./context";
import type { HostSlashCommand } from "./hostTypes";
import { listAllLorebooks, listSelectedLorebooks, type Lorebook } from "./worldInfo";

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
// quirks decide how this is read (v2.1 plan 07 live findings): activation lands in
// `selected_world_info` and only reaches `world_info.globalSelect` on a debounced save, and deleting
// a book leaves its name behind in the selection — so read the live array and intersect it with the
// books that actually exist, or a requirement goes green over a lorebook that is gone.
export function listGlobalLorebooks(): string[] {
  const existing = new Set(listAllLorebooks().map((name) => name.toLowerCase()));
  const selected = uniq(listSelectedLorebooks().map((name) => trim(name)).filter(Boolean));
  return existing.size ? selected.filter((name) => existing.has(name.toLowerCase())) : selected;
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

export function listGroupMembers(): string[] {
  const { groupId, groups } = getContext();
  const activeGroupId = trim(groupId == null ? "" : String(groupId));
  if (!activeGroupId) return [];
  const group = groups.find((entry) => trim(entry.id) === activeGroupId);
  if (!group) return [];
  return uniq(group.members.map((member) => trim(member).replace(/\.[a-z0-9]+$/i, "")).filter(Boolean));
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
