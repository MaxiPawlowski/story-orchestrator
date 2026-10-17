import type { TalkControl } from "@engine/index";
import type { SourceRevision } from "@memory/audience";
import { TalkController, type TalkControlHost } from "./talkControl";
import type { TalkDecisionAudit } from "./types";
import { testOwnership } from "../../test/findings/testOwnership";

const harness = () => {
  const director: string[] = [];
  const decisions: TalkDecisionAudit[] = [];
  let revision: SourceRevision = { swipeId: 0, hash: "reply-a" };
  const host: TalkControlHost = {
    ownership: testOwnership(),
    isGroupChat: () => true,
    getChatId: () => "chat-1",
    getActiveTalkControl: (): TalkControl | null => ({ director: true, allow_silence: true }),
    getRoster: () => [{ id: "guard", name: "Mara" }, { id: "sage", name: "Finn" }],
    getEnabledRosterIds: () => ["guard", "sage"],
    getLastSpeakerRosterId: () => null,
    getDraftedRosterId: () => "sage",
    getLastMessageId: () => 5,
    getLastMessageRevision: () => revision,
    getWindow: () => [{ speaker: "User", text: "hello there" }],
    getCheckpointInfo: () => ({ id: "cp1", name: "Gate", objective: "Open it", storyTitle: "Ruins" }),
    callDirector: async (prompt) => { director.push(prompt); return "SPEAKER: Mara"; },
    triggerMember: async () => undefined,
    recordDecision: (audit) => { decisions.push(audit); },
  };
  const controller = new TalkController(host);
  const decide = () => controller.intercept(() => undefined, "normal");
  return { director, decisions, decide, setRevision: (next: SourceRevision) => { revision = next; } };
};

describe("plan 69 K13: a talk decision is bound to the revision of the message it was made after", () => {
  it("control: the same message at the same revision reuses the decision", async () => {
    const run = harness();
    await run.decide();
    await run.decide();
    expect(run.director).toHaveLength(1);
  });

  it("an in-place swipe of the last message makes the cached decision invalid", async () => {
    const run = harness();
    await run.decide();
    run.setRevision({ swipeId: 1, hash: "reply-b" });
    await run.decide();
    expect(run.director).toHaveLength(2);
    expect(run.decisions.at(-1)?.revision).toEqual({ swipeId: 1, hash: "reply-b" });
  });

  it("an in-place edit of the last message makes the cached decision invalid", async () => {
    const run = harness();
    await run.decide();
    run.setRevision({ swipeId: 0, hash: "reply-a-edited" });
    await run.decide();
    expect(run.director).toHaveLength(2);
  });
});
