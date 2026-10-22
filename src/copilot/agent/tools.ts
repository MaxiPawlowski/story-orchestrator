import { readChapters, type ValidationError } from "@engine/index";
import { readPlayer } from "@engine/validate/player";
import { isRecord } from "@utils/guards";
import { readFeaturePolicies } from "@engine/featurePolicy";
import { nearestKey } from "@utils/levenshtein";
import type { ProvisioningOpKind } from "@wizard/index";
import type * as CoreMutations from "../../studio/mutations";
import type * as InnerVoiceMutations from "../../studio/innerVoiceMutations";
import type * as PoseMutations from "../../studio/poseMutations";
import { POSE_AGENT_KINDS, readPoseCall } from "./poseOps";
import type * as GameMutations from "../../studio/gameMutations";
import { GAME_AGENT_KINDS, readGameCall } from "./gameOps";
import { parseProposal } from "../index";
import type { ProposalOpKind } from "../types";
import type { AgentOnlyOp, AgentOp, AgentToolCall, AgentToolFamily } from "./types";

type Mutations = typeof CoreMutations & typeof InnerVoiceMutations & typeof GameMutations & typeof PoseMutations;

export type AgentArgType = "string" | "number" | "boolean" | "object" | "array" | "value";

export interface AgentArgSpec {
  type: AgentArgType;
  required: boolean;
  doc: string;
}

export interface AgentToolSpec {
  name: string;
  family: AgentToolFamily;
  doc: string;
  args: Record<string, AgentArgSpec>;
  backedBy?: keyof Mutations;
  composes?: Array<keyof Mutations>;
}

export type DraftOpKind = Exclude<ProposalOpKind, ProvisioningOpKind>;

const req = (type: AgentArgType, doc: string): AgentArgSpec => ({ type, required: true, doc });
const opt = (type: AgentArgType, doc: string): AgentArgSpec => ({ type, required: false, doc });

const ID = req("string", "checkpoint id");
const REF = req("object", "{from, to, priority?, index?} naming one transition; index is its number in readGraph, for telling identical ones apart");
const QUALITY = "{key, type: string|int|float|bool|enum, values?: string[], source: \"extractor\", rubric, latching?: boolean}";
const CHECKPOINT = "{id, name, objective, type: anchor|intermediate, tension_target?, guidance?, agency?, talk_control?, convergence_threshold?, "
  + "stretch?: {mode: open, pace?, pull_after?, max_turns?, offer?: [encounters], arrive_when (an anchor's opening has only mode, pace, pull_after)} (null clears)}";
const GATE = "{q, op: ==|!=|>=|<=|>|<|in, v} | {all: gate[]} | {any: gate[]} | {not: gate}";
const QUEST = "[{id, title, visible_when?, offered_when?, done_when?, failed_when?, steps: [{text, done_when}], requires?, progress?, labels?, giver?, reward?}]";
const CHECK = "{id, label?, quality, roll: {sides, target, dice?}, modifiers?: [{q, v, add, label?}], narrate: public|hidden, outcome?, twist?}";
const CHAPTER = "[{id, title, player_title?, kind?: chapter|interlude, final?: boolean, seal?: {open_threads?: carry|close|decide, keep_tail?, fold_messages?, record_style?: prose|chronicle}}]";

type EditSpec = Omit<AgentToolSpec, "name" | "family"> & { backedBy: keyof Mutations };

export const EDIT_TOOLS = {
  setFeatures: { backedBy: "setFeatures", composes: ["setFeaturePolicy"],
    doc: "Replace story feature policies. Absent inherits; off declines; an object tunes. Never put authored content here.",
    args: { features: req("object", "Complete features block; see readGuide feature-policies") } },
setPoses: { backedBy: "setPoses", doc: "Set the story pose library. Read poses and pose-skeletons first. No render or download.", args: { poses: req("object",
    "{use?: pose ids or tags[], custom?: PoseEntry[]}") } },
setMemberPoses: { backedBy: "setMemberPoses", doc: "Set a member's default pose and allowed pose ids.", args: { id: req("string", "roster id"), sprites: req("object",
    "{pose?: id, poses?: id[]}") } },
setPoseCard: { backedBy: "setPoseCard", doc: "Set living card fields and character layers. Read poses first.", args: { id: req("string", "roster id"), card: req("object",
    "{fields: {field: {quality, visual?, layer?: base|face|decal, rebase?, region?: {x,y,width,height}}}}") } },
  setStoryField: {
    backedBy: "setStoryField",
    doc: "Set the story title, description, or objective_block (auto|off).",
    args: { field: req("string", "title | description | objective_block"), value: req("value", "the new value") },
  },
  addQuality: { backedBy: "addQuality", doc: "Declare a quality the reader scores.", args: { quality: req("object", QUALITY) } },
  updateQuality: { backedBy: "updateQuality", doc: "Patch a declared quality.", args: { key: req("string", "quality key"), patch: req("object", "fields of the quality to change") } },
  removeQuality: { backedBy: "removeQuality", doc: "Remove a quality.", args: { key: req("string", "quality key") } },
  addCheckpoint: { backedBy: "addCheckpoint", doc: "Add a beat.", args: { checkpoint: req("object", CHECKPOINT) } },
  updateCheckpoint: {
    backedBy: "updateCheckpoint",
    doc: "Patch a beat: objective, tension_target, guidance, agency, talk_control and the rest.",
    args: { id: ID, patch: req("object", "fields of the checkpoint to change") },
  },
  removeCheckpoint: { backedBy: "removeCheckpoint", doc: "Remove a beat and every transition touching it.", args: { id: ID } },
  setStartCheckpoint: { backedBy: "setStartCheckpoint", doc: "Make this beat the start.", args: { id: ID } },
  setCheckpointSnapshot: { backedBy: "setCheckpointSnapshot", doc: "Values the blackboard takes when the beat starts.", args: { id: ID, snapshot: req("object", "{qualityKey: value}") } },
  setCheckpointEffects: {
    backedBy: "setCheckpointEffects", composes: ["setStagePose"],
    doc: "Replace a beat's effects: author_note, world_info, cast_changes, npc_replies, background, scenario, card, stage (member to pose/framing).",
    args: { id: ID, effects: req("object", "the whole effects block") },
  },
  addTransition: { backedBy: "addTransition", doc: "Connect two beats with a gate.", args: { transition: req("object", `{from, to, gate: ${GATE}, priority, extraction_hint?}`) } },
  updateTransition: { backedBy: "updateTransition", doc: "Patch a transition (priority, extraction_hint, effects).", args: { ref: REF, patch: req("object", "fields of the transition to change") } },
  removeTransition: { backedBy: "removeTransition", doc: "Remove a transition.", args: { ref: REF } },
  setTransitionGate: { backedBy: "setTransitionGate", doc: "Replace a transition's gate.", args: { ref: REF, gate: req("object", GATE) } },
  addRosterMember: { backedBy: "addRosterMember", doc: "Add a cast member.", args: { member: req("object", "{id, name?, role?}") } },
  updateRosterMember: {
    backedBy: "updateRosterMember",
    doc: "Patch a cast member's name, role, drive or view.",
    args: { id: req("string", "member id"), patch: req("object", "{name?, role?, drive?, view?}") },
  },
  removeRosterMember: { backedBy: "removeRosterMember", doc: "Remove a cast member.", args: { id: req("string", "member id") } },
  setArcTemplate: { backedBy: "setArcTemplate", doc: "Set the dramatic shape, or null to clear it.", args: { template: req("value", "a template name, a custom curve, or null") } },
  setArcBridges: { backedBy: "setArcBridges", doc: "Replace the thread bridges (the full list).", args: { bridges: req("array", "[{arcMatch, anchor, amount}]") } },
  setRequirements: { backedBy: "setRequirements", doc: "Replace what the story requires to run.", args: { requirements: req("object", "{personas?, members?, lorebooks?}") } },
  setStagecraft: { backedBy: "setStagecraft", doc: "Replace the curator's lorebook scope.", args: { stagecraft: req("object", "{lorebooks: string[]}") } },
  setSceneRead: { backedBy: "setSceneRead", doc: "Replace the scene places and times.", args: { sceneRead: req("object", "{locations?, times?, inject?}") } },
  setLoreSelect: { backedBy: "setLoreSelect", doc: "Replace the lore-select books.", args: { loreSelect: req("object", "{lorebooks, top_k?, exclusive?}") } },
  setBriefing: {
    backedBy: "setBriefing",
    doc: "Set the page the player reads before the first line (the whole briefing). Player copy: only what the player may know at the start, never a later beat, "
      + "an outcome or a character the start keeps off stage; a draft that names one is refused.",
    args: { briefing: req("object", "{sections: [{heading, text}] (1-6, plain text, no macros), title?, tone?, image?, start_label?}") },
  },
  setHouseRules: { backedBy: "setHouseRules", doc: "Replace the house rules (the full list).", args: { rules: req("array", "one rule per string") } },
  setPlayer: {
    backedBy: "setPlayer",
    doc: "Say who the player plays (the whole profile). Player copy: no later beat or outcome. Never a persona: the player chooses or creates one at the start.",
    args: { player: req("object", "{role?, summary?, name?: {mode: any|suggested|fixed, value?}, assumes?: string[], suggested_description?, inject?}") },
  },
  setChapters: {
    backedBy: "setChapters",
    composes: ["addChapter", "updateChapter", "removeChapter", "setChapterPolicy", "setCheckpointChapter"],
    doc: "Replace the chapters (the full list, in play order) and assign checkpoints to them. Once one chapter exists every checkpoint needs one. Optional for any story.",
    args: {
      chapters: req("array", CHAPTER),
      assign: opt("object", "{checkpointId: chapterId}; \"\" clears one"),
    },
  },
  setRosterDrive: {
    backedBy: "setRosterDrive",
    doc: "Set a cast member's standing goal, told only to that member. Empty text clears it. Never for the player.",
    args: { id: req("string", "member id"), drive: req("string", "one line: what they want across the story") },
  },
  setRosterView: {
    backedBy: "setRosterView",
    doc: "omniscient: this member (a narrator) is told every character's private rows, to foreshadow; own: only their own.",
    args: { id: req("string", "member id"), view: req("string", "own | omniscient") },
  },
  setCheckpointMotive: {
    backedBy: "setCheckpointMotive",
    doc: "Set what one cast member wants at one beat, told only to that member. Empty text clears it. Never for the player.",
    args: { id: ID, member: req("string", "member id"), motive: req("string", "one line: what they want right now") },
  },
  setAppearance: {
    backedBy: "setAppearance",
    doc: "Set how a cast member looks, for pictures and sprites (story illustrations, never the card). Empty text clears it.",
    args: { id: req("string", "member id"), appearance: req("string", "what they look like: build, face, hair, clothes, one or two sentences") },
  },
  setQuests: {
    backedBy: "setQuests",
    composes: ["addQuest", "updateQuest", "removeQuest"],
    doc: "Replace the side quests (the full list). Status is computed from qualities, never stored; titles and steps are player copy (no later beat). Read the quests guide first.",
    args: { quests: req("array", QUEST) },
  },
  setMilestones: {
    backedBy: "setMilestones",
    composes: ["addMilestone", "updateMilestone", "removeMilestone"],
    doc: "Replace the milestones (the full list): earned when the gate holds; a secret one shows ??? until then.",
    args: { milestones: req("array", `[{id, title, when: ${GATE}, secret?}]`) },
  },
  setWidgets: {
    backedBy: "setWidgets",
    composes: ["addWidget", "updateWidget", "removeWidget"],
    doc: "Replace the story panels (the full list). A player panel binds only public qualities.",
    args: {
      widgets: req("array", "[{id, kind: meters|track|log|clock|board|clues|map|html|roster|timeline, title, bind?, audience?: player|author, options?, visible_when?, "
        + "actions?: [{id, text, open?: overview|memory, check?}], rows? (roster), dates? (timeline)}]"),
    },
  },
  setQualityDisplay: {
    backedBy: "setQualityDisplay",
    doc: "Show a quality on the player's Stat sheet, or null to keep it hidden. Never a relationship.",
    args: { key: req("string", "quality key"), display: req("value", "{public: true, label, as: item|count|meter|boxes|word, group?, min?, max?, bands?} or null") },
  },
  setCheckpointChecks: {
    backedBy: "setCheckpointChecks",
    doc: "Replace a beat's checks: seeded rolls once per visit, written to code bool qualities.",
    args: { id: ID, checks: req("array", CHECK) },
  },
  setTransitionCheck: {
    backedBy: "setTransitionCheck",
    doc: "Put a check on a transition (attempted when the rest of its gate holds), or null to remove it.",
    args: { index: req("number", "the transition's number in readGraph"), check: req("value", `${CHECK} or null`) },
  },
  setCharacterLife: {
    backedBy: "setCharacterLife",
    composes: ["setMemberFactions", "setRelationshipLabels", "setCommitments"],
    doc: "Replace one cast member's character life (every field you leave out is cleared): feelings, mood, off-stage agenda, whereabouts, the factions it belongs to, "
      + "promises it made to the player (kept or broken by an event, never by time). "
      + "Private to that member. Read the character-life guide first.",
    args: {
      id: req("string", "member id"),
      life: req("object", "{relationships?: [{toward: id|player, axes, range?, step?, start?, public?: [{label, when?, follows_feeling?, hold?}], "
        + "secret?: [{id, label, revealed_when}]}], mood?: {baseline, values?, lasts?}, "
        + "agenda?: [{id, goal, steps: [{text, when?, effect?, public?, repeat?}], pace: per_n_boundaries|per_chapter, every?}], schedule?: [{when, at}], factions?: [faction id] (at most 3), "
        + "commitments?: [{id, what (a verb phrase without you/I), made_when: gate | \"start\", kept_when, broken_when? (an event), due?: {boundaries}|{story_day}, heard?, effect?}] (at most 6)}"),
    },
  },
  setFactions: {
    backedBy: "setFactions",
    composes: ["addFaction", "updateFaction", "removeFaction"],
    doc: "Replace the factions (the full list): groups whose standing with the player moves only on authored moves and quest rewards; players see band words, never numbers. "
      + "A move that lowers standing must gate on an event the player caused, never on time, absence or false. Read the factions guide first.",
    args: {
      factions: req("array", `[{id (slug, no underscores), name, range?: [low, high], start?, bands: [{max, label}, …, {label}], visible_when?: ${GATE}, introduce?, `
        + `moves: [{id, when: ${GATE}, add (whole number, not 0), heard_by?: present|faction}]}]`),
    },
  },
  setRumors: {
    backedBy: "setRumors",
    composes: ["addRumor", "updateRumor", "removeRumor", "setMemberGossip"],
    doc: "Replace the story's rumors (the full list) and, optionally, members' gossip channels: news that travels between characters as hearsay, in code, after a delay. "
      + "A rumor never carries a secret except to the one member a leak names. Read the rumors guide first.",
    args: {
      rumors: req("array", `[{id (slug), from (member id), claim, versions?: [{text, truth: true|false|unknown, weight?}], starts_when?: ${GATE}, `
        + `leaks_to?: [{member, when: ${GATE}}]}]`),
      gossip: opt("object", `{<member id>: {talks_to: [member id], contact?: together|any|${GATE}, when?: ${GATE}, delay?: {boundaries|days: [min, max]}, hops?: 1-3} | null}`),
    },
  },
  setCodexEntry: {
    backedBy: "updateCodexEntry",
    doc: "Create or replace one People or Places page entry. Facts show to the player only once known_when holds; "
      + "write each as a lasting truth the player may read the moment it is known. Read the codex guide first.",
    args: {
      page: req("string", "people | places"),
      entry: req("object", `{id, name? | member? (roster id), location? (places: a location value), aliases?, known_when?, `
        + `facts: [{id, text, known_when: ${GATE} | {reached: checkpoint id} | "start", source?, rev?}], `
        + `returns? (places with a location): [{id, text, when: ${GATE} | {reached: checkpoint id}, rev?}]}`),
    },
  },
  removeCodexEntry: {
    backedBy: "removeCodexEntry",
    doc: "Remove one People or Places page entry.",
    args: { page: req("string", "people | places"), id: req("string", "entry id") },
  },
  setObservation: {
    backedBy: "updateObservation",
    doc: "Create or replace one line the player can notice. Write what is there to see; never what the player feels, concludes or does. "
      + "It shows on the player's page only once when holds, and no model is told. Read the observations guide first.",
    args: {
      observation: req("object", `{id (slug, '-' not '_'), text (200 characters, plain), when: ${GATE} | {reached: checkpoint id}, source? (codex entry or roster id), rev?, `
        + "passive?: {roll: {sides, target, dice?}, modifiers?: [{q, v, add, label?}]}}"),
    },
  },
  removeObservation: {
    backedBy: "removeObservation",
    doc: "Remove one line the player can notice.",
    args: { id: req("string", "observation id") },
  },
  setClock: {
    backedBy: "setClock",
    doc: "Give the story a time of day and a day count, or null to remove it (and its calendar).",
    args: { clock: req("value", "{times: [\"morning\", \"evening\", \"night\"], start_day?, start_part?, night?: [names], max_skip_days?} or null") },
  },
  setCalendar: {
    backedBy: "setCalendar",
    doc: "Give a story with a clock a calendar (the date of story day 1, months, weekdays, seasons), or null to remove it.",
    args: { calendar: req("value", "{start: {year?, month, day, weekday?}, months: [{name, days}], weekdays?, seasons?: [{name, from_month}], label?: date|day} or null") },
  },
} satisfies Record<DraftOpKind | AgentOnlyOp["kind"], EditSpec>;

export const PROVISION_TOOLS = {
  createCharacterCard: {
    doc: "Create a NEW character card on the install. Always reviewed by the author; never edits an existing card.",
    args: {
      name: req("string", "card name"), description: req("string", "card description"), role: opt("string", "role in this story"), personality: opt("string", ""),
      scenario: opt("string", ""), first_mes: opt("string", "only for the opening scene's cast, for that scene only; leave it out for anyone who enters later"),
      mes_example: opt("string", ""), tags: opt("array", "string[]"),
      replaces: opt("value", "only to revise a card that came back with notes: that step's id, a number (one revision per card)"),
    },
  },
  createStoryLorebook: { doc: "Create this story's own NEW lorebook. Always reviewed by the author.", args: { name: req("string", "lorebook name") } },
  upsertLorebookEntry: {
    doc: "Write an entry into a lorebook this story created. Always reviewed by the author.",
    args: {
      lorebook: req("string", "a lorebook this story owns"), comment: req("string", "entry title"), keys: req("array", "keywords"),
      content: req("string", "entry text"), constant: opt("boolean", "always in context"),
      secondaryKeys: opt("array", "optional filter keys, checked after a keyword matched"), logic: opt("string", "and-any (default) | not-all | not-any | and-all"),
      outlet: opt("string", "outlet name: the text lands only where {{outlet::name}} is written"),
      triggers: opt("array", "generation types it fires on: normal, continue, impersonate, swipe, regenerate, quiet"),
    },
  },
  createGroup: { doc: "Create a NEW group from existing cards. Always reviewed by the author.", args: { name: req("string", "group name"), members: req("array", "card names") } },
} satisfies Record<Exclude<ProvisioningOpKind, "grantLorebook">, Omit<AgentToolSpec, "name" | "family">>;

const QUERY = opt("string", "filter by substring");

export const READ_TOOLS = {
  readStory: { family: "read", doc: "The whole draft, summarised: qualities, beats, transitions, cast, blocks in use.", args: {} },
  readCheckpoint: { family: "read", doc: "One beat in full, with its outgoing transitions.", args: { id: ID } },
  readGraph: { family: "read", doc: "Every transition as an edge, with its gate in words.", args: {} },
  readDiagnostics: { family: "read", doc: "The Studio diagnostics for the draft.", args: {} },
  readValidation: { family: "read", doc: "The story validator's errors for the draft.", args: {} },
  readQualityUsage: { family: "read", doc: "Where a quality is read: transition, quest and codex gates, snapshots and card bindings.", args: { key: req("string", "quality key") } },
  readGateOptions: { family: "read", doc: "The operators and a sample value a gate on this quality may use.", args: { key: req("string", "quality key") } },
  readCoverage: { family: "read", doc: "Fields this story does not use yet, and what each would add.", args: {} },
  readGuide: { family: "read", doc: "The author's guide on one topic: what the fields do, a good example, the trap.", args: { topic: req("string", "a guide topic") } },
  readRecipe: { family: "read", doc: "A step-by-step playbook for one authoring task: the tools in order, what to check after, the traps.", args: { recipe: req("string", "a recipe id") } },
  simulateReachability: { family: "simulate", doc: "Which beats the start can reach, and which lead nowhere.", args: {} },
  simulateWalk: {
    family: "simulate",
    doc: "Replay gates over a scripted run: each step sets quality values, then at most one transition fires.",
    args: { steps: req("array", "[{qualityKey: value}, …]") },
  },
  lookupCharacters: { family: "lookup", doc: "Character card names on this install.", args: { query: QUERY } },
  lookupLorebooks: { family: "lookup", doc: "Lorebook names on this install.", args: { query: QUERY } },
  lookupGroups: { family: "lookup", doc: "Group names on this install.", args: { query: QUERY } },
  lookupBackgrounds: { family: "lookup", doc: "Background file names on this install.", args: { query: QUERY } },
} satisfies Record<string, Omit<AgentToolSpec, "name">>;

export type ReadToolName = keyof typeof READ_TOOLS;

export const AGENT_TOOLS: Record<string, AgentToolSpec> = Object.fromEntries([
  ...Object.entries(READ_TOOLS).map(([name, spec]) => [name, { name, ...spec }]),
  ...Object.entries(EDIT_TOOLS).map(([name, spec]) => [name, { name, family: "edit", ...spec }]),
  ...Object.entries(PROVISION_TOOLS).map(([name, spec]) => [name, { name, family: "provision", ...spec }]),
] as Array<[string, AgentToolSpec]>);

export const AGENT_TOOL_NAMES = Object.keys(AGENT_TOOLS);

export const MUTATIONS_WITHOUT_A_TOOL: Partial<Record<keyof Mutations, string>> = {
  nextId: "id helper",
  newQuality: "constructor; addQuality takes the full quality",
  newCheckpoint: "constructor; addCheckpoint takes the full checkpoint",
  newTransition: "constructor; addTransition takes the full transition",
  sameTransitionKey: "predicate; addTransition uses it to refuse a duplicate",
  newRosterMember: "constructor; addRosterMember takes the full member",
  newArcBridge: "constructor; setArcBridges takes the full list",
  addArcBridge: "covered by setArcBridges",
  updateArcBridge: "covered by setArcBridges",
  removeArcBridge: "covered by setArcBridges",
  clearStartCheckpoint: "setStartCheckpoint moves the start; a story without one does not validate",
  setStoryId: "the story's identity is the author's, set in the Story tab",
  setMemberCard: "card-field bindings are authored in the Roster tab and the checkpoint Card changes section; an agent tool for them is a later step",
  newQuest: "constructor; setQuests takes the full list",
  newMilestone: "constructor; setMilestones takes the full list",
  newWidget: "constructor; setWidgets takes the full list",
  newFaction: "constructor; setFactions takes the full list",
  newRumor: "constructor; setRumors takes the full list",
  CHARACTER_LIFE_FIELDS: "a constant, not a mutation: the fields setCharacterLife replaces",
  setCodex: "the Studio replaces the whole codex; the agent edits one entry at a time with setCodexEntry and removeCodexEntry",
  setCodexShown: "whether the story shows People and Places is a presence choice the author makes in the Studio",
  setObservations: "the Studio replaces the whole list; the agent edits one line at a time with setObservation and removeObservation",
  setObservationsShown: "whether the story shows what the player notices is a presence choice the author makes in the Studio",
};

export const renderArg = (name: string, spec: AgentArgSpec): string => `${name}${spec.required ? "" : "?"}: ${spec.type}${spec.doc ? ` (${spec.doc})` : ""}`;

export const renderToolSchema = (): string => {
  const families: AgentToolFamily[] = ["read", "simulate", "lookup", "edit", "provision"];
  return families
    .map((family) => {
      const lines = Object.values(AGENT_TOOLS)
        .filter((spec) => spec.family === family)
        .map((spec) => `- ${spec.name}(${Object.entries(spec.args).map(([name, arg]) => renderArg(name, arg)).join("; ")}) — ${spec.doc}`);
      return `${family.toUpperCase()}\n${lines.join("\n")}`;
    })
    .join("\n\n");
};

const JSON_TYPE: Record<AgentArgType, string[]> = {
  string: ["string"], number: ["number"], boolean: ["boolean"], object: ["object"], array: ["array"], value: ["string", "number", "boolean", "null", "object"],
};

export const toolJsonSchema = (spec: AgentToolSpec): Record<string, unknown> => ({
  name: spec.name,
  description: spec.doc,
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: Object.fromEntries(Object.entries(spec.args).map(([name, arg]) => [name, { type: JSON_TYPE[arg.type], description: arg.doc }])),
    required: Object.entries(spec.args).filter(([, arg]) => arg.required).map(([name]) => name),
  },
});

const typeMatches = (type: AgentArgType, value: unknown): boolean => {
  if (type === "value") return value !== undefined;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isRecord(value);
  return typeof value === type;
};

const hint = (typed: string, known: readonly string[]): string => {
  const near = nearestKey(typed, known);
  return near ? ` (did you mean "${near}"?)` : "";
};

export type ToolCheck =
  | { ok: true; spec: AgentToolSpec; op?: AgentOp }
  | { ok: false; message: string };

const readPlayerCall = (spec: AgentToolSpec, args: Record<string, unknown>): ToolCheck => {
  if (isRecord(args.player) && args.player.card !== undefined) return { ok: false, message: "setPlayer.player.card: card fields are authored in the Roster tab, not here" };
  const errors: ValidationError[] = [];
  const player = readPlayer(args.player, errors) ?? {};
  if (errors.length) return { ok: false, message: errors.map((error) => `setPlayer.${error.path}: ${error.message}`).join("; ") };
  return { ok: true, spec, op: { kind: "setPlayer", player } };
};

const readChaptersCall = (spec: AgentToolSpec, args: Record<string, unknown>): ToolCheck => {
  const errors: ValidationError[] = [];
  const chapters = readChapters(args.chapters, errors) ?? [];
  const assign = isRecord(args.assign) ? args.assign : {};
  const loose = Object.entries(assign).filter(([, chapter]) => typeof chapter !== "string").map(([checkpoint]) => `setChapters.assign.${checkpoint}: expected a chapter id`);
  const problems = [...errors.map((error) => `setChapters.${error.path}: ${error.message}`), ...loose];
  if (problems.length) return { ok: false, message: problems.join("; ") };
  return { ok: true, spec, op: { kind: "setChapters", chapters, assign: Object.fromEntries(Object.entries(assign).map(([checkpoint, chapter]) => [checkpoint, String(chapter).trim()])) } };
};

export const malformedArgs = (call: AgentToolCall): string | null =>
  call.argsError ? `${call.tool}: ${call.argsError}. Send the arguments again as one JSON object with the listed fields.` : null;

export const argProblems = (spec: AgentToolSpec, call: AgentToolCall): string | null => {
  const malformed = malformedArgs(call);
  if (malformed) return malformed;
  const known = Object.keys(spec.args);
  const unknown = Object.keys(call.args).filter((key) => !known.includes(key));
  if (unknown.length) return unknown.map((key) => `${call.tool}: unknown argument "${key}"${hint(key, known)}`).join("; ");
  const problems = Object.entries(spec.args).flatMap(([name, arg]) => {
    const value = call.args[name];
    if (value === undefined) return arg.required ? [`${call.tool}: missing argument "${name}"`] : [];
    return typeMatches(arg.type, value) ? [] : [`${call.tool}.${name}: expected ${arg.type}`];
  });
  return problems.length ? problems.join("; ") : null;
};

export const toolHint = hint;

export const checkToolCall = (call: AgentToolCall): ToolCheck => {
  const spec = Object.hasOwn(AGENT_TOOLS, call.tool) ? AGENT_TOOLS[call.tool] : undefined;
  if (!spec) return { ok: false, message: `unknown tool "${call.tool}"${hint(call.tool, AGENT_TOOL_NAMES)}. Only the listed tools exist; there is no other way to change the story or the install.` };
  const argIssue = argProblems(spec, call);
  if (argIssue) return { ok: false, message: argIssue };
  if (spec.family !== "edit" && spec.family !== "provision") return { ok: true, spec };
  if (call.tool === "setHouseRules") {
    const rules = (Array.isArray(call.args.rules) ? call.args.rules : []).filter((rule): rule is string => typeof rule === "string" && rule.trim().length > 0);
    return { ok: true, spec, op: { kind: "setHouseRules", rules } };
  }
  if (call.tool === "setChapters") return readChaptersCall(spec, call.args);
  if (call.tool === "setPlayer") return readPlayerCall(spec, call.args);
  if (POSE_AGENT_KINDS.has(call.tool)) {
    const pose = readPoseCall(call.tool, call.args);
    return pose.ok ? { ok: true, spec, op: pose.op } : pose;
  }
  if (GAME_AGENT_KINDS.has(call.tool)) {
    const game = readGameCall(call.tool, call.args);
    return game.ok ? { ok: true, spec, op: game.op } : game;
  }
  const text = (key: string) => String(call.args[key]).trim();
  if (call.tool === "setRosterDrive") return { ok: true, spec, op: { kind: "setRosterDrive", id: text("id"), drive: text("drive") } };
  if (call.tool === "setAppearance") return { ok: true, spec, op: { kind: "setAppearance", id: text("id"), appearance: text("appearance") } };
  if (call.tool === "setFeatures") {
    const issues: string[] = [];
    const features = readFeaturePolicies(call.args.features, (path, message) => issues.push(`${path}: ${message}`));
    if (issues.length) return { ok: false, message: issues.join("; ") };
    return { ok: true, spec, op: { kind: "setFeatures", features } };
  }
  if (call.tool === "setCheckpointMotive") return { ok: true, spec, op: { kind: "setCheckpointMotive", id: text("id"), member: text("member"), motive: text("motive") } };
  if (call.tool === "setRosterView") {
    const view = text("view");
    return view === "own" || view === "omniscient" ? { ok: true, spec, op: { kind: "setRosterView", id: text("id"), view } } : { ok: false, message: "setRosterView.view: expected own or omniscient" };
  }
  const parsed = parseProposal(JSON.stringify({ summary: "", ops: [{ ...call.args, kind: call.tool }] }));
  const issues = parsed.issues.map((issue) => issue.replace(/^ops\.0/, call.tool));
  const op = parsed.proposal.ops[0];
  if (!op || issues.length) return { ok: false, message: issues.join("; ") || `${call.tool}: arguments did not parse` };
  return { ok: true, spec, op };
};
