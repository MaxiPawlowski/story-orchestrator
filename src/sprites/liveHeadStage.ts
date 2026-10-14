import { findLiveHead, type LiveHeadRef } from "./liveHeadRefs";
import type { Actor } from "./castLoad";
import { currentVisual, lookSignature, visualHead, type VisualManifest, type VisualSources } from "./visualManifest";
import type { DrawnSource } from "./liveHead/drawn";
import { FRAME_KEYS } from "./frameKeys";

type Member = { name: string; avatar: string };
type Roster = readonly { id: string; name?: string }[];
const memberId = (member: Member, roster: Roster): string =>
  roster.find((entry) => (entry.name ?? entry.id).toLowerCase() === member.name.toLowerCase())?.id ?? member.avatar;

function bodyFields(look: string): Record<string, string> | null {
  try {
    const value: unknown = JSON.parse(look);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const entries = Object.entries(value);
    return entries.every(([, field]) => typeof field === "string") ? Object.fromEntries(entries) as Record<string, string> : null;
  } catch { return null; }
}

export function actorLook(actor: Pick<Actor, "set" | "bodies">, source: VisualManifest): string {
  if (actor.set === source.baseSet) return "default";
  const body = actor.bodies?.find((entry) => entry.set === actor.set), fields = body ? bodyFields(body.look) : null;
  if (!fields) return actor.set;
  const look = currentVisual(source, lookSignature(fields));
  return Object.entries(source.looks).find(([, entry]) => entry === look)?.[0] ?? actor.set;
}

export function actorHeadRef(actor: Actor, roster: Roster, refs: Record<string, LiveHeadRef>, sources?: VisualSources): LiveHeadRef | undefined {
  const prepared = sources?.[actor.profile.folder];
  if (prepared) return visualHead(prepared, actorLook(actor, prepared), memberId(actor, roster), refs).rig;
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
    const look = source && actor ? actorLook(actor, source) : actor?.set ?? "default";
    return { member: memberId(member, roster), name: member.name, look, present: !!actor && !!actorHeadRef(actor, roster, refs, sources),
      ...(source ? { state: visualHead(source, look, memberId(member, roster), refs).state } : {}) };
  });
}
