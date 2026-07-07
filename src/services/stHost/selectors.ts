import { getContext } from "./context";
import type { HostSlashCommand } from "./hostTypes";
import { getWorldInfoSettings, type Lorebook } from "./worldInfo";

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

export function listGlobalLorebooks(): string[] {
  const settings = getWorldInfoSettings() as { world_info?: { globalSelect?: string[] } };
  return uniq((settings.world_info?.globalSelect ?? []).map((name: string) => trim(name)).filter(Boolean));
}

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
