import { readCheckpointPatch, readEffects } from "./parseFields";

describe("v3.0 19 stage 2: the wizard parser reads pacing and reply scope fields", () => {
  it("keeps a valid pacing talk_control and npc reply scope", () => {
    const issues: string[] = [];
    const patch = readCheckpointPatch({ talk_control: { profile: "decision", budget: { voices: 2 }, address_player: { after_player_turns: 2 } } }, "cp", issues);
    expect(issues).toEqual([]);
    expect(patch.talk_control).toEqual({ profile: "decision", budget: { voices: 2 }, address_player: { after_player_turns: 2 } });
    const effects = readEffects({ npc_replies: [{ trigger: "afterSpeak", member: "Mara", kind: "llm", id: "mara-react", once_per: "player_turn", cooldown_player_turns: 1 }] }, "e", issues);
    expect(issues).toEqual([]);
    expect(effects.npc_replies?.[0]).toMatchObject({ id: "mara-react", once_per: "player_turn", cooldown_player_turns: 1 });
  });

  it("reports a wrong pacing value instead of passing it through", () => {
    const issues: string[] = [];
    const patch = readCheckpointPatch({ talk_control: { profile: "chatty", budget: { voices: 20 } } }, "cp", issues);
    expect(patch.talk_control).toBeUndefined();
    expect(issues.join("\n")).toContain("cp.talk_control.profile: profile must be one of opening, conversation, decision, action, aftermath");
    expect(issues.join("\n")).toContain("cp.talk_control.budget.voices");
    readEffects({ npc_replies: [{ trigger: "onEnter", member: "Mara", kind: "scripted", text: "a", once_per: "visit" }] }, "e", issues);
    expect(issues.join("\n")).toContain("e.npc_replies.0.once_per");
  });
});
