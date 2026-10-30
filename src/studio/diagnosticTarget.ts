import type { Story } from "@engine/index";
import type { StudioTab } from "./studioNav";

export type CheckpointSection = "basics" | "player" | "pacing" | "state" | "effects" | "cast" | "stretch" | "offers" | "agency" | "scope";

export const CHECKPOINT_SECTIONS: ReadonlyArray<{ id: CheckpointSection; label: string }> = [
  { id: "basics", label: "Basics" },
  { id: "player", label: "Player sees" },
  { id: "pacing", label: "Pacing" },
  { id: "state", label: "State" },
  { id: "effects", label: "Effects" },
  { id: "cast", label: "Cast" },
  { id: "stretch", label: "Stretch" },
  { id: "offers", label: "Offers" },
  { id: "agency", label: "Agency" },
  { id: "scope", label: "Scope" },
];

export interface DiagnosticTarget {
  tab: StudioTab;
  checkpointId?: string;
  transitionIndex?: number;
  member?: string;
  section?: CheckpointSection;
}

const CHECKPOINT_FIELD_SECTION: Record<string, CheckpointSection> = {
  player_name: "player", player_text: "player", illustrate: "player", tension_target: "pacing", target_turn_length: "pacing", convergence_threshold: "pacing",
  guidance: "pacing", state_snapshot: "state", effects: "effects",
  talk_control: "cast", motives: "cast", stretch: "stretch", offers: "offers", checks: "offers", agency: "agency",
};

const STORY_TAB: Record<string, StudioTab> = {
  qualities: "qualities", checkpoints: "checkpoints", transitions: "transitions", roster: "roster", chapters: "chapters", memory: "chapters",
  outcome: "chapters", carry_from: "chapters", arc_bridges: "rules", scene_read: "rules", house_rules: "rules", stagecraft: "world", lore_select: "world",
  display: "presentation", illustrations: "presentation", polish: "presentation", poses: "sprites", features: "features", codex: "features",
  observations: "features", quests: "game", milestones: "game", widgets: "game", rumors: "game", patterns: "game", norms: "game", echoes: "game",
  factions: "roster", player: "story", briefing: "story", requirements: "story", arc_template: "story", living: "story", scaffolding: "graph",
  talk_defaults: "story", clock: "story", calendar: "story",
};

type Located = { id?: string; key?: string };

const indexOf = <T extends Located>(list: readonly T[], ref: string | undefined): number => {
  if (ref === undefined) return -1;
  const index = Number(ref);
  if (Number.isInteger(index) && String(index) === ref) return index < list.length ? index : -1;
  return list.findIndex((entry) => entry.id === ref || entry.key === ref);
};

export const diagnosticTarget = (draft: Pick<Story, "checkpoints" | "transitions" | "roster" | "qualities">, path: string): DiagnosticTarget | null => {
  const [collection, ref, field] = path.split(".");
  if (!collection) return null;
  if (collection === "checkpoints") {
    const index = indexOf(draft.checkpoints, ref);
    if (index < 0) return { tab: "checkpoints" };
    return { tab: "checkpoints", checkpointId: draft.checkpoints[index].id, section: field ? CHECKPOINT_FIELD_SECTION[field] ?? "basics" : "basics" };
  }
  if (collection === "transitions") {
    const index = indexOf(draft.transitions as Located[], ref);
    return index < 0 ? { tab: "transitions" } : { tab: "transitions", transitionIndex: index };
  }
  if (collection === "roster") {
    const index = indexOf(draft.roster, ref);
    return index < 0 ? { tab: "roster" } : { tab: "roster", member: draft.roster[index].id };
  }
  const tab = STORY_TAB[collection];
  return tab ? { tab } : null;
};
