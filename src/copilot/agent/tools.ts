import { isRecord } from "@utils/guards";
import { nearestKey } from "@utils/levenshtein";
import type { ProvisioningOpKind } from "@wizard/index";
import type * as Mutations from "../../studio/mutations";
import { parseProposal } from "../index";
import type { ProposalOpKind } from "../types";
import type { AgentOnlyOp, AgentOp, AgentToolCall, AgentToolFamily } from "./types";

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
  backedBy?: keyof typeof Mutations;
}

export type DraftOpKind = Exclude<ProposalOpKind, ProvisioningOpKind>;

const req = (type: AgentArgType, doc: string): AgentArgSpec => ({ type, required: true, doc });
const opt = (type: AgentArgType, doc: string): AgentArgSpec => ({ type, required: false, doc });

const ID = req("string", "checkpoint id");
const REF = req("object", "{from, to, priority?} naming one transition");
const QUALITY = "{key, type: string|int|float|bool|enum, values?: string[], source: \"extractor\", rubric, latching?: boolean}";
const CHECKPOINT = "{id, name, objective, type: anchor|intermediate, tension_target?, guidance?, agency?, talk_control?, convergence_threshold?}";
const GATE = "{q, op: ==|!=|>=|<=|>|<|in, v} | {all: gate[]} | {any: gate[]} | {not: gate}";

type EditSpec = Omit<AgentToolSpec, "name" | "family"> & { backedBy: keyof typeof Mutations };

export const EDIT_TOOLS = {
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
    backedBy: "setCheckpointEffects",
    doc: "Replace a beat's effects: author_note, world_info, cast_changes, npc_replies, background.",
    args: { id: ID, effects: req("object", "the whole effects block") },
  },
  addTransition: { backedBy: "addTransition", doc: "Connect two beats with a gate.", args: { transition: req("object", `{from, to, gate: ${GATE}, priority, extraction_hint?}`) } },
  updateTransition: { backedBy: "updateTransition", doc: "Patch a transition (priority, extraction_hint, effects).", args: { ref: REF, patch: req("object", "fields of the transition to change") } },
  removeTransition: { backedBy: "removeTransition", doc: "Remove a transition.", args: { ref: REF } },
  setTransitionGate: { backedBy: "setTransitionGate", doc: "Replace a transition's gate.", args: { ref: REF, gate: req("object", GATE) } },
  addRosterMember: { backedBy: "addRosterMember", doc: "Add a cast member.", args: { member: req("object", "{id, name?, role?}") } },
  updateRosterMember: { backedBy: "updateRosterMember", doc: "Patch a cast member's name or role.", args: { id: req("string", "member id"), patch: req("object", "{name?, role?}") } },
  removeRosterMember: { backedBy: "removeRosterMember", doc: "Remove a cast member.", args: { id: req("string", "member id") } },
  setArcTemplate: { backedBy: "setArcTemplate", doc: "Set the dramatic shape, or null to clear it.", args: { template: req("value", "a template name, a custom curve, or null") } },
  setArcBridges: { backedBy: "setArcBridges", doc: "Replace the thread bridges (the full list).", args: { bridges: req("array", "[{arcMatch, anchor, amount}]") } },
  setRequirements: { backedBy: "setRequirements", doc: "Replace what the story requires to run.", args: { requirements: req("object", "{personas?, members?, lorebooks?}") } },
  setStagecraft: { backedBy: "setStagecraft", doc: "Replace the curator's lorebook scope.", args: { stagecraft: req("object", "{lorebooks: string[]}") } },
  setSceneRead: { backedBy: "setSceneRead", doc: "Replace the scene places and times.", args: { sceneRead: req("object", "{locations?, times?, inject?}") } },
  setLoreSelect: { backedBy: "setLoreSelect", doc: "Replace the lore-select books.", args: { loreSelect: req("object", "{lorebooks, top_k?}") } },
  setHouseRules: { backedBy: "setHouseRules", doc: "Replace the house rules (the full list).", args: { rules: req("array", "one rule per string") } },
} satisfies Record<DraftOpKind | AgentOnlyOp["kind"], EditSpec>;

export const PROVISION_TOOLS = {
  createCharacterCard: {
    doc: "Create a NEW character card on the install. Always reviewed by the author; never edits an existing card.",
    args: {
      name: req("string", "card name"), description: req("string", "card description"), role: opt("string", "role in this story"), personality: opt("string", ""),
      scenario: opt("string", ""), first_mes: opt("string", ""), mes_example: opt("string", ""), tags: opt("array", "string[]"),
    },
  },
  createStoryLorebook: { doc: "Create this story's own NEW lorebook. Always reviewed by the author.", args: { name: req("string", "lorebook name") } },
  upsertLorebookEntry: {
    doc: "Write an entry into a lorebook this story created. Always reviewed by the author.",
    args: {
      lorebook: req("string", "a lorebook this story owns"), comment: req("string", "entry title"), keys: req("array", "keywords"),
      content: req("string", "entry text"), constant: opt("boolean", "always in context"),
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
  readQualityUsage: { family: "read", doc: "Where a quality is read: gates and snapshots.", args: { key: req("string", "quality key") } },
  readGateOptions: { family: "read", doc: "The operators and a sample value a gate on this quality may use.", args: { key: req("string", "quality key") } },
  readCoverage: { family: "read", doc: "Fields this story does not use yet, and what each would add.", args: {} },
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

export const MUTATIONS_WITHOUT_A_TOOL: Partial<Record<keyof typeof Mutations, string>> = {
  nextId: "id helper",
  newQuality: "constructor; addQuality takes the full quality",
  newCheckpoint: "constructor; addCheckpoint takes the full checkpoint",
  newTransition: "constructor; addTransition takes the full transition",
  newRosterMember: "constructor; addRosterMember takes the full member",
  newArcBridge: "constructor; setArcBridges takes the full list",
  addArcBridge: "covered by setArcBridges",
  updateArcBridge: "covered by setArcBridges",
  removeArcBridge: "covered by setArcBridges",
  clearStartCheckpoint: "setStartCheckpoint moves the start; a story without one does not validate",
  setStoryId: "the story's identity is the author's, set in the Story tab",
  addChapter: "chapters have no proposal op yet; the wizard's setChapters op is open",
  updateChapter: "chapters have no proposal op yet; the wizard's setChapters op is open",
  removeChapter: "chapters have no proposal op yet; the wizard's setChapters op is open",
  setCheckpointChapter: "chapters have no proposal op yet; the wizard's setChapters op is open",
  setChapterPolicy: "chapters have no proposal op yet; the wizard's setChapters op is open",
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

export const checkToolCall = (call: AgentToolCall): ToolCheck => {
  const spec = Object.hasOwn(AGENT_TOOLS, call.tool) ? AGENT_TOOLS[call.tool] : undefined;
  if (!spec) return { ok: false, message: `unknown tool "${call.tool}"${hint(call.tool, AGENT_TOOL_NAMES)}. Only the listed tools exist; there is no other way to change the story or the install.` };
  const known = Object.keys(spec.args);
  const unknown = Object.keys(call.args).filter((key) => !known.includes(key));
  if (unknown.length) return { ok: false, message: unknown.map((key) => `${call.tool}: unknown argument "${key}"${hint(key, known)}`).join("; ") };
  const problems = Object.entries(spec.args).flatMap(([name, arg]) => {
    const value = call.args[name];
    if (value === undefined) return arg.required ? [`${call.tool}: missing argument "${name}"`] : [];
    return typeMatches(arg.type, value) ? [] : [`${call.tool}.${name}: expected ${arg.type}`];
  });
  if (problems.length) return { ok: false, message: problems.join("; ") };
  if (spec.family !== "edit" && spec.family !== "provision") return { ok: true, spec };
  if (call.tool === "setHouseRules") {
    const rules = (Array.isArray(call.args.rules) ? call.args.rules : []).filter((rule): rule is string => typeof rule === "string" && rule.trim().length > 0);
    return { ok: true, spec, op: { kind: "setHouseRules", rules } };
  }
  const parsed = parseProposal(JSON.stringify({ summary: "", ops: [{ ...call.args, kind: call.tool }] }));
  const issues = parsed.issues.map((issue) => issue.replace(/^ops\.0/, call.tool));
  const op = parsed.proposal.ops[0];
  if (!op || issues.length) return { ok: false, message: issues.join("; ") || `${call.tool}: arguments did not parse` };
  return { ok: true, spec, op };
};
