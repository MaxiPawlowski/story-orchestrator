import { DEFAULT_AGENCY, OBJECTIVE_KINDS, agencyClauses, renderAgencyPolicy, type AgencyPolicy, type Checkpoint } from "@engine/index";
import { agencyNoteText } from "@judge/warden";
import { composeGuidanceBlock } from "./guidance";
import { getSteeringHint } from "./steering";

const policies: AgencyPolicy[] = OBJECTIVE_KINDS.flatMap((objective_kind) => [true, false].flatMap((protect_player_choice) => [true, false].flatMap((never_narrate_player_action) =>
  [true, false].map((player_attempts_only) => ({ ...DEFAULT_AGENCY, objective_kind, protect_player_choice, never_narrate_player_action, player_attempts_only })))));

const checkpoint = { id: "hall", name: "The Hall", objective: "Choose a posting.", guidance: "Tobias pitches the Wendhope posting." } as unknown as Checkpoint;

const drifts: Array<[number, number]> = [[0.1, 0.9], [0.4, 0.6], [0.5, 0.5], [0.7, 0.3], [0.9, 0.2]];

const injectedBlocks = (): string[] => policies.flatMap((policy) => [
  ...drifts.map(([smoothed, expected]) => getSteeringHint(smoothed, expected, undefined, policy)?.text ?? ""),
  composeGuidanceBlock(checkpoint, policy, true),
  composeGuidanceBlock(checkpoint, policy, true, { name: "Belle", text: "Grumble about the pay." }),
  renderAgencyPolicy(policy),
  ...agencyClauses(policy),
]).concat(agencyNoteText(""), agencyNoteText("Max"));

describe("T1-2: no block we inject calls the player character 'the player' (v2.6 plan 14)", () => {
  it("never writes the literal 'the player', which replies echoed in 10 of 16 turns", () => {
    expect(injectedBlocks().filter((text) => /\bthe player\b/i.test(text))).toEqual([]);
  });

  it("names the player character through the {{user}} macro ST resolves in every extension prompt", () => {
    const blocks = injectedBlocks();
    expect(blocks.some((text) => text.includes("{{user}}"))).toBe(true);
    expect(agencyNoteText("Max")).not.toContain("{{user}}");
    expect(agencyNoteText("Max")).toContain("Max");
  });
});
