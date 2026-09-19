import { ARC_TEMPLATE_NAMES, GATE_OPERATORS, QUALITY_SOURCES, QUALITY_TYPES, TENSION_LEVELS, type StoryV2 } from "@engine/index";
import type { ProvisioningEnvironment } from "@wizard/index";
import type { CopilotMessage, CopilotStage, DriverContext } from "./types";

export type WizardEnvironmentView = ProvisioningEnvironment;

const SCHEMA_SUMMARY = [
  "Format-2 story vocabulary:",
  `- quality: { key, type: ${QUALITY_TYPES.join("|")}, source: ${QUALITY_SOURCES.join("|")}, rubric, values?[] (enum only), latching?, monotonic? }. rubric MUST be a yes/no or short-answer question an extractor answers from the prose.`,
  `- checkpoint: { id, name, objective, type: anchor|intermediate, start?, state_snapshot?{ quality: value }, tension_target?: ${TENSION_LEVELS.join("|")}, convergence_threshold? (anchors), guidance? }`,
  "- transition: { from, to, gate, priority, effects?{ progress:{ anchor, amount } }, extractor_trigger?, extraction_hint? }",
  `- gate leaf: { "q": quality_key, "op": ${GATE_OPERATORS.join("|")}, "v": literal }; compose with { "all":[...] }, { "any":[...] }, { "not": gate }. Only "in" takes an array value.`,
  "Never invent quality keys inside a gate — declare the quality first.",
].join("\n");

const OP_GRAMMAR = [
  'Return exact JSON only: { "summary": string, "ops": Op[] }. No prose outside the JSON.',
  "Op kinds:",
  '  { "kind": "setStoryField", "field": "title"|"description", "value": string }',
  '  { "kind": "addQuality", "quality": Quality }',
  '  { "kind": "updateQuality", "key": string, "patch": Partial<Quality> }',
  '  { "kind": "removeQuality", "key": string }',
  '  { "kind": "addCheckpoint", "checkpoint": Checkpoint }',
  '  { "kind": "updateCheckpoint", "id": string, "patch": Partial<Checkpoint> }',
  '  { "kind": "removeCheckpoint", "id": string }',
  '  { "kind": "setStartCheckpoint", "id": string }',
  '  { "kind": "setCheckpointSnapshot", "id": string, "snapshot": { quality: value } }',
  '  { "kind": "setCheckpointEffects", "id": string, "effects": Effects }',
  '  { "kind": "addTransition", "transition": Transition }',
  '  { "kind": "updateTransition", "ref": { "from": string, "to": string }, "patch": Partial<Transition> }',
  '  { "kind": "removeTransition", "ref": { "from": string, "to": string } }',
  '  { "kind": "setTransitionGate", "ref": { "from": string, "to": string }, "gate": Gate }',
  '  { "kind": "addRosterMember", "member": { "id": string, "name"?: string, "role"?: string } }',
  '  { "kind": "updateRosterMember", "id": string, "patch": { "name"?: string, "role"?: string } }',
  '  { "kind": "removeRosterMember", "id": string }',
  `  { "kind": "setArcTemplate", "template": ${ARC_TEMPLATE_NAMES.map((name) => `"${name}"`).join("|")}|{ "points": [{ "at": 0-1, "tension": 0-1 }] }|null }`,
  '  { "kind": "setArcBridges", "bridges": [{ "arcMatch": string, "anchor": checkpoint_id, "amount": number }] }',
  '  { "kind": "setRequirements", "requirements": { "personas"?: string[], "members"?: string[], "lorebooks"?: string[] } }',
  '  { "kind": "setStagecraft", "stagecraft": { "lorebooks": string[] } }',
  '  { "kind": "setLoreSelect", "loreSelect": { "lorebooks": string[], "top_k"?: number } }',
  '  { "kind": "setSceneRead", "sceneRead": { "locations": string[], "times"?: string[], "inject"?: boolean } }',
  "Transitions are referenced by { from, to }, never by index. Only reference ids that already exist in the draft.",
  "setArcBridges, setRequirements, setStagecraft, setSceneRead and setLoreSelect replace the whole list — send the full intended set, never a fragment.",
].join("\n");

const PROVISIONING_GRAMMAR = [
  "Provisioning ops create the SillyTavern assets this story needs. They never modify anything that already exists:",
  '  { "kind": "createCharacterCard", "name": string, "description": string, "role"?: string, "personality"?: string, "scenario"?: string, "first_mes"?: string, "mes_example"?: string, "tags"?: string[] }',
  '  { "kind": "createStoryLorebook", "name": string }',
  '  { "kind": "upsertLorebookEntry", "lorebook": string, "comment": string, "keys": string[], "content": string, "constant"?: boolean }',
  '  { "kind": "createGroup", "name": string, "members": string[] }',
  "Order matters: create a card before a group that lists it, and the story lorebook before its entries.",
  "Never name an existing character, an existing lorebook or an existing group — those ops are rejected.",
  "upsertLorebookEntry may only target the story's own lorebook, never one of the user's other books.",
  "Never propose creating or changing a persona: personas are the author's own.",
].join("\n");

// The interview (spec addendum §Story wizard). The failure mode this fixes is inventing specifics on
// a thin premise, so asking is only allowed when the answer actually changes the proposal.
const INTERVIEW_PROTOCOL = [
  'Instead of proposing, you MAY interview the author first: { "summary": string, "questions": [{ "id": string, "text": string, "why"?: string, "options"?: string[] }] } with at most 3 questions and no "ops" key.',
  "Ask only when the premise genuinely underdetermines this stage and a wrong guess would be wasted work. If you can proceed on reasonable defaults, propose instead of asking.",
  "Offer concrete `options` where a small set of choices covers the space. The author may answer any question with \"you decide\" — then proceed under your own defaults and say in the summary which ones you picked.",
  "Never ask the same question twice; the conversation above already contains every answer you were given.",
].join("\n");

const STAGE_INSTRUCTIONS: Record<CopilotStage, string> = {
  qualities: "Stage QUALITIES: propose the quality set that measures this story's dramatic state. Every quality needs a rubric question. Prefer extractor source unless the value is purely code-driven. An extractor quality whose answer is plainly visible in the text may carry read_as (\"choice\" for bool/enum, \"stated\" for a number or name the text states, \"rating\" for a described scale) so a judge can read it every turn; leave read_as out when the answer needs inference. Only emit setStoryField/addQuality/updateQuality/removeQuality ops.",
  checkpoints: "Stage CHECKPOINTS: propose anchor and intermediate checkpoints with objectives, tension targets, and state_snapshots for pivotal or latching qualities. Keep exactly one start checkpoint. Only emit addCheckpoint/updateCheckpoint/setStartCheckpoint/setCheckpointSnapshot ops.",
  transitions: "Stage TRANSITIONS: wire checkpoints toward their anchors with transitions, each carrying a gate over declared qualities and a progress effect toward the target anchor so the convergence threshold is reachable. Only emit addTransition/updateTransition/setTransitionGate ops.",
  effects: "Stage EFFECTS/CAST: propose checkpoint effects (author_note, world_info, cast_changes, background — a background filename that suits the scene), the roster this story directs (each member with a one-line role: what they do in this story), what the chat must provide before it can run (requirements), which lorebooks the background curator may edit (stagecraft — the story's own books only), the places the story happens in (sceneRead.locations — short names the scene tracker can pick from), which of the story's own lorebooks lore-select may pick entries from each turn (loreSelect.lorebooks), the dramatic shape, and any thread bridges. Only emit setCheckpointEffects/addRosterMember/updateRosterMember/removeRosterMember/setRequirements/setStagecraft/setSceneRead/setLoreSelect/setArcTemplate/setArcBridges/setStoryField ops.",
  provisioning: "Stage PROVISIONING: this story's requirements name people, lore and a group that may not exist on this install yet. Propose the create steps that close exactly that gap — one card per cast member the story directs (each with a one-line \"role\": what they do in this story), the story's own lorebook plus the entries the story leans on, and the group that plays it. Only emit createCharacterCard/createStoryLorebook/upsertLorebookEntry/createGroup ops. Propose nothing for assets the environment below already lists.",
};

const renderEnvironment = (environment?: WizardEnvironmentView): string => {
  if (!environment) return "";
  const list = (values: string[]) => (values.length ? values.join(", ") : "(none)");
  return [
    "This install already has (never create or edit these):",
    `- characters: ${list(environment.characterNames)}`,
    `- lorebooks: ${list(environment.lorebookNames)}`,
    `- groups: ${list(environment.groupNames)}`,
    `- this story's own lorebooks (entries may be written here): ${list(environment.storyLorebooks)}`,
  ].join("\n");
};

const renderHistory = (history: CopilotMessage[]): string =>
  history.length ? `Conversation so far:\n${history.map((message) => `${message.role}: ${message.text}`).join("\n")}` : "";

export const renderStagePrompt = (stage: CopilotStage, draft: StoryV2, message: string, history: CopilotMessage[], environment?: WizardEnvironmentView): string =>
  [
    "You are a story-setup wizard building a format-2 interactive story with the author, from premise to playable.",
    stage === "provisioning" ? "" : SCHEMA_SUMMARY,
    stage === "provisioning" ? PROVISIONING_GRAMMAR : OP_GRAMMAR,
    stage === "provisioning" ? 'Return exact JSON only: { "summary": string, "ops": Op[] }. No prose outside the JSON.' : "",
    INTERVIEW_PROTOCOL,
    STAGE_INSTRUCTIONS[stage],
    "Stay consistent with the current draft — reference existing ids, do not duplicate them.",
    `Current draft (JSON):\n${JSON.stringify(draft)}`,
    renderEnvironment(stage === "provisioning" ? environment : undefined),
    renderHistory(history),
    message ? `Author: ${message}` : "",
    "Respond with the JSON object only.",
  ]
    .filter((part) => part.length > 0)
    .join("\n\n");

const renderAnchors = (context: DriverContext): string =>
  context.upcomingAnchors.length
    ? context.upcomingAnchors.map((anchor) => `${anchor.name} (${anchor.progress}/${anchor.threshold})`).join("\n")
    : "(none)";

const renderBlackboard = (context: DriverContext): string => {
  const entries = Object.entries(context.blackboard);
  return entries.length ? entries.map(([key, value]) => `${key}=${String(value)}`).join("\n") : "(empty)";
};

export const renderSuggestPrompt = (context: DriverContext): string =>
  [
    "You are an in-play story driver. Suggest 2-3 concrete next developments that move toward the active objective and the unmet gate conditions. Cite the blackboard values each suggestion relies on.",
    `Active checkpoint: ${context.activeCheckpointId ?? "(none)"} — ${context.activeObjective || "(no objective)"}`,
    `Unmet gate conditions:\n${context.unmetGates.length ? context.unmetGates.join("\n") : "(none)"}`,
    `Upcoming anchors:\n${renderAnchors(context)}`,
    `Blackboard:\n${renderBlackboard(context)}`,
    `Canon:\n${context.canon || "(none)"}`,
    `Recent chat:\n${context.recentChat || "(none)"}`,
    'Return exact JSON only: { "suggestions": [{ "title": string, "rationale": string }] }',
  ].join("\n\n");

export const renderReportPrompt = (context: DriverContext): string =>
  [
    "You are an in-play story driver. Write a concise world-progression report: where the story stands, what is resolved, what remains open, and momentum toward the next anchor. Ground every claim in the state below.",
    `Active checkpoint: ${context.activeCheckpointId ?? "(none)"} — ${context.activeObjective || "(no objective)"}`,
    `Upcoming anchors:\n${renderAnchors(context)}`,
    `Blackboard:\n${renderBlackboard(context)}`,
    `Canon:\n${context.canon || "(none)"}`,
    "Return prose only, 4-8 sentences. No JSON, no lists.",
  ].join("\n\n");
