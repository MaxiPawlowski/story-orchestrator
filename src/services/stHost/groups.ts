import { couldNot, wrote, type WriteResult } from "@utils/writeResult";
import { getContext } from "./context";
import { groupChatsModule } from "./modules";

const trim = (value: unknown) => typeof value === "string" ? value.trim() : "";

export function getActiveGroup() {
  const { groupId, groups } = getContext();
  const id = trim(groupId);
  if (!id) return null;
  return groups.find((group) => trim(group.id) === id) ?? null;
}

export function resolveGroupMemberId(identifier: string): string | null {
  const group = getActiveGroup();
  const search = identifier.trim().toLowerCase();
  if (!group || !search) return null;
  const byAvatar = group.members.find((member) => member.toLowerCase() === search);
  if (byAvatar) return byAvatar;
  const characters = getContext().characters ?? [];
  const found = group.members.find((member) => {
    const character = characters.find((entry) => entry.avatar === member);
    return character?.name?.trim().toLowerCase() === search || member.replace(/\.[a-z0-9]+$/i, "").toLowerCase() === search;
  });
  return found ?? null;
}

// The group is SHARED: `disabled_members` outlives the chat that wrote it, so the
// result has to say whether ST accepted the change rather than whether we meant it.
// `editGroup(id, false)` only schedules ST's 1 s debounced save, and `_save` never reads the
// server's answer (group-chats.js:140, 155). So a cast write answered `ok` before anything reached the
// server; a rollback's restore read as done while the group file still held the old flags. The save is
// made now and the server's copy read back: `null` is a read that could not answer, not a lost write.
async function readServerGroup(groupId: string): Promise<{ disabled_members?: unknown } | null> {
  try {
    const headers = getContext().getRequestHeaders?.() ?? {};
    const response = await fetch("/api/groups/all", { method: "POST", headers, cache: "no-cache" });
    if (!response.ok) return null;
    const groups: unknown = await response.json();
    return Array.isArray(groups) ? groups.find((group) => trim(group?.id) === trim(groupId)) ?? null : null;
  } catch {
    return null;
  }
}

async function saveGroupFlags(group: { id: string; disabled_members?: string[] }): Promise<WriteResult<{ confirmed: boolean }>> {
  const wanted = [...(group.disabled_members ?? [])].sort();
  try {
    await groupChatsModule.editGroup(group.id, true, false);
  } catch (error) {
    return couldNot(`group ${group.id} could not be saved: ${error instanceof Error ? error.message : "the host refused the write"}`);
  }
  const saved = await readServerGroup(group.id);
  if (!saved) return wrote({ confirmed: false });
  const held = (Array.isArray(saved.disabled_members) ? saved.disabled_members.map(String) : []).sort();
  if (JSON.stringify(held) !== JSON.stringify(wanted)) return couldNot(`group ${group.id} was saved, but the server holds disabled ${JSON.stringify(held)}, so the change was lost`);
  return wrote({ confirmed: true });
}

export async function setGroupMembersDisabled(enable: string[], disable: string[]): Promise<WriteResult<{ group: string; confirmed: boolean }>> {
  const { groupId } = getContext();
  const group = getActiveGroup();
  if (!group || typeof groupId !== "string") return couldNot("no group is open");
  group.disabled_members = Array.isArray(group.disabled_members) ? group.disabled_members : [];
  const disabled = new Set(group.disabled_members);

  enable.forEach((identifier) => {
    const member = resolveGroupMemberId(identifier);
    if (member) disabled.delete(member);
  });
  disable.forEach((identifier) => {
    const member = resolveGroupMemberId(identifier);
    if (member) disabled.add(member);
  });

  group.disabled_members = [...disabled];
  const saved = await saveGroupFlags(group);
  return saved.ok ? wrote({ group: groupId, confirmed: saved.confirmed }) : saved;
}

const groupById = (groupId: string) => getContext().groups.find((group) => trim(group.id) === trim(groupId)) ?? null;

/** Put ONE member's flag back on the group the ledger RECORDED, which need not be the open one. */
export async function setGroupMemberDisabled(member: string, disabled: boolean, groupId?: string): Promise<WriteResult<{ member: string }>> {
  if (!groupId) {
    const result = await setGroupMembersDisabled(disabled ? [] : [member], disabled ? [member] : []);
    return result.ok ? wrote({ member }) : result;
  }
  const group = groupById(groupId);
  if (!group) return couldNot(`group ${groupId} is not on this install`);
  const flags = new Set(Array.isArray(group.disabled_members) ? group.disabled_members : []);
  if (disabled) flags.add(member);
  else flags.delete(member);
  group.disabled_members = [...flags];
  const saved = await saveGroupFlags(group);
  return saved.ok ? wrote({ member }) : saved;
}

/** What the RECORDED group holds for one member (the open one when none is named), or null. */
export function readGroupMemberDisabled(member: string, groupId?: string): boolean | null {
  const group = groupId ? groupById(groupId) : getActiveGroup();
  return group ? (group.disabled_members ?? []).includes(member) : null;
}
