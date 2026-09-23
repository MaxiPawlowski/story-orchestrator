import type { AgencyPolicy, Checkpoint, NormalizedStoryV2, ObjectiveKind } from "./schema";

// v2.3 plan 07 (C4). The policy is the defaults, not "absent = today's phrasing": every story that
// does not declare `agency` gets these, which is a deliberate behaviour change (spec addendum
// §Agency). An author who wants escalation phrased the old way sets the booleans false.
export const DEFAULT_AGENCY: AgencyPolicy = {
  protect_player_choice: true,
  never_narrate_player_action: true,
  objective_kind: "world_pressure",
};

export const OBJECTIVE_KINDS: readonly ObjectiveKind[] = ["world_pressure", "player_action"];

export const agencyFor = (checkpoint: Checkpoint | null | undefined): AgencyPolicy => ({ ...DEFAULT_AGENCY, ...(checkpoint?.agency ?? {}) });

export const agencyForCheckpoint = (story: NormalizedStoryV2 | null | undefined, checkpointId: string | null | undefined): AgencyPolicy =>
  agencyFor(checkpointId ? story?.checkpointById[checkpointId] : null);

/** The clause every prompt and hint carries when the player's own acts are not narration's to write. */
export const PLAYER_ACTION_CLAUSE = "The player's own words and decisions are theirs to write: do not narrate the player acting, accepting, agreeing or refusing.";

/**
 * How the world may press, given which kind of objective this is. A `player_action` objective still
 * has stakes, but the move belongs to the player — so the world sets the situation up and stops.
 */
export const objectiveClause = (kind: ObjectiveKind): string =>
  kind === "player_action"
    ? "This objective needs the player's own act: present the situation and the choice, then stop — do not resolve it for them."
    : "This objective is world pressure: the world presses, answers and escalates on its own, without requiring the player to comply.";

export const agencyClauses = (policy: AgencyPolicy): string[] => [
  objectiveClause(policy.objective_kind),
  ...(policy.protect_player_choice ? ["Never narrate the player accepting what they refused, or going where they declined to go."] : []),
  ...(policy.never_narrate_player_action ? [PLAYER_ACTION_CLAUSE] : []),
];

export const renderAgencyPolicy = (policy: AgencyPolicy): string => agencyClauses(policy).map((clause) => `- ${clause}`).join("\n");
