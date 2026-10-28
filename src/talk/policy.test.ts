import { TALK_PROFILE_SHAPES, describeTalkPolicy, resolveTalkPolicy } from "./policy";

describe("v3.0 19 stage 2: talk pacing policy", () => {
  it("default: a talk_control beat keeps today's shape, the chain max plus one for an afterSpeak or sceneBreak line", () => {
    expect(resolveTalkPolicy({ control: {}, chainMax: 3, activeReplies: false })).toEqual({
      profile: null, budget: { voices: 3, attempts: 4 }, leadPreferred: true, leadWords: null, leadMaxConsecutive: null, spotlight: null, addressPlayer: null, reaction: null,
    });
    expect(resolveTalkPolicy({ control: {}, chainMax: 2, activeReplies: true }).budget).toEqual({ voices: 3, attempts: 4 });
    expect(resolveTalkPolicy({ control: { chain: false }, chainMax: null, activeReplies: false }).budget).toEqual({ voices: 1, attempts: 2 });
  });

  it("a beat without talk_control and a story without defaults has no budget", () => {
    expect(resolveTalkPolicy({ control: null, chainMax: null, activeReplies: true }).budget).toBeNull();
    expect(resolveTalkPolicy({ control: null, defaults: { budget: { voices: 2 } }, chainMax: null, activeReplies: true }).budget).toEqual({ voices: 2, attempts: 3 });
  });

  it("each profile expands to explicit policy", () => {
    for (const [name, shape] of Object.entries(TALK_PROFILE_SHAPES)) {
      const policy = resolveTalkPolicy({ control: { profile: name as keyof typeof TALK_PROFILE_SHAPES }, chainMax: 8, activeReplies: true });
      expect(policy.budget?.voices).toBe(shape.voices);
      expect(policy.leadWords).toBe(shape.leadWords);
      expect(policy.leadMaxConsecutive).toBe(shape.leadMax);
      expect(policy.leadPreferred).toBe(shape.leadPreferred);
      expect(policy.spotlight?.quietAfter ?? null).toBe(shape.spotlight);
      expect(policy.addressPlayer?.afterPlayerTurns ?? null).toBe(shape.address?.after ?? null);
      expect(policy.reaction !== null).toBe(shape.reaction);
    }
  });

  it("checkpoint fields win over the checkpoint profile, which wins over the story default", () => {
    const policy = resolveTalkPolicy({
      control: {
        profile: "conversation", budget: { voices: 2 }, lead_words: 90, lead_max_consecutive: 3, spotlight: false, address_player: { after_player_turns: 4 }, reaction: { members: ["Mara"] },
      },
      defaults: { profile: "decision", budget: { voices: 1 } }, chainMax: 3, activeReplies: false,
    });
    expect(policy).toEqual({
      profile: "conversation", budget: { voices: 2, attempts: 3 }, leadPreferred: false, leadWords: 90, leadMaxConsecutive: 3, spotlight: null,
      addressPlayer: { afterPlayerTurns: 4, by: "relevant_member", cooldown: 4 }, reaction: { members: ["Mara"] },
    });
    expect(resolveTalkPolicy({ control: {}, defaults: { profile: "decision" }, chainMax: 3, activeReplies: false }).budget?.voices).toBe(2);
  });

  it("v3.0 19 stage 3: profiles cap the lead's run (conversation 1, opening and aftermath 2); no profile, no cap", () => {
    expect(Object.fromEntries(Object.entries(TALK_PROFILE_SHAPES).map(([name, shape]) => [name, shape.leadMax])))
      .toEqual({ opening: 2, conversation: 1, decision: 2, action: 3, aftermath: 2 });
    expect(resolveTalkPolicy({ control: {}, chainMax: 3, activeReplies: false }).leadMaxConsecutive).toBeNull();
    expect(resolveTalkPolicy({ control: { lead_max_consecutive: 4 }, chainMax: 3, activeReplies: false }).leadMaxConsecutive).toBe(4);
  });

  it("describes the effective policy for the Studio", () => {
    expect(describeTalkPolicy(resolveTalkPolicy({ control: { profile: "aftermath" }, chainMax: 3, activeReplies: false })))
      .toBe("2 voices and 3 generations at most per player message; the lead does not get the first word; lead replies near 100 words; the lead speaks at most 2 times in a row; "
        + "a member quiet for 1 player turn takes the next voice; a member turns to the player after 2 player turns; one reaction after something consequential");
  });
});
