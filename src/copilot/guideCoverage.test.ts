import type { PoseEntry, StoryPoses, MemberSprites, StageMember, CardFieldBinding, CodexEntry, CodexFact, CodexReturn, StoryCodex, Observation, ObservationPassive } from "@engine/schema";
import type { CarryFrom, CarryMapEntry, OutcomeKey } from "@engine/carrySchema";
import type { Commitment } from "@engine/lifeSchema";
import type { StoryPolish } from "@engine/polishSchema";
import type { MemberCue, MemberTopic, StoryNorm, TopicTier } from "@engine/cueSchema";
import type { StoryEcho } from "@engine/echoSchema";
import type { Checkpoint, CheckpointEffects, NpcReplyEffect, Quality, RosterMember, Story, StoryTalkDefaults, TalkControl, Transition } from "@engine/index";
import { GUIDE_TOPICS, type GuideTopicId } from "./guideTopics";
import { PENDING_GUIDE_TOPICS, readGuide } from "./guideRead";

type Covered = GuideTopicId | { none: string };

const STORY: Record<keyof Story, Covered> = {
  features: "feature-policies",
  id: "story-basics", title: "story-basics", description: "story-basics", player_intro: "story-basics", kind: "story-basics",
  player: "player", briefing: "briefing", reasoning: "experimental-effects", illustrations: "presentation", poses: "poses", qualities: "qualities", checkpoints: "checkpoints", transitions: "transitions",
  roster: "roster", arc_template: "arc-template", arc_bridges: "arc-bridges", requirements: "requirements", stagecraft: "stagecraft",
  scene_read: "scene-read", lore_select: "lore-select", house_rules: "house-rules",
  scaffolding: { none: "written by the road-ahead generator, never authored" },
  objective_block: "objective-agency", display: "presentation", chapters: "chapters", memory: "chapters", quests: "quests", milestones: "quests",
  widgets: "widgets", clock: "story-time", calendar: "story-time", living: "living-director", factions: "factions",
  codex: "codex", observations: "observations", outcome: "outcome", carry_from: "carry-from", rumors: "rumors", patterns: "patterns", polish: "story-polish",
  norms: "norms", echoes: "echoes", talk_defaults: "talk-pacing",
};

const CHECKPOINT: Record<keyof Checkpoint, Covered> = {
  id: "checkpoints", name: "checkpoints", objective: "checkpoints", player_name: "checkpoints", player_text: "checkpoints", type: "checkpoints",
  start: "checkpoints", state_snapshot: "checkpoints", tension_target: "tension", target_turn_length: "checkpoints", effects: "world-info",
  talk_control: "talk-control", agency: "objective-agency", guidance: "guidance", convergence_threshold: "convergence", motives: "drives-motives",
  chapter: "chapters", illustrate: "presentation", stretch: "open-stretches", checks: "checks", offers: "offers",
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
  relationships: "character-life", mood: "character-life", agenda: "character-life", schedule: "character-life", factions: "factions", gossip: "rumors", commitments: "commitments",
  polish: "roster-polish", cues: "cues", topics: "topics",
};

const QUALITY: Record<keyof Quality, Covered> = {
  key: "qualities", type: "qualities", values: "qualities", player_labels: "quality-reads", source: "qualities", latching: "latching", monotonic: "latching",
  rubric: "quality-rubric", scope_hint: "quality-reads", ledger_binding: "quality-reads", read_as: "quality-reads", criteria: "quality-reads",
  evidence_from: "quality-reads", commit_evidence: "quality-reads", roll: "chance-roll", display: "widgets", player_action: "consequences", step_rule: { none: "compiled from character-life relationships and the clock; an authored one is dropped" },
  range: { none: "compiled from display min and max and from a faction's range; an authored one is dropped" },
};

const POSE: Record<keyof PoseEntry, Covered> = { id: "poses", label: "poses", tags: "poses", framing: "poses", props: "poses", text: "poses", keypoints: "poses", version: "poses", when: "poses" };
const POSE_KEYS: Record<keyof PoseEntry["keypoints"], Covered> = { format: "poses", canvas: "poses", points: "poses" };
const POSE_WHEN: Record<keyof NonNullable<PoseEntry["when"]>, Covered> = { keywords: "poses" };
const POSES: Record<keyof StoryPoses, Covered> = { use: "poses", custom: "poses" };
const MEMBER_POSES: Record<keyof MemberSprites, Covered> = { pose: "poses", poses: "poses" };
const STAGE_MEMBER: Record<keyof StageMember, Covered> = { pose: "poses", set: "poses", face: "poses", hidden: "poses", framing: "poses" };
const CARD_FIELD: Record<keyof CardFieldBinding, Covered> = { quality: "living-cards", visual: "living-cards", layer: "poses", rebase: "poses", region: "poses" };
const REGION: Record<keyof NonNullable<CardFieldBinding["region"]>, Covered> = { x: "poses", y: "poses", width: "poses", height: "poses" };
const CODEX: Record<keyof StoryCodex, Covered> = { people: "codex", places: "codex" };
const CODEX_ENTRY: Record<keyof CodexEntry, Covered> = { id: "codex", name: "codex", member: "codex", location: "codex", aliases: "codex", known_when: "codex", facts: "codex", returns: "codex-returns" };
const CODEX_FACT: Record<keyof CodexFact, Covered> = { id: "codex", text: "codex", known_when: "codex", source: "codex", rev: "codex" };
const CODEX_RETURN: Record<keyof CodexReturn, Covered> = { id: "codex-returns", text: "codex-returns", when: "codex-returns", rev: "codex-returns" };
const OBSERVATION: Record<keyof Observation, Covered> = {
  id: "observations", text: "observations", when: "observations", source: "observations", rev: "observations", passive: "observations",
};
const OBSERVATION_PASSIVE: Record<keyof ObservationPassive, Covered> = { roll: "observations", modifiers: "observations" };
const COMMITMENT: Record<keyof Commitment, Covered> = {
  id: "commitments", to: { none: "always \"player\"; another value is refused" }, what: "commitments", made_when: "commitments", kept_when: "commitments",
  broken_when: "commitments", due: "commitments", heard: "commitments", effect: "commitments",
};
const STORY_POLISH: Record<keyof StoryPolish, Covered> = { mode: "story-polish", narration: "story-polish" };
const OUTCOME: Record<keyof OutcomeKey, Covered> = { key: "outcome", heritage_text: "outcome" };
const CARRY: Record<keyof CarryFrom, Covered> = { story: "carry-from", mode: "carry-from", map: "carry-from", replay_map: "carry-from", previously: "carry-from", default: "carry-from" };
const CARRY_MAP: Record<keyof CarryMapEntry, Covered> = { from: "carry-from", to: "carry-from", as: "carry-from", known_by: "carry-from" };
const CUE: Record<keyof MemberCue, Covered> = {
  id: "cues", kind: "cues", when: "cues", cue: "cues", lane: "cues", priority: "cues", window: "cues", repeat: "cues", landed_when: "cues", max_offers: "cues",
};
const TOPIC: Record<keyof MemberTopic, Covered> = { id: "topics", keys: "topics", tiers: "topics", priority: "topics" };
const TIER: Record<keyof TopicTier, Covered> = { cue: "topics", when: "topics" };
const NORM: Record<keyof StoryNorm, Covered> = {
  id: "norms", label: "norms", broken_when: "norms", noticed_by: "norms", cue: "norms", priority: "norms", checkpoints: "norms",
};
const ECHO: Record<keyof StoryEcho, Covered> = {
  id: "echoes", after: "echoes", delay: "echoes", when: "echoes", cancel_when: "echoes", expires: "echoes", to: "echoes", cue: "echoes", hold: "echoes",
};
const TALK_CONTROL: Record<keyof TalkControl, Covered> = {
  speakers: "talk-control", lead: "talk-control", no_repeat: "talk-control", allow_silence: "talk-control", director: "talk-control", chain: "talk-control",
  profile: "talk-pacing", budget: "talk-pacing", lead_words: "talk-pacing", spotlight: "talk-pacing", address_player: "talk-pacing", reaction: "talk-pacing",
};
const TALK_DEFAULTS: Record<keyof StoryTalkDefaults, Covered> = { profile: "talk-pacing", budget: "talk-pacing" };
const NPC_REPLY: Record<keyof NpcReplyEffect, Covered> = {
  trigger: "npc-replies", member: "npc-replies", kind: "npc-replies", new_chat_only: "opening-scene", text: "npc-replies", instruction: "npc-replies", ask_player: "npc-replies",
  maxTriggers: "npc-replies", probability: "npc-replies", after_member: "npc-replies", enabled: "npc-replies", id: "npc-replies", once_per: "npc-replies",
  cooldown_player_turns: "npc-replies",
};
const TABLES: Array<[string, Record<string, Covered>]> = [
  ["checkpoints[].talk_control", TALK_CONTROL], ["talk_defaults", TALK_DEFAULTS], ["checkpoints[].effects.npc_replies[]", NPC_REPLY],
  ["polish", STORY_POLISH],
  ["roster[].cues[]", CUE], ["roster[].topics[]", TOPIC], ["roster[].topics[].tiers[]", TIER], ["norms[]", NORM], ["echoes[]", ECHO],
  ["outcome[]", OUTCOME], ["carry_from", CARRY], ["carry_from.map[]", CARRY_MAP],
  ["codex", CODEX], ["codex.entry", CODEX_ENTRY], ["codex.fact", CODEX_FACT], ["roster[].commitments[]", COMMITMENT], ["codex.return", CODEX_RETURN],
  ["observations[]", OBSERVATION], ["observations[].passive", OBSERVATION_PASSIVE],
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
    for (const id of ["quests", "checks", "widgets", "clues-and-maps", "html-panels", "chapters", "character-life", "living-cards", "living-director", "branching", "codex"]) expect(Object.hasOwn(GUIDE_TOPICS, id)).toBe(true);
  });

  it("keeps a pending topic name reserved until its feature lands, then it must leave the pending list", () => {
    expect(Object.keys(PENDING_GUIDE_TOPICS).filter((id) => Object.hasOwn(GUIDE_TOPICS, id))).toEqual([]);
    expect(readGuide("living-director")).toContain("the story director writes the next one");
  });
});
