import type { AgencyPolicy, Checkpoint, NormalizedStoryV2, ObjectiveKind, StoryV2 } from "./schema";

// The policy is the defaults, not "absent = today's phrasing": every story that
// does not declare `agency` gets these, which is a deliberate behaviour change (spec addendum
// §Agency). An author who wants escalation phrased the old way sets the booleans false.
export const DEFAULT_AGENCY: AgencyPolicy = {
  protect_player_choice: true,
  never_narrate_player_action: true,
  objective_kind: "world_pressure",
  player_attempts_only: false,
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
export const NO_CLOSING_QUESTION_CLAUSE = "End on the world and the people in it, never on a question asking the player what they do.";

export const objectiveClause = (kind: ObjectiveKind): string =>
  kind === "player_action"
    ? `This objective needs the player's own act: present the situation and the choice, then stop — do not resolve it for them. ${NO_CLOSING_QUESTION_CLAUSE}`
    : "This objective is world pressure: the world presses, answers and escalates on its own, without requiring the player to comply.";

export const PLAYER_ATTEMPTS_CLAUSE = "The player's message states an attempt; decide its outcome from the world — it may fail.";

export const agencyClauses = (policy: AgencyPolicy): string[] => [
  objectiveClause(policy.objective_kind),
  ...(policy.protect_player_choice ? ["Never narrate the player accepting what they refused, or going where they declined to go."] : []),
  ...(policy.never_narrate_player_action ? [PLAYER_ACTION_CLAUSE] : []),
  ...(policy.player_attempts_only ? [PLAYER_ATTEMPTS_CLAUSE] : []),
];

export const renderAgencyPolicy = (policy: AgencyPolicy): string => agencyClauses(policy).map((clause) => `- ${clause}`).join("\n");

export const OBJECTIVE_BLOCK_MODES = ["auto", "off"] as const;

export const OBJECTIVE_LINE_HEADER = "Objective:";

export const authorsOwnNote = (checkpoint: Checkpoint | null | undefined): boolean => {
  const note = checkpoint?.effects?.author_note;
  if (typeof note === "string") return note.trim().length > 0;
  if (note && typeof note === "object" && !Array.isArray(note)) {
    const text = (note as { text?: unknown }).text;
    return typeof text === "string" && text.trim().length > 0;
  }
  return false;
};

export const objectiveLineApplies = (story: Pick<StoryV2, "objective_block"> | null | undefined, checkpoint: Checkpoint | null | undefined): boolean =>
  Boolean(story && checkpoint) && story?.objective_block !== "off" && Boolean(checkpoint?.objective?.trim()) && !authorsOwnNote(checkpoint);

export const objectiveLine = (checkpoint: Checkpoint, policy: AgencyPolicy): string => `${OBJECTIVE_LINE_HEADER} ${checkpoint.objective.trim()} ${objectiveClause(policy.objective_kind)}`;
