import { getContext, getCharacters, listActiveWorldInfoComments } from "@services/STAPI";
import {
  buildCharacterContext,
  buildExpansionActionsPrompt,
  buildExpansionCheckpointPrompt,
  buildExpansionRoadmapPrompt,
  buildExpansionTransitionsPrompt,
  buildSeedActionsPrompt,
  buildSeedCheckpointPrompt,
  buildSeedRoadmapPrompt,
  buildSeedTransitionsPrompt,
} from "@services/StoryGeneratorPrompts";
import type { Checkpoint, AuthorNoteDefinition, InlineTransition, TalkControlReply } from "@utils/story-schema";

const GENERATOR_RESPONSE_LENGTH = 4000;
const CHAT_SUMMARY_LIMIT = 15;
const MAX_ID_ITER = 1000;

export interface CharacterSummary {
  name: string;
  description?: string;
}

export interface CheckpointSummary {
  name: string;
  objective: string;
  status: "complete" | "failed" | "current";
}

export interface SeedInput {
  premise: string;
  characters: CharacterSummary[];
  worldInfo: string[];
  storyTitle: string;
  globalLorebook: string;
  questionnaire?: {
    genre: string;
    tone: string;
    length: string;
    focus: string;
  };
}

export interface SeedResult {
  roadmap: string;
  roles: Record<string, string>;
  initialCheckpoint: Checkpoint;
}

export interface ExpansionInput {
  premise: string;
  roadmap: string;
  transitionLabel: string;
  transitionCondition: string;
  targetCheckpointId: string;
  targetCheckpointName: string;
  pastCheckpoints: CheckpointSummary[];
  characters: CharacterSummary[];
  worldInfo: string[];
  existingCheckpointIds: string[];
  existingTransitionIds: string[];
}

export interface ExpansionResult {
  roadmap: string;
  checkpoint: Checkpoint;
}

export type GenerationPhase = "roadmap" | "checkpoint" | "transitions" | "actions";

export interface PhaseUpdate {
  phase: GenerationPhase;
  done: boolean;
  checkpointName?: string;
  checkpointObjective?: string;
  transitionCount?: number;
}

interface ParsedActions {
  authors_note?: Record<string, AuthorNoteDefinition>;
  talk_control: TalkControlReply[];
}

function buildChatSummary(): string {
  const { chat } = getContext();
  if (!chat.length) return "No chat history.";
  return chat.slice(-CHAT_SUMMARY_LIMIT)
    .map((msg) => {
      const who = msg.name || (msg.is_user ? "Player" : "Character");
      const text = (msg.mes ?? "").trim();
      return text ? `${who}: ${text}` : null;
    })
    .filter(Boolean)
    .join("\n");
}

function extractWorldInfoSummariesFromContext(): string[] {
  const { worldInfo } = getContext();
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of Object.values(worldInfo ?? {})) {
    if (entry?.disable) continue;
    const comment = typeof entry?.comment === "string" ? entry.comment.trim() : "";
    if (!comment) continue;
    const key = comment.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(comment);
  }
  return result;
}

function extractJson(raw: string): unknown {
  const start = raw.indexOf("{");
  if (start === -1) throw new Error("No JSON object found in response");
  const end = raw.lastIndexOf("}");
  if (end === -1 || end < start) throw new Error("Unterminated JSON object in response");
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch (e) {
    throw new Error(`Failed to parse JSON from LLM response: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function extractText(raw: string): string {
  return raw.trim();
}

async function callLlm(prompt: string): Promise<string> {
  const { generateRaw } = getContext();
  const raw = await generateRaw({
    prompt,
    instructOverride: true,
    quietToLoud: false,
    responseLength: GENERATOR_RESPONSE_LENGTH,
    trimNames: false,
  });
  return raw.trim();
}

function makeCheckpointId(used: Set<string>, prefix = "cp"): string {
  for (let i = 1; i <= MAX_ID_ITER; i++) {
    const id = `${prefix}-gen-${i}`;
    if (!used.has(id)) {
      used.add(id);
      return id;
    }
  }
  const fallback = `${prefix}-gen-${Date.now()}`;
  used.add(fallback);
  return fallback;
}

function makeTransitionId(used: Set<string>, from: string, to: string): string {
  const base = `t-${from}-to-${to}`;
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  for (let i = 2; i <= MAX_ID_ITER; i++) {
    const id = `${base}-${i}`;
    if (!used.has(id)) {
      used.add(id);
      return id;
    }
  }
  const fallback = `${base}-${Date.now()}`;
  used.add(fallback);
  return fallback;
}

function parseRoles(raw: unknown, characters: CharacterSummary[]): Record<string, string> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const entries = Object.entries(raw as Record<string, unknown>)
      .filter(([key, value]) => typeof key === "string" && key.trim() && typeof value === "string" && value.trim())
      .map(([key, value]) => [key.trim(), (value as string).trim()]);
    if (entries.length) return Object.fromEntries(entries);
  }
  return Object.fromEntries(characters.map((character) => [character.name.toLowerCase().replace(/\s+/g, "_"), character.name]));
}

function parseCheckpointCore(raw: unknown, id: string): Checkpoint {
  const obj = raw as Record<string, unknown>;
  const name = typeof obj?.name === "string" && obj.name.trim() ? obj.name.trim() : "Unnamed Beat";
  const objective = typeof obj?.objective === "string" && obj.objective.trim() ? obj.objective.trim() : "Continue the story.";
  return { id, name, objective };
}

function parseTransitions(raw: unknown, fromId: string, usedTIds: Set<string>, usedCpIds: Set<string>): InlineTransition[] {
  const obj = raw as Record<string, unknown>;
  const list = Array.isArray(obj?.transitions) ? obj.transitions : [];
  const transitions: InlineTransition[] = [];

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const transition = item as Record<string, unknown>;
    const toId = typeof transition.to_id === "string" && transition.to_id.trim() ? transition.to_id.trim() : makeCheckpointId(usedCpIds);
    if (!usedCpIds.has(toId)) usedCpIds.add(toId);

    const id = makeTransitionId(usedTIds, fromId, toId);
    const label = typeof transition.label === "string" && transition.label.trim() ? transition.label.trim() : undefined;
    const triggerRaw = transition.trigger as Record<string, unknown> | undefined;
    const condition = typeof triggerRaw?.condition === "string" && triggerRaw.condition.trim() ? triggerRaw.condition.trim() : "Continue the story.";
    const patternsRaw = Array.isArray(triggerRaw?.patterns) ? triggerRaw.patterns : [];
    const patterns = patternsRaw.filter((pattern) => typeof pattern === "string" && pattern.trim()).map((pattern) => String(pattern).trim());

    transitions.push({
      id,
      to: toId,
      label,
      trigger: {
        type: "regex",
        patterns: patterns.length ? patterns : ["/\\bcontinue\\b/i"],
        condition,
      },
    });
  }

  return transitions;
}

function parseAuthorsNote(raw: unknown): Record<string, AuthorNoteDefinition> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  if (!obj.authors_note || typeof obj.authors_note !== "object") return undefined;

  const result: Record<string, AuthorNoteDefinition> = {};
  for (const [roleId, noteRaw] of Object.entries(obj.authors_note as Record<string, unknown>)) {
    if (!roleId || !noteRaw || typeof noteRaw !== "object") continue;
    const note = noteRaw as Record<string, unknown>;
    const text = typeof note.text === "string" && note.text.trim() ? note.text.trim() : null;
    if (!text) continue;
    result[roleId] = {
      text,
      position: (["before", "chat", "after"] as const).includes(note.position as never) ? note.position as "before" | "chat" | "after" : "chat",
      interval: typeof note.interval === "number" && note.interval >= 1 ? Math.floor(note.interval) : 3,
      depth: typeof note.depth === "number" && note.depth >= 0 ? Math.floor(note.depth) : 4,
      role: (["system", "user", "assistant"] as const).includes(note.role as never) ? note.role as "system" | "user" | "assistant" : "system",
    };
  }

  return Object.keys(result).length ? result : undefined;
}

function parseTalkControlReplies(raw: unknown): TalkControlReply[] {
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;
  const repliesRaw = Array.isArray(obj.replies) ? obj.replies : [];

  const replies: TalkControlReply[] = [];
  for (const item of repliesRaw) {
    if (!item || typeof item !== "object") continue;
    const reply = item as Record<string, unknown>;
    const memberId = typeof reply.memberId === "string" && reply.memberId.trim() ? reply.memberId.trim() : "";
    if (!memberId) continue;
    const triggerRaw = typeof reply.trigger === "string" ? reply.trigger : "onEnter";
    const validTriggers = ["onEnter", "afterSpeak", "beforeArbiter", "afterArbiter"] as const;
    const trigger = validTriggers.includes(triggerRaw as never) ? triggerRaw as typeof validTriggers[number] : "onEnter";
    const probability = typeof reply.probability === "number" ? Math.min(100, Math.max(0, Math.floor(reply.probability))) : 100;
    const maxTriggers = typeof reply.maxTriggers === "number" && reply.maxTriggers >= 1 ? Math.floor(reply.maxTriggers) : undefined;
    const content = reply.content as Record<string, unknown> | undefined;
    const parsedContent = content?.kind === "static"
      ? { kind: "static" as const, text: typeof content.text === "string" && content.text.trim() ? content.text.trim() : "..." }
      : { kind: "llm" as const, instruction: typeof content?.instruction === "string" && content.instruction.trim() ? content.instruction.trim() : "Speak naturally." };
    replies.push({ memberId, speakerId: "", enabled: true, trigger, probability, ...(maxTriggers ? { maxTriggers } : {}), content: parsedContent });
  }
  return replies;
}

function parseActions(raw: unknown): ParsedActions {
  const obj = raw as Record<string, unknown>;
  const talkControl = obj?.talkControl ?? obj?.talk_control;
  return {
    authors_note: parseAuthorsNote(obj),
    talk_control: parseTalkControlReplies(talkControl),
  };
}

function buildCheckpointResult(checkpoint: Checkpoint, transitions: InlineTransition[], actions: ParsedActions): Checkpoint {
  return {
    ...checkpoint,
    ...(actions.authors_note ? { authors_note: actions.authors_note } : {}),
    ...(transitions.length ? { transitions } : {}),
    ...(actions.talk_control.length ? { talk_control: actions.talk_control } : {}),
  };
}

export class StoryGeneratorService {
  private onPhaseUpdate?: (update: PhaseUpdate) => void;

  setPhaseCallback(cb: (update: PhaseUpdate) => void) {
    this.onPhaseUpdate = cb;
  }

  private notify(update: PhaseUpdate) {
    try {
      this.onPhaseUpdate?.(update);
    } catch {
      return;
    }
  }

  private async runPhase<T>(phase: GenerationPhase, task: () => Promise<T>, doneUpdate?: (value: T) => Partial<PhaseUpdate>) {
    this.notify({ phase, done: false });
    const value = await task();
    this.notify({ phase, done: true, ...doneUpdate?.(value) });
    return value;
  }

  private async requestText(prompt: string, fallback: string) {
    const text = extractText(await callLlm(prompt));
    return text || fallback;
  }

  private async requestJson<T>(prompt: string) {
    return extractJson(await callLlm(prompt)) as T;
  }

  private async generateCheckpointPhase(prompt: string, checkpointId: string) {
    const raw = await this.runPhase("checkpoint", () => this.requestJson<Record<string, unknown>>(prompt), (payload) => {
      const checkpoint = parseCheckpointCore(payload, checkpointId);
      return {
        checkpointName: checkpoint.name,
        checkpointObjective: checkpoint.objective,
      };
    });
    return {
      raw,
      checkpoint: parseCheckpointCore(raw, checkpointId),
    };
  }

  private async generateTransitionsPhase(prompt: string, checkpointId: string, usedTIds: Set<string>, usedCpIds: Set<string>) {
    return this.runPhase(
      "transitions",
      async () => parseTransitions(await this.requestJson<Record<string, unknown>>(prompt), checkpointId, usedTIds, usedCpIds),
      (transitions) => ({ transitionCount: transitions.length }),
    );
  }

  private async generateActionsPhase(prompt: string) {
    const raw = await this.runPhase("actions", () => this.requestJson<Record<string, unknown>>(prompt));
    return parseActions(raw);
  }

  async generateSeed(input: SeedInput): Promise<SeedResult> {
    const roadmap = await this.runPhase(
      "roadmap",
      () => this.requestText(buildSeedRoadmapPrompt(input), "A story unfolds."),
    );

    const usedCpIds = new Set<string>(["cp-seed"]);
    const usedTIds = new Set<string>();
    const seedId = "cp-seed";
    const checkpointPhase = await this.generateCheckpointPhase(
      buildSeedCheckpointPrompt({
        roadmap,
        storyTitle: input.storyTitle,
        characters: input.characters,
      }),
      seedId,
    );
    const roles = parseRoles(checkpointPhase.raw.roles, input.characters);
    const roleList = Object.entries(roles).map(([key, value]) => `${key}: ${value}`).join(", ");
    const transitions = await this.generateTransitionsPhase(
      buildSeedTransitionsPrompt({
        roadmap,
        checkpointName: checkpointPhase.checkpoint.name,
        checkpointObjective: checkpointPhase.checkpoint.objective,
        roleList,
      }),
      seedId,
      usedTIds,
      usedCpIds,
    );
    const actions = await this.generateActionsPhase(
      buildSeedActionsPrompt({
        roadmap,
        checkpointName: checkpointPhase.checkpoint.name,
        checkpointObjective: checkpointPhase.checkpoint.objective,
        roleList,
      }),
    );

    return {
      roadmap,
      roles,
      initialCheckpoint: buildCheckpointResult(checkpointPhase.checkpoint, transitions, actions),
    };
  }

  async expandCheckpoint(input: ExpansionInput, onPhase?: (update: PhaseUpdate) => void): Promise<ExpansionResult> {
    if (onPhase) this.onPhaseUpdate = onPhase;

    const characterContext = buildCharacterContext(input.characters);
    const chatSummary = buildChatSummary();
    const usedCpIds = new Set<string>(input.existingCheckpointIds);
    const usedTIds = new Set<string>(input.existingTransitionIds);

    const roadmap = await this.runPhase(
      "roadmap",
      () => this.requestText(buildExpansionRoadmapPrompt({
        roadmap: input.roadmap,
        transitionLabel: input.transitionLabel,
        transitionCondition: input.transitionCondition,
        chatSummary,
      }), input.roadmap),
    );
    const checkpointPhase = await this.generateCheckpointPhase(
      buildExpansionCheckpointPrompt({
        roadmap,
        premise: input.premise,
        pastCheckpoints: input.pastCheckpoints,
        transitionLabel: input.transitionLabel,
        transitionCondition: input.transitionCondition,
        chatSummary,
        characters: input.characters,
        worldInfo: input.worldInfo,
        targetCheckpointId: input.targetCheckpointId,
        targetCheckpointName: input.targetCheckpointName,
      }),
      input.targetCheckpointId,
    );
    const transitions = await this.generateTransitionsPhase(
      buildExpansionTransitionsPrompt({
        roadmap,
        checkpointName: checkpointPhase.checkpoint.name,
        checkpointObjective: checkpointPhase.checkpoint.objective,
        characterContext,
        existingCheckpointIds: [...usedCpIds],
      }),
      input.targetCheckpointId,
      usedTIds,
      usedCpIds,
    );
    const actions = await this.generateActionsPhase(
      buildExpansionActionsPrompt({
        roadmap,
        checkpointName: checkpointPhase.checkpoint.name,
        checkpointObjective: checkpointPhase.checkpoint.objective,
        characterContext,
      }),
    );

    return {
      roadmap,
      checkpoint: buildCheckpointResult(checkpointPhase.checkpoint, transitions, actions),
    };
  }

  static buildCharacterSummaries(): CharacterSummary[] {
    try {
      return getCharacters()
        .filter((character) => character?.name)
        .map((character) => ({
          name: String(character.name).trim(),
          description: typeof character.description === "string" ? character.description.trim().slice(0, 200) : undefined,
        }));
    } catch {
      return [];
    }
  }

  static buildWorldInfoSummaries(): string[] {
    try {
      const comments = listActiveWorldInfoComments();
      return comments.length ? comments : extractWorldInfoSummariesFromContext();
    } catch {
      try {
        return extractWorldInfoSummariesFromContext();
      } catch {
        return [];
      }
    }
  }
}
