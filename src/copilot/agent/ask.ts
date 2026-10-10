import type { StoryV2 } from "@engine/index";
import { isRecord } from "@utils/guards";
import { normalizeJsonText } from "@utils/json";
import { nearestKey } from "@utils/levenshtein";
import { truncate } from "@utils/string";
import { projectionText, type PlayedProjection } from "@runtime/playerProjection";
import { ALL_AUDIENCES, findTopic, PLAYER_AUDIENCES, readKnowledge, searchKnowledge, type KnowledgeAudience, type KnowledgeShowMe, type KnowledgeTopic } from "../knowledge/index";
import { DIAGNOSTIC_GUIDE_TOPIC, readGuide } from "../guideTopics";
import { readRecipe } from "./recipes";
import { runDiagnostics } from "../../studio/diagnostics";
import { runReadTool } from "./readTools";
import { AGENT_TOOLS, argProblems, renderArg, toolHint, type AgentToolSpec, type ReadToolName } from "./tools";
import type { AgentLookup, AgentToolCall } from "./types";

export type AskPersona = "author" | "player";

const req = (doc: string) => ({ type: "string" as const, required: true, doc });

export const ASK_ONLY_TOOLS: Record<string, AgentToolSpec> = {
  readKnowledge: { name: "readKnowledge", family: "read", doc: "One knowledge topic by id: how this plugin or SillyTavern does something.", args: { topic: req("a topic id from searchKnowledge") } },
  searchKnowledge: { name: "searchKnowledge", family: "read", doc: "Find knowledge topics by a few words; returns ids, titles and a snippet.", args: { query: req("a few words") } },
  readPlayed: { name: "readPlayed", family: "read", doc: "What the player has played so far: the scenes reached, where they are now, what is open and the recent messages.", args: {} },
  readLiveState: { name: "readLiveState", family: "read", doc: "This chat's live story state, author detail included: checkpoint, values, what the machine is doing, setup findings.", args: {} },
  readRecommendations: { name: "readRecommendations", family: "read", doc: "What to fix in the story draft, in plain words, each with the guide topic that explains it.", args: {} },
};

const DRAFT_READ_TOOLS: readonly ReadToolName[] = [
  "readStory", "readCheckpoint", "readGraph", "readDiagnostics", "readValidation", "readQualityUsage", "readGateOptions", "readCoverage", "readGuide", "readRecipe",
  "simulateReachability", "simulateWalk", "lookupCharacters", "lookupLorebooks", "lookupGroups", "lookupBackgrounds",
];

export const AUTHOR_ASK_TOOLS: readonly string[] = ["searchKnowledge", "readKnowledge", "readRecommendations", "readLiveState", ...DRAFT_READ_TOOLS];

export const PLAYER_ASK_TOOLS: readonly string[] = ["searchKnowledge", "readKnowledge", "readPlayed"];

export const askToolsFor = (persona: AskPersona): readonly string[] => (persona === "player" ? PLAYER_ASK_TOOLS : AUTHOR_ASK_TOOLS);

export const askAudiences = (persona: AskPersona): readonly KnowledgeAudience[] => (persona === "player" ? PLAYER_AUDIENCES : ALL_AUDIENCES);

export const askToolSpec = (name: string): AgentToolSpec | undefined =>
  (Object.hasOwn(ASK_ONLY_TOOLS, name) ? ASK_ONLY_TOOLS[name] : Object.hasOwn(AGENT_TOOLS, name) ? AGENT_TOOLS[name] : undefined);

export const PLAYER_REFUSAL = "I can only talk about what you have played so far.";

export type AskCheck = { ok: true; spec: AgentToolSpec } | { ok: false; message: string };

export const checkAskCall = (persona: AskPersona, call: AgentToolCall): AskCheck => {
  const allowed = askToolsFor(persona);
  const spec = allowed.includes(call.tool) ? askToolSpec(call.tool) : undefined;
  if (!spec || spec.family === "edit" || spec.family === "provision") {
    if (persona === "player") return { ok: false, message: PLAYER_REFUSAL };
    return { ok: false, message: `Ask mode only reads: "${call.tool}" is not one of its tools${toolHint(call.tool, allowed)}. Nothing in Ask mode can change the story or the install.` };
  }
  const issue = argProblems(spec, call);
  return issue ? { ok: false, message: issue } : { ok: true, spec };
};

export interface AuthorAskContext {
  persona: "author";
  draft: StoryV2 | null;
  lookup: AgentLookup;
  liveState: (() => string) | null;
}

export interface PlayerAskContext {
  persona: "player";
  projection: PlayedProjection;
}

export type AskContext = AuthorAskContext | PlayerAskContext;

const NO_DRAFT = "No story is open here: open one in the Studio, or play one in this chat.";

export const recommendations = (draft: StoryV2, lookup: AgentLookup): string => {
  const diagnostics = runDiagnostics(draft, { characterNames: lookup.characters, backgroundNames: lookup.backgrounds });
  if (!diagnostics.length) return "Nothing to fix: the Studio's checks found no problem.";
  return diagnostics.map((diagnostic) => {
    const topic = (DIAGNOSTIC_GUIDE_TOPIC as Record<string, string | undefined>)[diagnostic.code];
    return `- [${diagnostic.severity}] ${diagnostic.consequence ?? diagnostic.message} (at ${diagnostic.path}${topic ? `; topic author/${topic}` : ""})`;
  }).join("\n");
};

export const runAskTool = (context: AskContext, call: AgentToolCall): string => {
  const audiences = askAudiences(context.persona);
  if (call.tool === "readKnowledge") return readKnowledge(call.args.topic, audiences);
  if (call.tool === "searchKnowledge") return searchKnowledge(call.args.query, audiences);
  if (context.persona === "player") return call.tool === "readPlayed" ? projectionText(context.projection) : PLAYER_REFUSAL;
  if (call.tool === "readLiveState") return context.liveState?.() ?? "No chat state here: this question was asked outside a chat.";
  if (call.tool === "readGuide") return readGuide(call.args.topic);
  if (call.tool === "readRecipe") return readRecipe(call.args.recipe);
  if (!context.draft) return NO_DRAFT;
  if (call.tool === "readRecommendations") return recommendations(context.draft, context.lookup);
  return runReadTool(call.tool as ReadToolName, call.args, context.draft, context.lookup);
};

export type AskReply = { kind: "call"; call: AgentToolCall } | { kind: "answer"; answer: string; topics: string[] };

export type ParsedAskReply = { ok: true; reply: AskReply } | { ok: false; issues: string[] };

const ASK_KEYS = ["thought", "tool", "args", "answer", "topics"] as const;

export const parseAskReply = (raw: string): ParsedAskReply => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalizeJsonText(raw));
  } catch {
    return { ok: false, issues: ["not JSON: reply with exactly one JSON object."] };
  }
  if (!isRecord(parsed)) return { ok: false, issues: ["the reply must be one JSON object."] };
  const unknown = Object.keys(parsed).filter((key) => !(ASK_KEYS as readonly string[]).includes(key));
  if (unknown.length) {
    return { ok: false, issues: unknown.map((key) => { const near = nearestKey(key, ASK_KEYS); return `unknown reply key "${key}"${near ? ` (did you mean "${near}"?)` : ""}.`; }) };
  }
  if (parsed.answer !== undefined) {
    if (parsed.tool !== undefined) return { ok: false, issues: ["a reply is either one tool call or the answer, not both."] };
    if (typeof parsed.answer !== "string" || !parsed.answer.trim()) return { ok: false, issues: ["answer: a non-empty string."] };
    const topics = Array.isArray(parsed.topics) ? parsed.topics.filter((topic): topic is string => typeof topic === "string").map((topic) => topic.trim()).filter(Boolean) : [];
    return { ok: true, reply: { kind: "answer", answer: parsed.answer.trim(), topics } };
  }
  if (typeof parsed.tool !== "string" || !parsed.tool.trim()) return { ok: false, issues: ["tool: name one tool, or reply with {\"answer\": …, \"topics\": […]}."] };
  if (parsed.args !== undefined && !isRecord(parsed.args)) return { ok: false, issues: ["args: must be an object."] };
  return { ok: true, reply: { kind: "call", call: { tool: parsed.tool.trim(), args: isRecord(parsed.args) ? parsed.args : {} } } };
};

export interface AskStep {
  call: AgentToolCall;
  status: "observed" | "refused";
  observation: string;
}

const OBSERVATION_CHARS = 1600;
const STEP_CHARS = 700;
export const ASK_MAX_STEPS = 6;
export const ASK_MAX_TOKENS = 900;

const PLAYER_RULES = [
  "You answer a player's question about the story they are playing, or about how to use Story Orchestrator while playing.",
  "You know ONLY what the PLAYED section and your tools say. Never guess or hint at what comes later, who someone really is, or how anything turns out.",
  `When the question asks about something the player has not reached, say: "${PLAYER_REFUSAL}" and, if it helps, point to what is open right now.`,
  "Speak to the player as \"you\", plainly, in two to five sentences. Never mention tools, ids, prompts or the machinery behind the story.",
];

const AUTHOR_RULES = [
  "You answer an author's question about Story Orchestrator, SillyTavern, or the story they are writing or playing. You can only read: you never change anything.",
  "Search the knowledge first (searchKnowledge, then readKnowledge on the best id). For the story itself use the draft tools; for \"why is the story doing X right now\" use readLiveState.",
  "For \"what should I fix\" use readRecommendations and explain each problem in plain words.",
  "Answer in plain words, short, with the concrete control or field to use. Cite the topic ids you used.",
];

const FORMAT = [
  "Reply with exactly one JSON object and nothing else:",
  "{\"tool\": \"<name>\", \"args\": {…}} to read, one call per reply, or",
  "{\"answer\": \"your answer\", \"topics\": [\"topic ids you used\"]} when you can answer.",
].join("\n");

const toolLines = (persona: AskPersona) => askToolsFor(persona).map((name) => {
  const spec = askToolSpec(name) as AgentToolSpec;
  return `- ${name}(${Object.entries(spec.args).map(([arg, value]) => renderArg(arg, value)).join("; ")}) — ${spec.doc}`;
}).join("\n");

const renderStep = (step: AskStep) => `${step.call.tool}(${truncate(JSON.stringify(step.call.args), 120)}) → ${step.status}\n  ${truncate(step.observation, STEP_CHARS)}`;

const draftLine = (context: AuthorAskContext) => (context.draft
  ? `DRAFT: "${context.draft.title}", ${context.draft.checkpoints.length} checkpoint(s), ${context.draft.roster.length} cast member(s). Read it with the draft tools.`
  : `DRAFT: none. ${NO_DRAFT}`);

export const renderAskPrompt = (context: AskContext, question: string, steps: readonly AskStep[], final = false): string => [
  (context.persona === "player" ? PLAYER_RULES : AUTHOR_RULES).join("\n"),
  FORMAT,
  `TOOLS\n${toolLines(context.persona)}`,
  ...(context.persona === "player" ? [`PLAYED\n${projectionText(context.projection)}`] : [draftLine(context)]),
  `QUESTION\n${question.trim()}`,
  ...(steps.length ? [`YOUR READS SO FAR\n${steps.map(renderStep).join("\n")}`] : []),
  final ? "ANSWER NOW with {\"answer\": …, \"topics\": […]}: no more reads." : "REPLY NOW with one read, or the answer.",
].join("\n\n");

export type AskModel = (prompt: string) => Promise<string>;

export interface AskInput {
  question: string;
  context: AskContext;
  model: AskModel;
  maxSteps?: number;
  onRefused?: (step: AskStep) => void;
}

export interface AskResult {
  status: "answered" | "failed";
  answer: string;
  topics: KnowledgeTopic[];
  showMe: KnowledgeShowMe | null;
  steps: AskStep[];
}

export const ASK_COPY = {
  noAnswer: "No answer came back. Try asking again in other words.",
  empty: "Type a question first.",
} as const;

export const citedTopics = (persona: AskPersona, ids: readonly string[]): KnowledgeTopic[] => {
  const topics = ids.map((id) => findTopic(id, askAudiences(persona))).filter((topic): topic is KnowledgeTopic => topic !== null);
  return topics.filter((topic, index) => topics.findIndex((entry) => entry.id === topic.id) === index);
};

export const showMeFor = (persona: AskPersona, topics: readonly KnowledgeTopic[]): KnowledgeShowMe | null =>
  topics.map((topic) => topic.showMe).find((target): target is KnowledgeShowMe => target !== null && (persona === "author" || target.kind !== "studio")) ?? null;

const answered = (persona: AskPersona, answer: string, ids: readonly string[], steps: AskStep[]): AskResult => {
  const topics = citedTopics(persona, ids);
  return { status: "answered", answer, topics, showMe: showMeFor(persona, topics), steps };
};

const sameCall = (left: AgentToolCall, right: AgentToolCall) => left.tool === right.tool && JSON.stringify(left.args) === JSON.stringify(right.args);

export const runAsk = async (input: AskInput): Promise<AskResult> => {
  const steps: AskStep[] = [];
  const question = input.question.trim();
  if (!question) return { status: "failed", answer: ASK_COPY.empty, topics: [], showMe: null, steps };
  const limit = input.maxSteps ?? ASK_MAX_STEPS;
  const persona = input.context.persona;
  for (let turn = 0; turn <= limit; turn += 1) {
    const final = turn === limit;
    const raw = await input.model(renderAskPrompt(input.context, question, steps, final));
    const parsed = parseAskReply(raw);
    if (!parsed.ok) {
      steps.push({ call: { tool: "(unparsed)", args: {} }, status: "refused", observation: `Refused: ${parsed.issues.join(" ")}` });
      continue;
    }
    if (parsed.reply.kind === "answer") return answered(persona, parsed.reply.answer, parsed.reply.topics, steps);
    if (final) break;
    const call = parsed.reply.call;
    if (steps.some((step) => step.status === "refused" && sameCall(step.call, call))) break;
    const check = checkAskCall(persona, call);
    if (!check.ok) {
      const step: AskStep = { call, status: "refused", observation: `Refused: ${check.message}` };
      steps.push(step);
      input.onRefused?.(step);
      continue;
    }
    steps.push({ call, status: "observed", observation: truncate(runAskTool(input.context, call), OBSERVATION_CHARS) });
  }
  return { status: "failed", answer: ASK_COPY.noAnswer, topics: [], showMe: null, steps };
};
