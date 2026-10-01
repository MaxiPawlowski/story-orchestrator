import type { Checkpoint, Quality, RosterMember, Transition } from "@engine/index";
import type { StoryDraft } from "./draft";

export type CoverageScope = "story" | "checkpoint" | "member" | "transition" | "quality";

export interface CoverageRow {
  id: string;
  scope: CoverageScope;
  label: string;
  adds: string;
  tool: string | null;
  used: number;
  total: number;
  missing: string[];
}

interface CoverageField<T> {
  id: string;
  label: string;
  tool: string | null;
  adds: string;
  uses: (entry: T) => boolean;
}

const filled = (value: unknown): boolean => {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
};

const field = <T>(id: string, label: string, tool: string | null, adds: string, uses: (entry: T) => boolean): CoverageField<T> => ({ id, label, tool, adds, uses });

export const STORY_COVERAGE: readonly CoverageField<StoryDraft>[] = [
  field("arc_template", "Dramatic shape", "setArcTemplate", "Pacing steers tension toward a curve instead of reacting turn by turn.", (draft) => filled(draft.arc_template)),
  field("arc_bridges", "Thread bridges", "setArcBridges", "A resolved thread pushes progress toward an anchor, so side plots move the main one.", (draft) => filled(draft.arc_bridges)),
  field("requirements", "Requirements", "setRequirements", "A chat checks the cast and lore exist before play and offers to fix what is missing.", (draft) => filled(draft.requirements)),
  field("stagecraft", "Curator scope", "setStagecraft", "A background curator may keep this story's own lorebook current as play goes.", (draft) => filled(draft.stagecraft?.lorebooks)),
  field(
    "scene_read", "Scene places and times", "setSceneRead", "The story can say where and when a scene is, and a place can gate a beat.",
    (draft) => filled(draft.scene_read?.locations) || filled(draft.scene_read?.times),
  ),
  field("lore_select", "Lore select", "setLoreSelect", "The judge picks the lore that matters each turn instead of every keyword firing.", (draft) => filled(draft.lore_select?.lorebooks)),
  field("house_rules", "House rules", "setHouseRules", "The continuity check holds every reply to rules the story cares about.", (draft) => filled(draft.house_rules)),
  field("chapters", "Chapters", "setChapters", "A long story is sealed act by act, so later prompts carry a record instead of the whole transcript.", (draft) => filled(draft.chapters)),
  field("player_intro", "Player introduction", null, "The player reads what the story is before the first beat.", (draft) => filled(draft.player_intro)),
  field("illustrations", "Illustrations", null, "Beats and scenes can be illustrated in the story's own style.", (draft) => filled(draft.illustrations)),
];

export const CHECKPOINT_COVERAGE: readonly CoverageField<Checkpoint>[] = [
  field("objective", "Objective", "updateCheckpoint", "The model knows what the beat is for.", (checkpoint) => filled(checkpoint.objective)),
  field("tension_target", "Tension target", "updateCheckpoint", "Pacing aims the tension of each beat.", (checkpoint) => filled(checkpoint.tension_target)),
  field("agency", "Agency policy", "updateCheckpoint", "A player who refuses the route is answered on purpose, not by accident.", (checkpoint) => filled(checkpoint.agency)),
  field("guidance", "Narrator guidance", "updateCheckpoint", "Private direction for how the beat should play.", (checkpoint) => filled(checkpoint.guidance)),
  field("talk_control", "Speaker direction", "updateCheckpoint", "Who speaks in the beat is decided by the story.", (checkpoint) => filled(checkpoint.talk_control)),
  field("effects.background", "Background", "setCheckpointEffects", "The scene switches background when the beat starts.", (checkpoint) => filled(checkpoint.effects?.background)),
  field("effects.author_note", "Author's note", "setCheckpointEffects", "A per-beat note steers every reply in it.", (checkpoint) => filled(checkpoint.effects?.author_note)),
  field("effects.world_info", "Beat lore", "setCheckpointEffects", "Lore opens and closes with the beat.", (checkpoint) => filled(checkpoint.effects?.world_info)),
  field("motives", "Motives", "setCheckpointMotive", "Each character is privately told what they want in this beat.", (checkpoint) => filled(checkpoint.motives)),
];

export const MEMBER_COVERAGE: readonly CoverageField<RosterMember>[] = [
  field("role", "Role", "updateRosterMember", "Speaker direction and the judge director can pick this member for a reason.", (member) => filled(member.role)),
  field("drive", "Drive", "setRosterDrive", "The character is privately told what they want across the story.", (member) => filled(member.drive)),
];

export const TRANSITION_COVERAGE: readonly CoverageField<Transition>[] = [
  field("extraction_hint", "Reader hint", "updateTransition", "The reader knows what to watch for to open this gate.", (transition) => filled(transition.extraction_hint)),
];

export const QUALITY_COVERAGE: readonly CoverageField<Quality>[] = [
  field("rubric", "Rubric", "updateQuality", "The reader knows how to score the quality.", (quality) => filled(quality.rubric)),
];

const rows = <T>(scope: CoverageScope, fields: readonly CoverageField<T>[], entries: T[], name: (entry: T) => string): CoverageRow[] =>
  fields.map((entry) => {
    const missing = entries.filter((item) => !entry.uses(item)).map(name);
    return { id: `${scope}.${entry.id}`, scope, label: entry.label, adds: entry.adds, tool: entry.tool, used: entries.length - missing.length, total: entries.length, missing };
  });

export const storyCoverage = (draft: StoryDraft): CoverageRow[] => [
  ...rows("story", STORY_COVERAGE, [draft], (entry) => entry.title),
  ...rows("checkpoint", CHECKPOINT_COVERAGE, draft.checkpoints, (checkpoint) => checkpoint.id),
  ...rows("member", MEMBER_COVERAGE, draft.roster, (member) => member.id),
  ...rows("transition", TRANSITION_COVERAGE, draft.transitions, (transition) => `${transition.from}->${transition.to}`),
  ...rows("quality", QUALITY_COVERAGE, draft.qualities, (quality) => quality.key),
];

export const coverageGaps = (coverage: CoverageRow[]): CoverageRow[] => coverage.filter((row) => row.total > 0 && row.used < row.total);

const where = (row: CoverageRow): string => {
  if (row.scope === "story") return "";
  const listed = row.missing.slice(0, 8).join(", ");
  return ` (${row.used}/${row.total}; missing: ${listed}${row.missing.length > 8 ? ", …" : ""})`;
};

export const renderCoverage = (coverage: CoverageRow[]): string => {
  const gaps = coverageGaps(coverage);
  if (!gaps.length) return "Every field this story model offers is in use.";
  return gaps.map((row) => `- ${row.id}${where(row)}: ${row.adds} ${row.tool ? `Tool: ${row.tool}.` : "Author only."}`).join("\n");
};
