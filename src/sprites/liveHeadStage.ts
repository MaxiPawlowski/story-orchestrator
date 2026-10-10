import { findLiveHead, type LiveHeadRef } from "./liveHeadRefs";
import type { Actor } from "./castLoad";

type Member = { name: string; avatar: string };
type Roster = readonly { id: string; name?: string }[];
const memberId = (member: Member, roster: Roster): string =>
  roster.find((entry) => (entry.name ?? entry.id).toLowerCase() === member.name.toLowerCase())?.id ?? member.avatar;

export function actorHeadRef(actor: Actor, roster: Roster, refs: Record<string, LiveHeadRef>): LiveHeadRef | undefined {
  const source = actor.packs.get(actor.set)?.get("neutral");
  return source ? findLiveHead(refs, memberId(actor, roster), actor.set, source) : undefined;
}

export function castHeadStatus(actors: readonly Actor[], members: readonly Member[], roster: Roster, refs: Record<string, LiveHeadRef>) {
  return members.map((member) => {
    const actor = actors.find((entry) => entry.avatar === member.avatar);
    return { member: memberId(member, roster), name: member.name, look: actor?.set ?? "default", present: !!actor && !!actorHeadRef(actor, roster, refs) };
  });
}
