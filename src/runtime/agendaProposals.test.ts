import { readFileSync } from "fs";
import { join } from "path";
import { parseStoryV2OrThrow, type EngineState } from "@engine/index";
import { privateLifeLines } from "@engine/life/lines";
import type { ModelCall } from "@extraction/modelRoute";
import { createAgendaProposals, landAcceptedProposals, landedMeanwhile, rollbackAgendaProposals, sanitizeAgendaProposals, type AgendaProposalsState } from "./agendaProposals";
import { AgendaProposalCoordinator } from "./coordinators/agendaProposalCoordinator";
import { buildMeanwhilePrompt, parseMeanwhile } from "./meanwhilePrompt";
import { mintToken, tokenMatches, type RunContext } from "./runToken";

const STORY = parseStoryV2OrThrow(JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/character-life.story.json"), "utf8")));
const STATE = { boundary: 4, lastMessageId: 9, blackboard: { values: {}, versions: {}, latched: {} } } as unknown as EngineState;

const harness = (reply: string) => {
  const context: RunContext = { chatId: "c1", storyId: "character-life-lab", storyHash: "h1", sessionEpoch: 1, windowRevision: 0 };
  let proposals: AgendaProposalsState | undefined;
  const journal: string[] = [];
  const prompts: string[] = [];
  const model = (async (prompt: string) => { prompts.push(prompt); context.sessionEpoch += moveDuringCall ? 1 : 0; return { text: reply, finish: "stop" }; }) as unknown as ModelCall;
  let moveDuringCall = false;
  const coordinator = new AgendaProposalCoordinator({
    getStory: () => STORY, getState: () => STATE, getProposals: () => proposals, setProposals: (next) => { proposals = next; },
    window: () => [{ speaker: "Arin", text: "The harbour is quiet tonight." }], model: () => model,
    ownership: { mint: (window) => mintToken(context, window ?? null), check: (token) => tokenMatches(context, token) },
    journal: (summary) => { journal.push(summary); }, persist: async () => {}, notify: () => {},
  });
  return { coordinator, proposals: () => proposals, journal, prompts, moveDuring: () => { moveDuringCall = true; } };
};

describe("v2.7 plan 37 L3 (C2): meanwhile proposals are text only, reviewed by the author", () => {
  it("parses one in-agenda line per member and refuses the rest with a reason", () => {
    const parsed = parseMeanwhile([
      "MEANWHILE: arin | debt | Arin counted the coins twice.",
      "MEANWHILE: arin | debt | A second one.",
      "MEANWHILE: ghost | debt | Nobody.",
      "MEANWHILE: narrator | debt | No agenda here.",
      "Arin went fishing.",
      "NONE",
    ].join("\n"), STORY);
    expect(parsed.proposals).toEqual([{ memberId: "arin", agendaId: "debt", text: "Arin counted the coins twice." }]);
    expect(parsed.refused.map((entry) => entry.reason)).toEqual(["a second event for one member", "no such member", "no such member", "not a MEANWHILE line"]);
  });

  it("refuses a line that narrates the player", () => {
    expect(parseMeanwhile("MEANWHILE: arin | debt | You hand Arin the coins.", STORY).refused[0].reason).toBe("narrates the player");
  });

  it("asks with the agendas and the recent chat, and no private knowledge", () => {
    const prompt = buildMeanwhilePrompt(STORY, {}, [{ speaker: "Arin", text: "Hello." }]);
    expect(prompt).toContain("arin | debt | goal: Repay the smuggler before the festival");
    expect(prompt).toContain("Arin: Hello.");
    expect(prompt).not.toContain("concealing");
  });

  it("stores a proposal as proposed, never accepted on its own, and only an accepted one that landed at a boundary reaches the holder's block", async () => {
    const run = harness("MEANWHILE: arin | debt | Arin counted the coins twice.");
    const outcome = await run.coordinator.propose();
    expect(outcome.ok).toBe(true);
    const [proposal] = run.proposals()!.proposals;
    expect(proposal).toMatchObject({ status: "proposed", public: false, sourceWindow: { from: 2, to: 9 }, boundary: 4 });
    expect(landedMeanwhile(run.proposals(), "arin")).toEqual([]);
    expect(await run.coordinator.decide(proposal.id, "accepted")).toBe(true);
    expect(landedMeanwhile(run.proposals(), "arin")).toEqual([]);
    const landed = landAcceptedProposals(run.proposals()!, { boundary: 5, messageId: 11 });
    expect(landed.proposals[0]).toMatchObject({ status: "applied", appliedAt: { boundary: 5, messageId: 11 } });
    const lines = privateLifeLines(STORY, {}, "arin", landedMeanwhile(landed, "arin"));
    expect(lines).toContain("Meanwhile, off stage, you: Arin counted the coins twice.");
    expect(privateLifeLines(STORY, {}, "narrator", landedMeanwhile(landed, "narrator"))).not.toContain("coins");
  });

  it("journals a rejection with its reason", async () => {
    const run = harness("MEANWHILE: arin | debt | Arin counted the coins twice.");
    await run.coordinator.propose();
    await run.coordinator.decide(run.proposals()!.proposals[0].id, "rejected", "too early");
    expect(run.journal).toContain("Meanwhile event rejected for arin");
    expect(run.proposals()!.proposals[0]).toMatchObject({ status: "rejected", decision: "too early" });
  });

  it("writes nothing when the chat moves during the call", async () => {
    const run = harness("MEANWHILE: arin | debt | Arin counted the coins twice.");
    run.moveDuring();
    expect(await run.coordinator.propose()).toMatchObject({ ok: false });
    expect(run.proposals()).toBeUndefined();
  });

  it("its gate fixture is 20 cases with the floors frozen, and every case builds a prompt", () => {
    const fixture = JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/meanwhile-proposals.cases.json"), "utf8")) as {
      floors: Record<string, number>; cases: Array<{ member: string; agenda: string; done: number; window: Array<{ speaker: string; text: string }>; spoiler: boolean }>;
    };
    expect(fixture.floors).toEqual({ inGoalRate: 0.85, narratedPlayerActions: 0, unreachedReferencesInSpoilerSubset: 0, runs: 2 });
    expect(fixture.cases).toHaveLength(20);
    expect(fixture.cases.filter((entry) => entry.spoiler).length).toBeGreaterThanOrEqual(4);
    for (const entry of fixture.cases) {
      const prompt = buildMeanwhilePrompt(STORY, { [`agenda_${entry.member}_${entry.agenda}_step`]: entry.done }, entry.window);
      expect(prompt).toContain(`${entry.member} | ${entry.agenda} | goal:`);
    }
  });

  it("rolls back with the messages it was read from, and survives a reopen", () => {
    const state = { proposals: [{ id: "p", memberId: "arin", agendaId: "debt", text: "t", public: false as const, reason: "r", sourceWindow: { from: 2, to: 9 }, boundary: 4, status: "accepted" as const }], passes: [] };
    expect(rollbackAgendaProposals(state, 9).proposals).toEqual([]);
    expect(rollbackAgendaProposals(state, 10)).toBe(state);
    expect(sanitizeAgendaProposals(JSON.parse(JSON.stringify(state)))).toEqual(state);
    expect(sanitizeAgendaProposals({ proposals: [{ id: "broken" }] })).toEqual(createAgendaProposals());
  });
});
