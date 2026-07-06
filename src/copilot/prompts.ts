import { GATE_OPERATORS, QUALITY_SOURCES, QUALITY_TYPES, TENSION_LEVELS, type StoryV2 } from "@engine/index";
import type { CopilotMessage, CopilotStage, DriverContext } from "./types";

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
  '  { "kind": "addRosterMember", "member": { "id": string, "name"?: string } }',
  '  { "kind": "updateRosterMember", "id": string, "patch": { "name"?: string } }',
  '  { "kind": "removeRosterMember", "id": string }',
  "Transitions are referenced by { from, to }, never by index. Only reference ids that already exist in the draft.",
].join("\n");

const STAGE_INSTRUCTIONS: Record<CopilotStage, string> = {
  qualities: "Stage QUALITIES: propose the quality set that measures this story's dramatic state. Every quality needs a rubric question. Prefer extractor source unless the value is purely code-driven. Only emit setStoryField/addQuality/updateQuality/removeQuality ops.",
  checkpoints: "Stage CHECKPOINTS: propose anchor and intermediate checkpoints with objectives, tension targets, and state_snapshots for pivotal or latching qualities. Keep exactly one start checkpoint. Only emit addCheckpoint/updateCheckpoint/setStartCheckpoint/setCheckpointSnapshot ops.",
  transitions: "Stage TRANSITIONS: wire checkpoints toward their anchors with transitions, each carrying a gate over declared qualities and a progress effect toward the target anchor so the convergence threshold is reachable. Only emit addTransition/updateTransition/setTransitionGate ops.",
  effects: "Stage EFFECTS/CAST: propose checkpoint effects (author_note, world_info, cast_changes) and roster members that fit the story. Only emit setCheckpointEffects/addRosterMember/updateRosterMember ops.",
};

const renderHistory = (history: CopilotMessage[]): string =>
  history.length ? `Conversation so far:\n${history.map((message) => `${message.role}: ${message.text}`).join("\n")}` : "";

export const renderStagePrompt = (stage: CopilotStage, draft: StoryV2, message: string, history: CopilotMessage[]): string =>
  [
    "You are a story-authoring copilot building a format-2 interactive story with the author.",
    SCHEMA_SUMMARY,
    OP_GRAMMAR,
    STAGE_INSTRUCTIONS[stage],
    "Stay consistent with the current draft — reference existing ids, do not duplicate them.",
    `Current draft (JSON):\n${JSON.stringify(draft)}`,
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
