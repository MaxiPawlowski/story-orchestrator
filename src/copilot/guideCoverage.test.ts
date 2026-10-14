import type { PoseEntry, StoryPoses, MemberSprites, StageMember, CardFieldBinding } from "@engine/schema";
import type { Checkpoint, CheckpointEffects, Quality, RosterMember, StoryV2, Transition } from "@engine/index";
import { GUIDE_TOPICS, PENDING_GUIDE_TOPICS, readGuide, type GuideTopicId } from "./guideTopics";

type Covered = GuideTopicId | { none: string };

const STORY: Record<keyof StoryV2, Covered> = {
  features: "feature-policies",
  format: { none: "always 2, written by the Studio" },
  id: "story-basics", title: "story-basics", description: "story-basics", player_intro: "story-basics", kind: "story-basics",
  player: "player", briefing: "briefing", reasoning: "experimental-effects", illustrations: "presentation", poses: "poses", qualities: "qualities", checkpoints: "checkpoints", transitions: "transitions",
  roster: "roster", arc_template: "arc-template", arc_bridges: "arc-bridges", requirements: "requirements", stagecraft: "stagecraft",
  scene_read: "scene-read", lore_select: "lore-select", house_rules: "house-rules",
  scaffolding: { none: "written by the road-ahead generator, never authored" },
  objective_block: "objective-agency", display: "presentation", chapters: "chapters", memory: "chapters", quests: "quests", milestones: "quests",
  widgets: "widgets", clock: "character-life", living: "living-director",
};

const CHECKPOINT: Record<keyof Checkpoint, Covered> = {
  id: "checkpoints", name: "checkpoints", objective: "checkpoints", player_name: "checkpoints", player_text: "checkpoints", type: "checkpoints",
  start: "checkpoints", state_snapshot: "checkpoints", tension_target: "tension", target_turn_length: "checkpoints", effects: "world-info",
  talk_control: "talk-control", agency: "objective-agency", guidance: "guidance", convergence_threshold: "convergence", motives: "drives-motives",
  chapter: "chapters", illustrate: "presentation", stretch: "open-stretches", checks: "checks",
};

const EFFECTS: Record<keyof CheckpointEffects, Covered> = {
  author_note: "author-note", preset: "preset", world_info: "world-info", cast_changes: "cast-changes", npc_replies: "npc-replies",
  background: "background", reasoning: "experimental-effects", scenario: "scenario", card: "living-cards", stage: "poses", illustrations: "presentation",
};

const TRANSITION: Record<keyof Transition, Covered> = {
  from: "transitions", to: "transitions", gate: "gates", priority: "transitions", effects: "convergence",
  extractor_trigger: "transitions", extraction_hint: "transitions", check: "checks", recap: "consequences", recap_when: "consequences",
};

const ROSTER: Record<keyof RosterMember, Covered> = {
  id: "roster", name: "roster", role: "roster", drive: "drives-motives", view: "roster", aliases: "roster", card: "living-cards", sprites: "poses",
  relationships: "character-life", mood: "character-life", agenda: "character-life", schedule: "character-life",
};

const QUALITY: Record<keyof Quality, Covered> = {
  key: "qualities", type: "qualities", values: "qualities", player_labels: "quality-reads", source: "qualities", latching: "latching", monotonic: "latching",
  rubric: "quality-rubric", scope_hint: "quality-reads", ledger_binding: "quality-reads", read_as: "quality-reads", criteria: "quality-reads",
  evidence_from: "quality-reads", commit_evidence: "quality-reads", roll: "chance-roll", display: "widgets", player_action: "consequences", step_rule: { none: "compiled from character-life relationships and the clock; an authored one is dropped" },
};

const POSE: Record<keyof PoseEntry, Covered> = { id: "poses", label: "poses", tags: "poses", framing: "poses", props: "poses", text: "poses", keypoints: "poses", version: "poses", when: "poses" };
const POSE_KEYS: Record<keyof PoseEntry["keypoints"], Covered> = { format: "poses", canvas: "poses", points: "poses" };
const POSE_WHEN: Record<keyof NonNullable<PoseEntry["when"]>, Covered> = { keywords: "poses" };
const POSES: Record<keyof StoryPoses, Covered> = { use: "poses", custom: "poses" };
const MEMBER_POSES: Record<keyof MemberSprites, Covered> = { pose: "poses", poses: "poses" };
const STAGE_MEMBER: Record<keyof StageMember, Covered> = { pose: "poses", set: "poses", face: "poses", hidden: "poses", framing: "poses" };
const CARD_FIELD: Record<keyof CardFieldBinding, Covered> = { quality: "living-cards", visual: "living-cards", layer: "poses", rebase: "poses", region: "poses" };
const REGION: Record<keyof NonNullable<CardFieldBinding["region"]>, Covered> = { x: "poses", y: "poses", width: "poses", height: "poses" };
const TABLES: Array<[string, Record<string, Covered>]> = [
  ["poses", POSES], ["pose", POSE], ["pose.keypoints", POSE_KEYS], ["pose.when", POSE_WHEN], ["sprites", MEMBER_POSES], ["stage.member", STAGE_MEMBER], ["card.field", CARD_FIELD], ["card.region", REGION],
  ["story", STORY], ["checkpoints[]", CHECKPOINT], ["checkpoints[].effects", EFFECTS], ["transitions[]", TRANSITION], ["roster[]", ROSTER], ["qualities[]", QUALITY],
];

const mentions = (topic: GuideTopicId, field: string): boolean => {
  const entry = GUIDE_TOPICS[topic];
  return new RegExp(`(^|[^a-z_])${field}([^a-z_]|$)`).test(`${entry.fields} ${entry.text}`);
};

describe("v2.8 09 owner 2026-10-10: every authorable field has a readGuide topic that names it", () => {
  it("maps each schema field (the maps are typed, so a new field fails typecheck:test until it is mapped)", () => {
    const unnamed = TABLES.flatMap(([table, map]) => Object.entries(map).flatMap(([field, covered]) =>
      (typeof covered === "string" && !mentions(covered, field) ? [`${table}.${field} -> ${covered}`] : [])));
    expect(unnamed).toEqual([]);
  });

  it("covers the newer authorable features by their own topic", () => {
    for (const id of ["quests", "checks", "widgets", "clues-and-maps", "html-panels", "chapters", "character-life", "living-cards", "living-director", "branching"]) expect(Object.hasOwn(GUIDE_TOPICS, id)).toBe(true);
  });

  it("keeps a pending topic name reserved until its feature lands, then it must leave the pending list", () => {
    expect(Object.keys(PENDING_GUIDE_TOPICS).filter((id) => Object.hasOwn(GUIDE_TOPICS, id))).toEqual([]);
    expect(readGuide("living-director")).toContain("the story director writes the next one");
  });
});
