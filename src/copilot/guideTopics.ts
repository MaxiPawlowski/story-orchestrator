import { nearestKey } from "@utils/levenshtein";
import type { DIAGNOSTIC_CODES } from "../studio/diagnostics";
import type { CopilotStage } from "./types";

export interface GuideTopic {
  title: string;
  fields: string;
  text: string;
}

export const GUIDE_TOPICS = {
  "story-basics": {
    title: "Title, description and id",
    fields: "title, description, id, player_intro, kind",
    text: "The title and description tell the model and the author what the story is; player_intro is what a player reads before the first beat. The id is the story's identity "
      + "(a lowercase slug the library keys by); stories carry no version number. kind is saga or story (default): only the player's badges read it, never the model; "
      + "chapters do not make a saga. Good: \"The Pawnbroker's Debt\" with a two-sentence premise. Avoid: renaming the id "
      + "after chats play it; a chat keeps the copy it pinned and the renamed story becomes a different story.",
  },
  briefing: {
    title: "Briefing",
    fields: "briefing, chapters[].briefing",
    text: "Player copy shown once when the story first starts in a group chat: {title, image, sections: [{heading, text}], tone, start_label}, at most 6 sections of 1200 "
      + "characters, plain text, no macros. Never sent to the model. Without it, player_intro shows as one section; description never does. A chapter's briefing opens that "
      + "chapter. Write only what the player may know then: no later beat, outcome, or character the start keeps off stage.",
  },
  player: {
    title: "Who the player is",
    fields: "player.role, player.summary, player.name, player.assumes, player.suggested_description, player.inject",
    text: "Who the player plays: role (one line, \"a hired adventurer\"), summary (player copy), name {mode: any|suggested|fixed, value}, assumes (what the story "
      + "takes for granted), suggested_description (prefill for a persona the player may create). The start page asks once and locks the chosen persona to the chat. "
      + "Unless inject is false, the reply prompt is told \"In this story, {{user}} is <role>: <summary>\". Never blocks a start except name.mode fixed. "
      + "Prefer it to requirements.personas. No later beat or outcome in player text.",
  },
  "arc-template": {
    title: "Dramatic shape",
    fields: "arc_template",
    text: "The expected tension curve over the story: rising, fall_recovery, three_act, or {points: [{at, tension}]} with both numbers from 0 to 1. Each turn the narrator is "
      + "told to escalate, hold or ease off toward it. Good: rising for a heist that builds to the vault. If absent, pacing reacts to tension targets only.",
  },
  requirements: {
    title: "Requirements",
    fields: "requirements.personas, requirements.members, requirements.lorebooks",
    text: "What the install must provide before the story's effects run: personas, group members and lorebooks, each named as SillyTavern names them. Name characters by "
      + "their CARD name, never by a roster id: \"Mara Venn\", not \"mara\". If wrong: the story never reads as ready and its effects stay deferred. A lorebook used by "
      + "lore_select or checkpoint world_info belongs here too, or it may not be active. Name a persona only if it already exists: nothing creates one.",
  },
  roster: {
    title: "Cast",
    fields: "roster[].id, name, role, aliases, view",
    text: "Every character the story directs. id is the story's handle, name the card name, role one line of what they do in this story (speaker direction and the judge "
      + "director pick by it; the judge director runs only when every candidate has a role). aliases are other names players use (\"the captain\"); an alias two members "
      + "share is ignored. view: omniscient makes a narrator see the private rows and aims of the members on stage, plus the beat's other cast and anyone named "
      + "in the last 20 messages (about 1,000 tokens, most recently named first) to foreshadow; own (default) sees only their own. Never put the player in the roster: "
      + "if a greeting says \"you are the pawnbroker\", there is no Pawnbroker card.",
  },
  "drives-motives": {
    title: "Drives and motives",
    fields: "roster[].drive, checkpoints[].motives",
    text: "A drive is what a character privately wants across the story; a motive is what they want at one beat. Both are told only to that character, so write them as "
      + "their own aim in one line: \"Keep the debt secret from her brother.\" Avoid: a plan for the player, a stage direction, or a motive for the player's persona (nobody is told it). "
      + "A motive keyed by an id no cast member has is told to nobody.",
  },
  qualities: {
    title: "Qualities",
    fields: "qualities[].key, type, values, source",
    text: "The typed facts the story tracks and gates on: int, float, bool, enum (with values) or string. source: extractor means the reading model scores it from the chat; "
      + "source: code means only the engine sets it (counters, rolls, progress). A quality no gate or snapshot uses is never asked about. Prefer enum or bool over string: a "
      + "closed list reads reliably, free text does not.",
  },
  "quality-rubric": {
    title: "Rubrics",
    fields: "qualities[].rubric",
    text: "The question the reading model answers from the prose, with its scale. Good: \"Has Mara agreed to guide the party into the ruins? true only when she says yes "
      + "aloud.\" Bad: \"Mara's attitude\". A rubric that asks about something the chat never shows (a thought, an off-screen event) can never be answered, so its gate never opens.",
  },
  latching: {
    title: "Latching and monotonic",
    fields: "qualities[].latching, monotonic, state_snapshot",
    text: "latching: the first confident read is final (a decision, an oath). monotonic: the value only rises (progress, trust earned). A latching enum must not list a "
      + "placeholder such as undecided, none or pending: the first read freezes it there forever; leave the quality unset instead. A snapshot that sets a latching value "
      + "conflicts with any later gate on a different value.",
  },
  "quality-reads": {
    title: "How a quality is read",
    fields: "read_as, criteria, player_labels, evidence_from, commit_evidence, scope_hint, ledger_binding",
    text: "read_as (choice for bool/enum, stated for a named number or name, rating for a scale) lets the judge read a plainly visible answer every turn; criteria say what "
      + "each option means. evidence_from: world means a player's own line cannot prove it (use it for outcomes gating an anchor); party for the party's own moves, "
      + "which the player's line may state. "
      + "commit_evidence is a pattern the quoted evidence must match for a commitment. scope_hint {from, until} narrows when it is asked; never narrow past a gate that needs it. "
      + "A player line wrapped in ((…)) or starting OOC: / (OOC is never read and is no player turn.",
  },
  "chance-roll": {
    title: "Chance rolls",
    fields: "qualities[].roll",
    text: "roll: {sides, target} draws a seeded die when a beat is entered: a bool is true when the face is at or under target, an int takes the face. Only on source: code "
      + "bool or int qualities. The draw is the same on a swipe, a rollback or a reopened chat. Good: a 1-in-3 ambush as {sides: 6, target: 2}.",
  },
  checkpoints: {
    title: "Checkpoints",
    fields: "checkpoints[].id, name, objective, type, start, state_snapshot, player_name, player_text, target_turn_length",
    text: "A beat of the story. anchor beats are authored and must happen; intermediate beats are bridges and must lead to an anchor. Exactly one start. The objective is one "
      + "sentence of what the beat is for, in world terms: \"The innkeeper offers the job.\" player_name and player_text are what a player sees, so name the place, "
      + "not what will happen there. "
      + "target_turn_length is how many turns the beat should breathe before a stall re-read.",
  },
  "objective-agency": {
    title: "Objectives and player agency",
    fields: "checkpoints[].agency, objective_block",
    text: "agency.objective_kind: world_pressure (the world presses and escalates on its own) or player_action (the world sets up the choice and stops; the player acts). "
      + "Defaults protect the player: narration never writes the player accepting, refusing or acting. alternate names a beat to recover to when the player refuses the route "
      + "(never the beat itself). player_attempts_only makes the world decide whether the player's attempt works. objective_block: off stops the objective line being injected.",
  },
  "open-stretches": {
    title: "Open stretches",
    fields: "checkpoints[].stretch, player_turns_in_checkpoint",
    text: "stretch: {mode: open, pace, pull_after, max_turns, arrive_when} on an intermediate is free play: no objective line, no beat chain, no stall re-read. pace brief, "
      + "unhurried or long = pull_after 3, 6 or 10 player turns; after that the world offers hooks toward the next place, max_turns makes them plain, never a move. "
      + "arrive_when must be the gate of every one of its exits; progress exits and player_text are refused. pressure, offer and trigger are not built yet.",
  },
  tension: {
    title: "Tension targets",
    fields: "checkpoints[].tension_target",
    text: "calm, stirring, tense, critical or peak: the tension this beat aims for. Pacing compares it to the measured tension and steers. Good: calm for a camp, critical "
      + "for the ambush. A story with every beat at peak has no shape to steer toward.",
  },
  guidance: {
    title: "Narrator guidance",
    fields: "checkpoints[].guidance",
    text: "Private direction for how the beat plays: text, or {all, members: {id: text}}. all reaches every generation; a member's text only while that member is drafted. "
      + "A secret never goes in shared guidance, which every character reads; put it in that member's entry. Write pressure and intent, never the ending, and call the "
      + "player {{user}}. A member key no cast member has reaches nobody.",
  },
  "author-note": {
    title: "Author's note",
    fields: "effects.author_note",
    text: "A note written into SillyTavern's Author's Note when the beat starts: text, or {text, role, position, depth, interval}. It steers every reply in the beat. A beat "
      + "without its own note keeps the previous beat's note, so set one (or null to clear) where the old one would mislead. While a beat has its own note the objective line "
      + "is not injected, so most stories leave notes out and clear a stale one with null at the start.",
  },
  "world-info": {
    title: "Beat lore",
    fields: "effects.world_info",
    text: "{enable: [{lorebook, comments: [entry titles]}], disable: [...]} switches lorebook entries on and off along the story's path. Entries any beat names belong to the "
      + "story: they rest off and are rebuilt per chat from the path, so a reopened chat matches a continuous one. The curator never writes a gated entry. Name entries by "
      + "their exact title (comment). Transitions carry no beat lore; an intermediate expanded into a generated stretch has its world_info played by the stretch's "
      + "first generated beat, so disable a passed scene there or it stays on through the downtime.",
  },
  preset: {
    title: "Preset",
    fields: "effects.preset",
    text: "A sampler preset for this beat's replies: an installed preset name of the connection's own API (matched exactly), or {name, settings}. It overlays only the "
      + "samplers the request already sends, for this beat only, and never changes the selected preset. Text and Chat Completion only.",
  },
  background: {
    title: "Background",
    fields: "effects.background",
    text: "A SillyTavern background file the scene switches to when the beat starts: \"tavern night.jpg\" or {name}. Applied again on reopen. Use the exact file name on the "
      + "install (lookupBackgrounds), or leave the background out; a name the install lacks switches nothing.",
  },
  scenario: {
    title: "Scenario",
    fields: "effects.scenario",
    text: "The chat's scenario text from this beat on; in a group it replaces every member card's scenario. Text sets it, \"\" or null clears it, a beat without the key keeps "
      + "the one before. Framing only: genre, place, the arc's name; never a secret, a twist or the final foe. Held until requirements are met; a scenario the user typed is never overwritten.",
  },
  "cast-changes": {
    title: "Cast changes",
    fields: "effects.cast_changes",
    text: "{enable: [card names], disable: [card names]} switches group members on or off when the beat starts. Disable everyone who enters later at the start beat, and "
      + "enable each one at the beat where they enter. It changes the group itself, not just the chat. Every name needs a card on the install.",
  },
  "opening-scene": {
    title: "The opening scene",
    fields: "first_mes, new_chat_only, cast_changes",
    text: "In a group every card with a first message greets at once. Give a first message only to characters present in the start beat, for that scene only: no secret, twist "
      + "or later reveal. Everyone else gets none, and enters through cast_changes. A story-owned opener is a scripted onEnter npc_reply with new_chat_only, which posts only into an empty chat. "
      + "A greeting that addresses the player (\"you are the pawnbroker\") makes that role the player's: no card plays it.",
  },
  "npc-replies": {
    title: "NPC replies",
    fields: "effects.npc_replies[]",
    text: "Lines a character speaks on their own: trigger onEnter (the beat starts), afterSpeak (after a character reply; after_member narrows whose) or sceneBreak. "
      + "kind scripted posts text verbatim; kind llm generates from an instruction. maxTriggers caps repeats, probability is a seeded chance, enabled: false parks one. "
      + "Use scripted for a line that must be exact, llm for a reaction that must fit the moment. A scripted line has no time or place check, so word it to fit wherever it fires.",
  },
  "experimental-effects": {
    title: "Experimental effects",
    fields: "effects.reasoning, complications",
    text: "reasoning (off, low, medium or high) asks for a reasoning effort on this beat's replies; complications are lines "
      + "released into a stalled beat. Both are spikes that run only where their switch is on. Do not rely on either for the story to work.",
  },
  gates: {
    title: "Gates",
    fields: "transitions[].gate",
    text: "A condition over qualities: {q, op, v} with ==, !=, >=, <=, >, <, in (in takes a list), combined with {all: []}, {any: []}, {not: gate}. Declare the quality "
      + "first, use an operator its type allows and only values it lists. Gate on what the chat will visibly show; a gate on a thought, a mood or an off-screen event never opens. "
      + "A way out that asks only what the way in, or an earlier way out on the route, already required fires at once: gate each exit on what happens in that checkpoint.",
  },
  transitions: {
    title: "Transitions",
    fields: "transitions[].from, to, priority, extraction_hint, extractor_trigger",
    text: "An edge between beats with a gate. When several gates hold at once, the highest priority fires; one transition per turn. extraction_hint tells the reader what to "
      + "watch for at this exit (\"the toll is paid or refused\"); extractor_trigger is a text cue that forces a read. Every beat should lead on, or the story stops there.",
  },
  convergence: {
    title: "Convergence",
    fields: "checkpoints[].convergence_threshold, transitions[].effects.progress",
    text: "Each anchor has a code counter, progress toward it. A transition's progress effect {anchor, amount} adds to it, and generated bridge beats must sum to the "
      + "anchor's threshold. convergence_threshold overrides the sum. A threshold no route can reach means the story cannot converge on that anchor.",
  },
  "arc-bridges": {
    title: "Thread bridges",
    fields: "arc_bridges[]",
    text: "{arcMatch, anchor, amount}: when the memory confirms a story thread resolved whose words match arcMatch, progress toward that anchor rises by amount. A side plot "
      + "can then move the main one. anchor must be an anchor beat.",
  },
  "talk-control": {
    title: "Speaker direction",
    fields: "checkpoints[].talk_control",
    text: "Who speaks next in a group: speakers [{member, weight}], lead (picked first), no_repeat, allow_silence (needs the director), director (an AI picks the speaker), "
      + "chain (several voices answer one message: mode director or scripted with a sequence, max, stop_on_transition, stop_on_player, hold_extraction). List the lead in "
      + "speakers, or it joins at weight 1. A name nobody has is skipped.",
  },
  stagecraft: {
    title: "Curator scope",
    fields: "stagecraft.lorebooks, stagecraft.exclude",
    text: "The only lorebooks the World Info curator may edit: the story's own books. The curator enables, disables, rewrites or patches existing entries; it cannot create one, "
      + "so author every entry it should keep current. It never touches an entry a beat's world_info gates. An empty list means no curator writes. "
      + "exclude [{lorebook, comments}] names entries in those books it is never shown and never writes, such as a house-style entry. "
      + "In an entry, {{// so:protect}} ... {{// so:end}} marks words it may never change or switch off; {{// so:auto}} lets its changes apply without review in auto mode. "
      + "SillyTavern drops these markers before the prompt.",
  },
  "lore-select": {
    title: "Lore select",
    fields: "lore_select.lorebooks, top_k, min_p, exclusive",
    text: "Books whose entries the judge picks per reply, even without their keywords; top_k (1 to 12) caps the picks, min_p (0 to 1) the confidence. exclusive also switches "
      + "off the unpicked entries for that reply. Require each book under requirements, or it may not be active.",
  },
  "scene-read": {
    title: "Scene places and times",
    fields: "scene_read.locations, times, inject",
    text: "The places and times the scene tracker may pick from. It only picks from a list, so name short places (\"guild hall\", \"north road\"), or make a quality keyed "
      + "location an enum. inject: false keeps the read out of the prompt.",
  },
  "house-rules": {
    title: "House rules",
    fields: "house_rules[]",
    text: "Up to 8 rules (240 characters each) every reply is checked against. One rule, one demand: \"Magic is never used inside the city walls.\" Not \"No magic in the "
      + "city and keep replies short.\" The check asks one question per rule, so a compound rule is judged on whichever half the model reads.",
  },
  chapters: {
    title: "Chapters",
    fields: "chapters[], checkpoints[].chapter, memory.story_so_far",
    text: "Optional acts: {id, title, player_title, kind (chapter or interlude), final, seal}. Once one exists every beat names one. A sealed chapter is written up as a record; "
      + "seal sets open_threads (carry, close, decide), keep_tail, fold_messages, record_style. Mark the last chapter final; never lead back into an earlier chapter.",
  },
  presentation: {
    title: "Illustrations and display",
    fields: "illustrations, checkpoints[].illustrate, chapters[].illustrations, Public appearance:, display.lore_names_public, effects.stage",
    text: "illustrations {checkpoints, scenes, style, appearances} asks for pictures of beats and scenes in one style, with each cast member's look; never describe a secret "
      + "form there. illustrate: false skips a beat's pictures; chapters[].illustrations {style, appearances} overrides the look for one chapter. A lore entry's look is "
      + "used once it has fired in the chat, or always from a \"Public appearance:\" line. effects.stage {framing, spotlight, cast} places sprites for a beat. "
      + "display.lore_names_public shows lore names in the timeline; off when one spoils. display.continue_list|group_card|chapter_card|wand|roll_chips|suggestions false hides it.",
  },
  quests: {
    title: "Quests and milestones",
    fields: "quests[], visible_when, offered_when, done_when, failed_when, steps[], requires, progress, labels, giver, reward, milestones[]",
    text: "Status is computed every turn: hidden until visible_when (the acceptance), offered (never fails) while offered_when holds, then active, done or failed (failed wins); the end latches. "
      + "done_when defaults to every step done or progress {quality, of} reached; requires adds another quest's done gate. reward lands once: set writes code qualities, "
      + "effects switch world_info, cast_changes, npc_replies (onEnter); a swipe takes it back. Milestones {id, title, when, secret}; a secret one is unlisted until earned.",
  },
  checks: {
    title: "Checks",
    fields: "checkpoints[].checks[], transitions[].check, roll, modifiers[], narrate, outcome, twist",
    text: "A seeded roll once per visit: {id, label, quality (code bool), roll {sides, target, dice}, modifiers [{q, v, add, label}], narrate public|hidden}. "
      + "Total = dice + modifiers that hold, read each turn; quality is total >= target. outcome {quality, bands: margin, partial_margin} writes miss|weak|strong; "
      + "twist {quality} marks matching dice. A transition check is attempted when the rest of its gate holds. The next reply is told the outcome; public adds a chip.",
  },
  widgets: {
    title: "Stats and story panels",
    fields: "qualities[].display, widgets[], bind, audience, display.journal, display.stat_sheet, display.widgets",
    text: "display {public: true, label, as: item|count|meter|boxes|word, group, min, max, bands, hide_when_empty, trend} puts a quality on the Stat sheet; never on rel_* "
      + "or a gated lore key. widgets [{id, kind: meters|track|log|clock|board, title, bind, audience}] bind by reference (\"quality:key\", {qualities}, {group}, quests, path, arcs); "
      + "no markup. A player widget shows public qualities only; empty sections never render.",
  },
  "character-life": {
    title: "Character life",
    fields: "roster[].relationships, roster[].mood, roster[].agenda, roster[].schedule, clock",
    text: "relationships [{toward: id|player, axes, range, step, start, label}] compile to rel_<holder>_<toward>_<axis> ratings: start until read, read as up or down (never a level) while "
      + "both are present, at most step a turn, seen only by the holder and Author view. mood {baseline, values, lasts}: re-read after a scene change, else "
      + "baseline. agenda [{id, goal, steps [{text, when, effect: world_info|npc_replies, public, repeat}], pace per_n_boundaries|per_chapter (needs chapters), "
      + "every}] moves in code, never on OOC. schedule [{when, at}]: away drops a member from speakers; addressed, the narrator says they are not here. "
      + "clock {times, start_day}: time_of_day a step a turn, story_day counts wraps.",
  },
} as const satisfies Record<string, GuideTopic>;

export type GuideTopicId = keyof typeof GUIDE_TOPICS;

export const GUIDE_TOPIC_IDS = Object.keys(GUIDE_TOPICS) as GuideTopicId[];

type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];

export const DIAGNOSTIC_GUIDE_TOPIC: Record<DiagnosticCode, GuideTopicId> = {
  "undeclared-quality": "gates",
  "op-type-mismatch": "gates",
  "enum-value-invalid": "gates",
  "anchor-unreachable": "transitions",
  "quality-out-of-scope": "quality-reads",
  "quality-never-in-scope": "qualities",
  "snapshot-latching-conflict": "latching",
  "stub-no-anchor": "checkpoints",
  "threshold-unsatisfiable": "convergence",
  "talk-member-unknown": "talk-control",
  "guidance-member-unknown": "guidance",
  "talk-lead-outside-speakers": "talk-control",
  "talk-silence-without-director": "talk-control",
  "talk-chain-member-unknown": "talk-control",
  "talk-chain-empty": "talk-control",
  "agency-alternate-unknown": "objective-agency",
  "agency-alternate-is-self": "objective-agency",
  "scene-read-location-empty": "scene-read",
  "lore-select-inactive": "lore-select",
  "lore-select-exclusive-empty": "lore-select",
  "quality-hint-no-criteria": "quality-reads",
  "quality-hint-latching-note": "quality-reads",
  "quality-criteria-self-exclusion": "quality-reads",
  "latching-enum-placeholder": "latching",
  "quality-rating-no-scale": "quality-reads",
  "quality-outcome-player-evidence": "quality-reads",
  "house-rule-compound": "house-rules",
  "checkpoint-inherits-author-note": "author-note",
  "world-info-rests-off": "world-info",
  "motive-member-unknown": "drives-motives",
  "motive-for-player": "drives-motives",
  "chapter-missing": "chapters",
  "chapter-unknown": "chapters",
  "chapter-unreachable": "chapters",
  "chapter-no-exit": "chapters",
  "chapter-reentry": "chapters",
  "story-dead-end": "chapters",
  "requirement-member-roster-id": "requirements",
  "cast-member-no-card": "cast-changes",
  "background-missing": "background",
  "roster-member-is-player": "roster",
  "cast-change-unknown-member": "cast-changes",
  "requirement-persona-missing": "requirements",
  "gate-open-on-arrival": "gates",
  "cast-member-never-enabled": "cast-changes",
  "briefing-spoiler-risk": "briefing",
  "story-kind-invalid": "story-basics",
  "opener-uses-player-name": "player",
  "player-spoiler-risk": "player",
  "agenda-pace-no-chapters": "character-life",
  "stage-sprite-unknown": "presentation",
};

export const STAGE_GUIDE_TOPICS: Record<CopilotStage, readonly GuideTopicId[]> = {
  qualities: ["quality-rubric", "latching", "chance-roll"],
  checkpoints: ["checkpoints", "objective-agency"],
  transitions: ["gates", "transitions"],
  effects: ["opening-scene", "drives-motives", "requirements"],
  provisioning: ["opening-scene", "requirements"],
};

export const renderGuideTopic = (id: GuideTopicId): string => {
  const topic = GUIDE_TOPICS[id];
  return `${topic.title} (${topic.fields})\n${topic.text}`;
};

export const renderStageGuide = (stage: CopilotStage): string =>
  `Author's guide, for this stage:\n${STAGE_GUIDE_TOPICS[stage].map((id) => `- ${GUIDE_TOPICS[id].title}: ${GUIDE_TOPICS[id].text}`).join("\n")}`;

const isTopic = (value: string): value is GuideTopicId => Object.hasOwn(GUIDE_TOPICS, value);

export const readGuide = (topic: unknown): string => {
  const typed = typeof topic === "string" ? topic.trim().toLowerCase() : "";
  if (isTopic(typed)) return renderGuideTopic(typed);
  const near = typed ? nearestKey(typed, GUIDE_TOPIC_IDS) : null;
  const known = `Topics: ${GUIDE_TOPIC_IDS.join(", ")}.`;
  if (!typed) return `Name a topic. ${known}`;
  return `No guide topic "${typed}"${near ? ` (did you mean "${near}"?)` : ""}. ${known}`;
};
