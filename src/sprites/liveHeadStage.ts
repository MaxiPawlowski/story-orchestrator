import { findLiveHead, type LiveHeadRef } from "./liveHeadRefs";
import type { Actor } from "./castLoad";
import { visualHead, type VisualSources } from "./visualManifest";
import type { DrawnSource } from "./liveHead/drawn";
import { FRAME_KEYS } from "./frameKeys";

type Member = { name: string; avatar: string };
type Roster = readonly { id: string; name?: string }[];
const memberId = (member: Member, roster: Roster): string =>
  roster.find((entry) => (entry.name ?? entry.id).toLowerCase() === member.name.toLowerCase())?.id ?? member.avatar;

export function actorHeadRef(actor: Actor, roster: Roster, refs: Record<string, LiveHeadRef>, sources?: VisualSources): LiveHeadRef | undefined {
  const prepared = sources?.[actor.profile.folder];
  if (prepared) return visualHead(prepared, actor.set === prepared.baseSet ? "default" : actor.set, memberId(actor, roster), refs).rig;
  const source = actor.packs.get(actor.set)?.get("neutral");
  return source ? findLiveHead(refs, memberId(actor, roster), actor.set, source) : undefined;
}

export function actorHeadFrames(actor: Actor, sources?: VisualSources): DrawnSource | undefined {
  const frames = actor.frames.get(actor.set)?.get("neutral");
  if (!FRAME_KEYS.some((key) => frames?.[key])) return undefined;
  const box = sources?.[actor.profile.folder]?.box;
  return box ? { frames: { ...frames }, box: { ...box } } : { frames: { ...frames } };
}

export const actorHead = (actor: Actor, roster: Roster, settings: { liveHeadRigs: Record<string, LiveHeadRef>; liveHeadFrames: boolean; visualSources: VisualSources }) => ({
  liveHead: actorHeadRef(actor, roster, settings.liveHeadRigs, settings.visualSources),
  headFrames: settings.liveHeadFrames ? actorHeadFrames(actor, settings.visualSources) : undefined,
});

export function castHeadStatus(actors: readonly Actor[], members: readonly Member[], roster: Roster, refs: Record<string, LiveHeadRef>, sources?: VisualSources) {
  return members.map((member) => {
    const actor = actors.find((entry) => entry.avatar === member.avatar);
    const source = actor && sources?.[actor.profile.folder];
    const look = source && actor?.set === source.baseSet ? "default" : actor?.set ?? "default";
    return { member: memberId(member, roster), name: member.name, look, present: !!actor && !!actorHeadRef(actor, roster, refs, sources),
      ...(source ? { state: visualHead(source, look, memberId(member, roster), refs).state } : {}) };
  });
}
