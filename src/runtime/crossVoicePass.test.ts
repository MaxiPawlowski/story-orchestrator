import { parseStoryOrThrow } from "@engine/index";
import { CROSS_VOICE_KEPT, CROSS_VOICE_TRIMMED, crossVoicePass, voiceParties, type CrossVoiceDeps, type CrossVoiceReply } from "./crossVoicePass";
import { REPLY_REPAIR_ORDER } from "./replyRepairs";

const story = parseStoryOrThrow({
  id: "dock", title: "Dock", description: "",
  qualities: [{ key: "done", type: "bool", source: "extractor", rubric: "Done?" }],
  checkpoints: [{ id: "a", name: "A", objective: "", type: "anchor", start: true }],
  transitions: [],
  roster: [{ id: "mara", name: "Mara" }, { id: "bram", name: "Bram Holt", aliases: ["the Smith"] }],
});

const BODY = "*Mara checks the rope twice and ties it off at the post, then looks back at the dark water.* \"We leave at dawn.\"";

const harness = (reply: CrossVoiceReply | null, overrides: Partial<CrossVoiceDeps> = {}) => {
  const writes: Array<{ messageId: number; mes: string; reasoning: string }> = [];
  const journal: Array<[string, string]> = [];
  const pass = crossVoicePass({
    enabled: () => true, storyChat: () => true, story: () => story, player: () => "Max", read: () => reply,
    write: (messageId, text) => { writes.push({ messageId, ...text }); return { ok: true }; },
    journal: (summary, note) => { journal.push([summary, note]); },
    ...overrides,
  });
  return { pass, writes, journal };
};

describe("cross-voice trim pass", () => {
  it("runs right after the thought-leak repair", () => {
    expect(REPLY_REPAIR_ORDER.indexOf("cross-voice")).toBe(REPLY_REPAIR_ORDER.indexOf("thought-leak") + 1);
  });

  it("cuts another member's header line and never touches the thinking", () => {
    const { pass, writes, journal } = harness({ mes: `${BODY}\n**Bram:** "Agreed."`, reasoning: "Plan: answer as Mara.", isUser: false, name: "Mara" });
    pass(7);
    expect(writes).toEqual([{ messageId: 7, mes: BODY, reasoning: "Plan: answer as Mara." }]);
    expect(journal[0][0]).toBe(CROSS_VOICE_TRIMMED);
  });

  it("cuts a line written as the player", () => {
    const { pass, writes, journal } = harness({ mes: `${BODY}\nMax: "Then go."`, reasoning: "", isUser: false, name: "Mara" });
    pass(3);
    expect(writes[0].mes).toBe(BODY);
    expect(journal[0][1]).toContain("as you");
  });

  it("keeps a reply the cut would empty, and journals it", () => {
    const { pass, writes, journal } = harness({ mes: "Bram: \"The whole reply is his.\"", reasoning: "", isUser: false, name: "Mara" });
    pass(3);
    expect(writes).toEqual([]);
    expect(journal).toEqual([[CROSS_VOICE_KEPT, expect.stringContaining("message 3")]]);
  });

  it("does nothing when off, outside the story chat, for player messages or prose attribution", () => {
    const reply = { mes: `${BODY}\nBram: "Agreed."`, reasoning: "", isUser: false, name: "Mara" };
    for (const overrides of [{ enabled: () => false }, { storyChat: () => false }]) {
      const { pass, writes } = harness(reply, overrides);
      pass(1);
      expect(writes).toEqual([]);
    }
    const user = harness({ ...reply, isUser: true });
    user.pass(1);
    expect(user.writes).toEqual([]);
    const prose = harness({ ...reply, mes: `${BODY} "Fine," Bram said.` });
    prose.pass(1);
    expect(prose.writes).toEqual([]);
  });

  it("resolves the speaker's own names and aliases from the roster", () => {
    const { self, others } = voiceParties(story, "Bram Holt", "Max");
    expect(self).toEqual(expect.arrayContaining(["Bram Holt", "Bram", "the Smith"]));
    expect(others.map((party) => party.id)).toEqual(["mara", "player"]);
  });
});
