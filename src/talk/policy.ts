import type { StoryTalkDefaults, TalkBudget, TalkControl, TalkProfileName } from "@engine/talkSchema";

export interface TalkAddressPolicy {
  afterPlayerTurns: number;
  by: "relevant_member" | string[];
  cooldown: number;
}

export interface TalkPolicy {
  profile: TalkProfileName | null;
  budget: { voices: number; attempts: number } | null;
  leadPreferred: boolean;
  leadWords: number | null;
  leadMaxConsecutive: number | null;
  spotlight: { quietAfter: number; members: string[] | null } | null;
  addressPlayer: TalkAddressPolicy | null;
  reaction: { members: string[] | null } | null;
}

interface ProfileShape {
  voices: number;
  leadPreferred: boolean;
  leadWords: number;
  leadMax: number;
  spotlight: number | null;
  address: { after: number; cooldown: number } | null;
  reaction: boolean;
}

export const TALK_PROFILE_SHAPES: Record<TalkProfileName, ProfileShape> = {
  opening: { voices: 2, leadPreferred: true, leadWords: 180, leadMax: 2, spotlight: null, address: { after: 1, cooldown: 2 }, reaction: false },
  conversation: { voices: 3, leadPreferred: false, leadWords: 120, leadMax: 1, spotlight: 2, address: { after: 3, cooldown: 3 }, reaction: true },
  decision: { voices: 2, leadPreferred: true, leadWords: 140, leadMax: 2, spotlight: null, address: null, reaction: false },
  action: { voices: 3, leadPreferred: true, leadWords: 160, leadMax: 3, spotlight: 3, address: null, reaction: true },
  aftermath: { voices: 2, leadPreferred: false, leadWords: 100, leadMax: 2, spotlight: 1, address: { after: 2, cooldown: 4 }, reaction: true },
};

export const SPOTLIGHT_QUIET_DEFAULT = 2;

export interface TalkPolicyInput {
  control: TalkControl | null;
  defaults?: StoryTalkDefaults;
  chainMax: number | null;
  activeReplies: boolean;
}

const budgetOf = (voices: number, budget: TalkBudget | undefined) => {
  const resolved = budget?.voices ?? voices;
  return { voices: resolved, attempts: Math.max(resolved, budget?.attempts ?? resolved + 1) };
};

const fromProfile = (name: TalkProfileName): TalkPolicy => {
  const shape = TALK_PROFILE_SHAPES[name];
  return {
    profile: name,
    budget: budgetOf(shape.voices, undefined),
    leadPreferred: shape.leadPreferred,
    leadWords: shape.leadWords,
    leadMaxConsecutive: shape.leadMax,
    spotlight: shape.spotlight === null ? null : { quietAfter: shape.spotlight, members: null },
    addressPlayer: shape.address ? { afterPlayerTurns: shape.address.after, by: "relevant_member", cooldown: shape.address.cooldown } : null,
    reaction: shape.reaction ? { members: null } : null,
  };
};

const withBudget = (policy: TalkPolicy, budget: TalkBudget | undefined): TalkPolicy =>
  (budget && (budget.voices !== undefined || budget.attempts !== undefined)
    ? { ...policy, budget: budgetOf(policy.budget?.voices ?? 1, { voices: budget.voices ?? policy.budget?.voices, attempts: budget.attempts }) }
    : policy);

const withControl = (policy: TalkPolicy, control: TalkControl): TalkPolicy => {
  const next = { ...withBudget(policy, control.budget) };
  if (control.lead_words !== undefined) next.leadWords = control.lead_words;
  if (control.lead_max_consecutive !== undefined) next.leadMaxConsecutive = control.lead_max_consecutive;
  if (control.spotlight !== undefined) {
    next.spotlight = control.spotlight === false ? null
      : { quietAfter: control.spotlight.quiet_after ?? next.spotlight?.quietAfter ?? SPOTLIGHT_QUIET_DEFAULT, members: control.spotlight.members ?? null };
  }
  if (control.address_player !== undefined) {
    const address = control.address_player;
    next.addressPlayer = address === false ? null : {
      afterPlayerTurns: address.after_player_turns,
      by: address.by ?? "relevant_member",
      cooldown: address.cooldown_player_turns ?? Math.max(1, address.after_player_turns),
    };
  }
  if (control.reaction !== undefined) next.reaction = control.reaction === false ? null : { members: control.reaction.members ?? null };
  return next;
};

export const resolveTalkPolicy = ({ control, defaults, chainMax, activeReplies }: TalkPolicyInput): TalkPolicy => {
  const baseVoices = (chainMax ?? 1) + (activeReplies ? 1 : 0);
  let policy: TalkPolicy = {
    profile: null, budget: control || defaults ? budgetOf(baseVoices, undefined) : null, leadPreferred: true, leadWords: null, leadMaxConsecutive: null, spotlight: null, addressPlayer: null,
    reaction: null,
  };
  if (defaults?.profile) policy = fromProfile(defaults.profile);
  policy = withBudget(policy, defaults?.budget);
  if (!control) return policy;
  if (control.profile) policy = fromProfile(control.profile);
  return withControl(policy, control);
};

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export const describeTalkPolicy = (policy: TalkPolicy): string => [
  policy.budget ? `${plural(policy.budget.voices, "voice")} and ${plural(policy.budget.attempts, "generation")} at most per player message` : "no speech budget",
  policy.leadPreferred ? "the lead answers first" : "the lead does not get the first word",
  policy.leadWords ? `lead replies near ${policy.leadWords} words` : "",
  policy.leadMaxConsecutive ? `the lead speaks at most ${plural(policy.leadMaxConsecutive, "time")} in a row` : "",
  policy.spotlight ? `a member quiet for ${plural(policy.spotlight.quietAfter, "player turn")} takes the next voice` : "",
  policy.addressPlayer ? `a member turns to the player after ${plural(policy.addressPlayer.afterPlayerTurns, "player turn")}` : "",
  policy.reaction ? "one reaction after something consequential" : "",
].filter(Boolean).join("; ");
