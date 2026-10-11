import type { CardBinding, MemberSprites, StoryPoses, StageMember, StoryV2 } from "@engine/schema";

export const setPoses = (draft: StoryV2, poses: StoryPoses): StoryV2 => ({ ...draft, poses });
export const setMemberPoses = (draft: StoryV2, id: string, sprites: MemberSprites): StoryV2 => ({ ...draft, roster: draft.roster.map((member) => member.id === id ? { ...member, sprites } : member) });
export const setPoseCard = (draft: StoryV2, id: string, card: CardBinding): StoryV2 => ({ ...draft, roster: draft.roster.map((member) => member.id === id ? { ...member, card } : member) });
export const setStagePose = (draft: StoryV2, checkpoint: string, member: string, pose: string): StoryV2 => ({ ...draft,
checkpoints: draft.checkpoints.map((cp) => cp.id === checkpoint ? { ...cp, effects: { ...cp.effects, stage: { ...cp.effects?.stage,
    [member]: { ...(cp.effects?.stage?.cast?.[member] ?? {}), ...(typeof cp.effects?.stage?.[member] === "object" ? cp.effects.stage[member] as StageMember : {}), pose } } } } : cp),
});
