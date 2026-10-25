import { agencyClauses, agencyFor, DEFAULT_AGENCY, PLAYER_ACTION_CLAUSE, PLAYER_MIND_CLAUSE, renderAgencyPolicy } from "@engine/agency";
import { getSteeringHint } from "@pacing/steering";
import { agencyNoteText } from "@judge/warden";
import { narratesPlayer } from "@generation/living/guard";
import { narratesPlayer as cueNarratesPlayer } from "../studio/cueDiagnostics";
import { renderInnerBeatPrompt } from "@memory/innerBeat";

describe("G07: the player owns their character's feelings and conclusions (owner 2026-10-25)", () => {
  it("the default policy carries the mind clause beside the action clause, and turning the policy off drops both", () => {
    const clauses = agencyClauses(agencyFor(undefined));
    expect(clauses).toContain(PLAYER_ACTION_CLAUSE);
    expect(clauses).toContain(PLAYER_MIND_CLAUSE);
    expect(PLAYER_MIND_CLAUSE).toMatch(/feels.*believes.*concludes/);
    expect(PLAYER_MIND_CLAUSE).toContain("characters may guess at it");
    const off = agencyClauses({ ...DEFAULT_AGENCY, never_narrate_player_action: false });
    expect(off).not.toContain(PLAYER_MIND_CLAUSE);
    expect(off).not.toContain(PLAYER_ACTION_CLAUSE);
  });

  it("every steering hint carries it while the policy is on", () => {
    for (const [smoothed, target] of [[0.1, 0.9], [0.9, 0.1], [0.5, 0.5]] as const) {
      const text = getSteeringHint(smoothed, target, undefined, DEFAULT_AGENCY)?.text ?? "";
      if (text) expect(text).toContain(PLAYER_MIND_CLAUSE);
    }
    expect(getSteeringHint(0.1, 0.9, undefined, { ...DEFAULT_AGENCY, never_narrate_player_action: false })?.text).not.toContain(PLAYER_MIND_CLAUSE);
  });

  it("the inner voice gets it through the agency policy and keeps its own thinking", () => {
    const prompt = renderInnerBeatPrompt({
      storyTitle: "S", memberName: "Kael", checkpointName: "C", objective: "O", agency: renderAgencyPolicy(DEFAULT_AGENCY),
      steering: "", privateRows: "- What you want: x", window: [{ speaker: "Kael", text: "hi" }],
    });
    expect(prompt).toContain(PLAYER_MIND_CLAUSE);
    expect(prompt).toContain("Kael");
  });

  it("the warden's agency note names it with the persona", () => {
    expect(agencyNoteText("Max")).toContain("Never decide how Max feels, what Max believes or what Max concludes");
  });

  it("the director and cue guards flag text that settles the player's conclusion", () => {
    expect(narratesPlayer("The player concludes the keeper lied.")).toBe(true);
    expect(narratesPlayer("You believe the guide at last.")).toBe(true);
    expect(narratesPlayer("The keeper insists the guide lied.")).toBe(false);
    expect(cueNarratesPlayer("the player realizes the map is fake")).toBe(true);
    expect(cueNarratesPlayer("the player believes her")).toBe(true);
    expect(cueNarratesPlayer("Kael suspects the map is fake")).toBe(false);
  });
});
