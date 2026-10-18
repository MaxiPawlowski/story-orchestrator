import type { CardBinding, MemberSprites, StoryPoses, StageMember, Story } from "@engine/schema";

export const setPoses = (draft: Story, poses: StoryPoses): Story => ({ ...draft, poses });
export const setMemberPoses = (draft: Story, id: string, sprites: MemberSprites): Story => ({ ...draft, roster: draft.roster.map((member) => member.id === id ? { ...member, sprites } : member) });
export const setPoseCard = (draft: Story, id: string, card: CardBinding): Story => ({ ...draft, roster: draft.roster.map((member) => member.id === id ? { ...member, card } : member) });
export const setStagePose = (draft: Story, checkpoint: string, member: string, pose: string): Story => ({ ...draft,
checkpoints: draft.checkpoints.map((cp) => cp.id === checkpoint ? { ...cp, effects: { ...cp.effects, stage: { ...cp.effects?.stage,
    [member]: { ...(cp.effects?.stage?.cast?.[member] ?? {}), ...(typeof cp.effects?.stage?.[member] === "object" ? cp.effects.stage[member] as StageMember : {}), pose } } } } : cp),
});
