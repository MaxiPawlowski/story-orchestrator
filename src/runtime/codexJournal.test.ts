import { StoryEngine } from "@engine/index";
import { buildSessionJournal } from "./journal";
import { labStory } from "../../test/support/codexLab";

describe("plan 52: the session journal derives what the player learned from the boundary log", () => {
  test("a boundary that latched codex keys carries one learned event naming them; a quiet boundary carries none", () => {
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(labStory());
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "searched_dock", v: true, source: "extractor" }] });
    engine.commitBoundary({ lastMessageId: 2, chatLength: 3 });
    engine.commitBoundary({ lastMessageId: 4, chatLength: 5 });
    const learned = buildSessionJournal({ records: [], boundaryLog: engine.stateLog, audits: [], reconciliationEvents: [], payloadCaptures: [], talkDecisions: [] })
      .filter((event) => event.kind === "learned");
    expect(learned).toEqual([expect.objectContaining({ boundary: 1, detail: { keys: ["codex_p_ferryman_boat", "codex_l_landing_post", "codex_l_boathouse_door"] } })]);
  });
});
