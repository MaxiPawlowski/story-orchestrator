import type { AnimationFrames } from "./animation";
import { resolveSprite, spriteIndex, type SpriteProfile } from "./profile";

export interface LookActor {
  profile: SpriteProfile;
  packs: Map<string, Map<string, string>>;
  frames: Map<string, Map<string, AnimationFrames>>;
  set: string;
  label: string;
  path: string;
  desiredLabel: string;
  generatedLook?: string;
  lookError?: string;
}

export interface LookResult {
  set: string;
  label: string;
  stamp: string;
  files: Array<{ label: string; path: string }>;
  frames?: AnimationFrames;
}

export function applyLookResult(actor: LookActor, result: LookResult): boolean {
  actor.lookError = undefined;
  actor.packs.set(result.set, spriteIndex(result.files));
  if (result.frames) {
    const index = actor.frames.get(result.set) ?? new Map<string, AnimationFrames>();
    index.set(result.label, result.frames);
    actor.frames.set(result.set, index);
  }
  if (actor.desiredLabel !== result.label) return false;
  actor.set = result.set;
  actor.generatedLook = result.stamp;
  const hit = resolveSprite(actor.profile, result.label, actor.packs.get(result.set) ?? new Map());
  if (!hit) return false;
  actor.path = hit.path;
  actor.label = hit.label;
  return true;
}
