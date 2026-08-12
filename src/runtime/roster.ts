import type { NormalizedStoryV2 } from "@engine/index";
import { getActiveGroup, getContext, resolveGroupMemberId } from "@services/STAPI";

// Roster ↔ ST group/chat resolution, shared by the manager, the coordinators and the talk host.

type RosterMember = NormalizedStoryV2["roster"][number];

export const rosterMemberName = (member: RosterMember): string => member.name ?? member.id;

export function enabledCharacterIds(story: NormalizedStoryV2 | null): string[] {
  if (!story) return [];
  const group = getActiveGroup();
  if (!group) return [];
  const disabled = new Set(group.disabled_members ?? []);
  return story.roster
    .filter((member) => {
      const memberId = resolveGroupMemberId(rosterMemberName(member));
      return memberId ? !disabled.has(memberId) : false;
    })
    .map((member) => member.id);
}

export function enabledCharacterNames(story: NormalizedStoryV2 | null): string[] {
  if (!story) return [];
  const enabled = new Set(enabledCharacterIds(story));
  const names = story.roster.filter((member) => enabled.has(member.id)).map(rosterMemberName);
  return names.length ? names : story.roster.map(rosterMemberName);
}

export function activeSpeakerId(story: NormalizedStoryV2 | null): string | null {
  if (!story) return null;
  const enabled = new Set(enabledCharacterIds(story));
  if (!enabled.size) return null;
  const chat = Array.isArray(getContext().chat) ? getContext().chat : [];
  for (let index = chat.length - 1; index >= 0; index -= 1) {
    const entry = chat[index] as { name?: string; is_user?: boolean } | undefined;
    if (!entry || entry.is_user || typeof entry.name !== "string" || !entry.name.trim()) continue;
    const match = rosterIdForName(story, entry.name);
    return match && enabled.has(match) ? match : null;
  }
  return null;
}

export function namesForRosterId(story: NormalizedStoryV2 | null, id: string): string[] {
  const member = story?.roster.find((candidate) => candidate.id === id);
  return member ? [rosterMemberName(member), member.id] : [id];
}

export function rosterIdForName(story: NormalizedStoryV2 | null, name: string): string | null {
  if (!story) return null;
  const search = name.trim().toLowerCase();
  const match = story.roster.find((member) => rosterMemberName(member).trim().toLowerCase() === search);
  return match ? match.id : null;
}
