import type { SpriteStageIssue } from "@runtime/spriteStageHealth";
import { isRecord } from "@utils/guards";
import { storyDirectsStage } from "./activation";
import type { Actor, MemberGap } from "./castLoad";
import { readStageDirection } from "./direction";

interface StoryLike {
  checkpoints: ReadonlyArray<{ id: string; name?: string; effects?: unknown }>;
}

const GAP_REASON: Record<MemberGap["reason"], (gap: MemberGap) => string> = {
  "no-profile": () => "no sprite pack on the card (so_sprites)",
  "no-default": (gap) => `no sprites in the folder "${gap.folder}"`,
  "no-face": (gap) => `no "${gap.face ?? ""}" sprite in "${gap.folder}"`,
};

const directionIssues = (story: StoryLike, actors: readonly Actor[]): SpriteStageIssue[] => story.checkpoints.flatMap((checkpoint) => {
  const direction = isRecord(checkpoint.effects) ? readStageDirection(checkpoint.effects.stage) : null;
  if (!direction) return [];
  const where = checkpoint.name ?? checkpoint.id;
  return Object.entries(direction.cast).flatMap(([key, entry]): SpriteStageIssue[] => {
    const actor = actors.find((candidate) => candidate.keys.includes(key));
    if (!actor) return [];
    const issues: SpriteStageIssue[] = [];
    if (entry.set && !actor.packs.has(entry.set)) issues.push({ name: actor.name, reason: `"${where}" asks for sprite set "${entry.set}", which is not installed` });
    const pack = actor.packs.get(entry.set && actor.packs.has(entry.set) ? entry.set : "default");
    if (entry.face && !pack?.has(entry.face)) issues.push({ name: actor.name, reason: `"${where}" asks for face "${entry.face}", which is not installed` });
    return issues;
  });
});

export function stagePackIssues(story: StoryLike | null, gaps: readonly MemberGap[], actors: readonly Actor[]): SpriteStageIssue[] {
  if (!story || !storyDirectsStage(story)) return [];
  const members = gaps.filter((gap) => !gap.muted).map((gap) => ({ name: gap.name, reason: GAP_REASON[gap.reason](gap) }));
  const seen = new Set<string>();
  return [...members, ...directionIssues(story, actors)].filter((issue) => {
    const key = `${issue.name}|${issue.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
