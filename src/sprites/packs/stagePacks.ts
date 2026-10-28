import type { NormalizedStory } from "@engine/index";
import type { SpriteCastMember } from "@services/stHost/sprites";
import { lookSignature } from "../visualManifest";
import { bindsPacks } from "./scene";
import type { StageIdentity } from "./stageLooks";

export const packIdentityDeps = (story: NormalizedStory | null): { identity?: (member: SpriteCastMember) => Promise<StageIdentity | null> } => {
  if (!story || !bindsPacks(story)) return {};
  return { identity: async (member) => {
    const roster = story.roster.find((row) => (row.name ?? row.id).toLowerCase() === member.name.toLowerCase());
    return roster ? (await import("./bridgeHost")).visualBridge().stage(story, roster.id) : null;
  } };
};

export const packedSet = (actor: { identity?: { looks: Record<string, { set: string }> } }, fields: Record<string, string>): string | null =>
  actor.identity?.looks[lookSignature(fields)]?.set ?? null;
