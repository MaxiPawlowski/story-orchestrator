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

export async function setGroupMembersDisabled(enable: string[], disable: string[]) {
  const { groupId } = getContext();
  const group = getActiveGroup();
  if (!group || typeof groupId !== "string") return false;
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
  return true;
}
