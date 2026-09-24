import { agencyClauses, agencyFor, agencyForCheckpoint, DEFAULT_AGENCY, OBJECTIVE_KINDS, PLAYER_ATTEMPTS_CLAUSE, renderAgencyPolicy } from "./agency";
import { parseStoryV2 } from "./validate";

const story = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  format: 2,
  id: "agency-probe",
  version: 1,
  title: "Agency Probe",
  description: "A story with one quality and two anchors.",
  qualities: [{ key: "q", type: "bool", source: "code", rubric: "Whether the probe fired." }],
  roster: [],
  checkpoints: [
    { id: "start", name: "Start", objective: "Begin.", type: "anchor", start: true },
    { id: "next", name: "Next", objective: "Go on.", type: "anchor", ...extra },
  ],
  transitions: [{ from: "start", to: "next", priority: 1, gate: { q: "q", op: "==", v: true } }],
});

const parsed = (extra: Record<string, unknown> = {}) => {
  const result = parseStoryV2(story(extra));
  if (Array.isArray(result)) throw new Error(result.map((error) => `${error.path}: ${error.message}`).join("; "));
  return result;
};

describe("agency policy (v2.3 plan 07, C4)", () => {
  it("is the defaults when a checkpoint declares nothing, not 'absent = today'", () => {
    expect(agencyFor(undefined)).toEqual(DEFAULT_AGENCY);
    expect(DEFAULT_AGENCY).toEqual({ protect_player_choice: true, never_narrate_player_action: true, objective_kind: "world_pressure", player_attempts_only: false });
  });

  it("merges a partial declaration over the defaults instead of replacing them", () => {
    expect(agencyFor({ id: "next", name: "Next", objective: "", type: "anchor", agency: { objective_kind: "player_action" } }))
      .toEqual({ ...DEFAULT_AGENCY, objective_kind: "player_action" });
  });

  it("reads the policy of the active checkpoint through the story, defaults for an unknown id", () => {
    const built = parsed({ agency: { objective_kind: "player_action", alternate: "start" } });
    expect(agencyForCheckpoint(built, "next")).toEqual({ ...DEFAULT_AGENCY, objective_kind: "player_action", alternate: "start" });
    expect(agencyForCheckpoint(built, "start")).toEqual(DEFAULT_AGENCY);
    expect(agencyForCheckpoint(built, null)).toEqual(DEFAULT_AGENCY);
  });

  it("normalizes the authored aliases and refuses a kind it does not know", () => {
    expect(parsed({ agency: { fallback: "start" } }).checkpointById.next.agency).toEqual({ alternate: "start" });
    const bad = parseStoryV2(story({ agency: { objective_kind: "world" } }));
    expect(Array.isArray(bad) && bad.some((error) => error.path.endsWith("agency.objective_kind"))).toBe(true);
    const wrongType = parseStoryV2(story({ agency: { protect_player_choice: "yes" } }));
    expect(Array.isArray(wrongType) && wrongType.some((error) => error.path.endsWith("agency.protect_player_choice"))).toBe(true);
  });

  it("states the objective kind as a clause and drops each clause the author turned off", () => {
    const clauses = agencyClauses(agencyFor(undefined));
    expect(clauses.some((clause) => clause.includes("world pressure"))).toBe(true);
    expect(clauses.some((clause) => clause.includes("accepted what they refused") || clause.includes("accepting what they refused"))).toBe(true);
    expect(clauses.some((clause) => clause.includes("are theirs to write"))).toBe(true);

    const minimal = agencyClauses({ protect_player_choice: false, never_narrate_player_action: false, objective_kind: "player_action" });
    expect(minimal).toHaveLength(1);
    expect(minimal[0]).toContain("needs the player's own act");
    expect(renderAgencyPolicy(agencyFor(undefined)).split("\n")).toHaveLength(clauses.length);
  });

  it("adds the opt-in attempts clause only when the checkpoint asks for it (v2.4 plan 04, D6/X13)", () => {
    expect(DEFAULT_AGENCY.player_attempts_only).toBe(false);
    expect(agencyClauses(agencyFor(undefined))).not.toContain(PLAYER_ATTEMPTS_CLAUSE);
    const built = parsed({ agency: { player_attempts_only: true } });
    expect(built.checkpointById.next.agency).toEqual({ player_attempts_only: true });
    expect(agencyClauses(agencyForCheckpoint(built, "next"))).toContain(PLAYER_ATTEMPTS_CLAUSE);
    expect(agencyClauses(agencyForCheckpoint(built, "start"))).not.toContain(PLAYER_ATTEMPTS_CLAUSE);
    expect(PLAYER_ATTEMPTS_CLAUSE).toBe("The player's message states an attempt; decide its outcome from the world — it may fail.");
    const wrongType = parseStoryV2(story({ agency: { player_attempts_only: "yes" } }));
    expect(Array.isArray(wrongType) && wrongType.some((error) => error.path.endsWith("agency.player_attempts_only"))).toBe(true);
  });

  it("offers exactly the two objective kinds", () => {
    expect([...OBJECTIVE_KINDS]).toEqual(["world_pressure", "player_action"]);
  });
});
