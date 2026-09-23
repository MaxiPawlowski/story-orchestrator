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

// v2.3 plan 06. The group is SHARED: `disabled_members` outlives the chat that wrote it, so the
// result has to say whether ST accepted the change rather than whether we meant it.
export async function setGroupMembersDisabled(enable: string[], disable: string[]): Promise<WriteResult<{ group: string }>> {
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
  await groupChatsModule.editGroup(groupId, false, false);
  return wrote({ group: groupId });
}

/** Put ONE member's flag back, which is the granularity the effect ledger records at. */
export async function setGroupMemberDisabled(member: string, disabled: boolean): Promise<WriteResult<{ member: string }>> {
  const result = await setGroupMembersDisabled(disabled ? [] : [member], disabled ? [member] : []);
  return result.ok ? wrote({ member }) : result;
}

/** What the open group holds for one member, or null when there is no group to ask. */
export function readGroupMemberDisabled(member: string): boolean | null {
  const group = getActiveGroup();
  return group ? (group.disabled_members ?? []).includes(member) : null;
}
