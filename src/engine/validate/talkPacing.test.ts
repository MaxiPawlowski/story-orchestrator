import { parseStory } from "../validate";
import { readTalkPacing } from "./talkPacing";

const story = (patch: { talk_control?: unknown; npc_replies?: unknown[]; talk_defaults?: unknown }) => ({
  title: "T", description: "D", qualities: [],
  ...(patch.talk_defaults !== undefined ? { talk_defaults: patch.talk_defaults } : {}),
  checkpoints: [{
    id: "start", name: "Start", objective: "o", type: "anchor", start: true,
    ...(patch.talk_control !== undefined ? { talk_control: patch.talk_control } : {}),
    ...(patch.npc_replies ? { effects: { npc_replies: patch.npc_replies } } : {}),
  }],
  transitions: [], roster: [{ id: "mara", name: "Mara" }],
});

const errors = (json: unknown) => {
  const parsed = parseStory(json);
  return Array.isArray(parsed) ? parsed.map((error) => error.path) : [];
};

describe("v3.0 19 stage 2: talk pacing keys validate", () => {
  it("keeps every valid key", () => {
    const parsed = parseStory(story({
      talk_control: {
        profile: "conversation", budget: { voices: 2, attempts: 3 }, lead_words: 120, spotlight: { quiet_after: 2, members: ["Mara"] },
        address_player: { after_player_turns: 3, by: "relevant_member", cooldown_player_turns: 4 }, reaction: true,
      },
      talk_defaults: { profile: "decision", budget: { voices: 2 } },
      npc_replies: [{ trigger: "afterSpeak", member: "Mara", kind: "scripted", text: "Hm.", id: "mara-hm", once_per: "entry", cooldown_player_turns: 1 }],
    }));
    if (Array.isArray(parsed)) throw new Error(JSON.stringify(parsed));
    expect(parsed.checkpoints[0].talk_control).toEqual({
      profile: "conversation", budget: { voices: 2, attempts: 3 }, lead_words: 120, spotlight: { quiet_after: 2, members: ["Mara"] },
      address_player: { after_player_turns: 3, by: "relevant_member", cooldown_player_turns: 4 }, reaction: {},
    });
    expect(parsed.talk_defaults).toEqual({ profile: "decision", budget: { voices: 2 } });
    expect(parsed.checkpoints[0].effects?.npc_replies?.[0]).toMatchObject({ id: "mara-hm", once_per: "entry", cooldown_player_turns: 1 });
  });

  it("false switches spotlight, address_player and reaction off explicitly", () => {
    expect(readTalkPacing({ spotlight: false, address_player: false, reaction: false }, "p", [])).toEqual({ spotlight: false, address_player: false, reaction: false });
  });

  it("refuses wrong shapes with a path", () => {
    expect(errors(story({ talk_control: { profile: "chatty" } }))).toEqual(["checkpoints.0.talk_control.profile"]);
    expect(errors(story({ talk_control: { budget: { voices: 0 } } }))).toEqual(["checkpoints.0.talk_control.budget.voices"]);
    expect(errors(story({ talk_control: { budget: { voices: 3, attempts: 2 } } }))).toEqual(["checkpoints.0.talk_control.budget.attempts"]);
    expect(errors(story({ talk_control: { budget: { voice: 2 } } }))).toEqual(["checkpoints.0.talk_control.budget.voice"]);
    expect(errors(story({ talk_control: { lead_words: 5 } }))).toEqual(["checkpoints.0.talk_control.lead_words"]);
    expect(errors(story({ talk_control: { address_player: { by: "relevant_member" } } }))).toEqual(["checkpoints.0.talk_control.address_player.after_player_turns"]);
    expect(errors(story({ talk_defaults: { profile: "decision", spotlight: {} } }))).toEqual(["talk_defaults.spotlight"]);
    expect(errors(story({ npc_replies: [{ trigger: "onEnter", member: "Mara", kind: "scripted", text: "a", once_per: "visit" }] })))
      .toEqual(["checkpoints.0.effects.npc_replies.0.once_per"]);
  });

  it("two replies with one id in a beat are a load error, the default ids included", () => {
    expect(errors(story({ npc_replies: [
      { trigger: "onEnter", member: "Mara", kind: "scripted", text: "a", id: "same" },
      { trigger: "afterSpeak", member: "Mara", kind: "scripted", text: "b", id: "same" },
    ] }))).toEqual(["checkpoints.0.effects.npc_replies.1.id"]);
    expect(errors(story({ npc_replies: [
      { trigger: "onEnter", member: "Mara", kind: "scripted", text: "a" },
      { trigger: "onEnter", member: "Mara", kind: "scripted", text: "b", id: "onEnter:Mara:0" },
    ] }))).toEqual(["checkpoints.0.effects.npc_replies.1.id"]);
  });
});
