import { getContext } from "./STAPI";
import type { Checkpoint, OnActivate, TalkControlConfig, Transition } from "@utils/story-schema";

const GENERATOR_RESPONSE_LENGTH = 2000;
const CHAT_SUMMARY_LIMIT = 15;

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
}

export interface SeedResult {
  roles: Record<string, string>;
  initialCheckpoint: Checkpoint;
  transitions: Transition[];
  talkControl: TalkControlConfig;
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
  transitions: Transition[];
  talkControl: TalkControlConfig;
}

export type GenerationPhase = "roadmap" | "checkpoint" | "transitions" | "actions";

export interface PhaseUpdate {
  phase: GenerationPhase;
  done: boolean;
  checkpointName?: string;
  checkpointObjective?: string;
  transitionCount?: number;
}

interface GenerateRawOptions {
  prompt: string;
  instructOverride?: boolean;
  quietToLoud?: boolean;
  responseLength?: number;
  trimNames?: boolean;
}

function buildCharacterContext(characters: CharacterSummary[]): string {
  if (!characters.length) return "No characters specified.";
  return characters.map(c => c.description ? `${c.name}: ${c.description}` : c.name).join("\n");
}

function buildWorldInfoContext(worldInfo: string[]): string {
  if (!worldInfo.length) return "No active world info.";
  return worldInfo.join("\n");
}

function buildPastCheckpointsContext(past: CheckpointSummary[]): string {
  if (!past.length) return "None completed yet.";
  return past.map(cp => `[${cp.status}] ${cp.name} — ${cp.objective}`).join("\n");
}

function buildChatSummary(): string {
  const { chat } = getContext();
  if (!Array.isArray(chat) || !chat.length) return "No chat history.";
  return chat.slice(-CHAT_SUMMARY_LIMIT)
    .map(msg => {
      const who = (msg?.name || (msg?.is_user ? "Player" : "Character")) as string;
      const text = ((msg?.mes || "") as string).trim();
      return text ? `${who}: ${text}` : null;
    })
    .filter(Boolean)
    .join("\n");
}

function extractJson(raw: string): unknown {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object found in response");
  return JSON.parse(match[0]);
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
  } as GenerateRawOptions);
  return typeof raw === "string" ? raw : "";
}

function makeCheckpointId(used: Set<string>, prefix = "cp"): string {
  let i = 1;
  while (true) {
    const id = `${prefix}-gen-${i}`;
    if (!used.has(id)) { used.add(id); return id; }
    i++;
  }
}

function makeTransitionId(used: Set<string>, from: string, to: string): string {
  const base = `t-${from}-to-${to}`;
  if (!used.has(base)) { used.add(base); return base; }
  let i = 2;
  while (true) {
    const id = `${base}-${i}`;
    if (!used.has(id)) { used.add(id); return id; }
    i++;
  }
}

function parseRoles(raw: unknown, characters: CharacterSummary[]): Record<string, string> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const entries = Object.entries(raw as Record<string, unknown>)
      .filter(([k, v]) => typeof k === "string" && k.trim() && typeof v === "string" && (v as string).trim())
      .map(([k, v]) => [k.trim(), (v as string).trim()]);
    if (entries.length) return Object.fromEntries(entries);
  }
  return Object.fromEntries(characters.map(c => [c.name.toLowerCase().replace(/\s+/g, "_"), c.name]));
}

function parseCheckpointCore(raw: unknown, id: string): Checkpoint {
  const obj = raw as Record<string, unknown>;
  const name = typeof obj?.name === "string" && obj.name.trim() ? obj.name.trim() : "Unnamed Beat";
  const objective = typeof obj?.objective === "string" && obj.objective.trim() ? obj.objective.trim() : "Continue the story.";
  return { id, name, objective };
}

function parseTransitions(raw: unknown, fromId: string, usedTIds: Set<string>, usedCpIds: Set<string>): { transitions: Transition[]; newCheckpointIds: string[] } {
  const obj = raw as Record<string, unknown>;
  const list = Array.isArray(obj?.transitions) ? obj.transitions : [];
  const transitions: Transition[] = [];
  const newCheckpointIds: string[] = [];

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const t = item as Record<string, unknown>;
    const toId = typeof t.to_id === "string" && t.to_id.trim() ? t.to_id.trim() : makeCheckpointId(usedCpIds);
    if (!usedCpIds.has(toId)) { usedCpIds.add(toId); }
    newCheckpointIds.push(toId);

    const id = makeTransitionId(usedTIds, fromId, toId);
    const label = typeof t.label === "string" && t.label.trim() ? t.label.trim() : undefined;
    const triggerRaw = t.trigger as Record<string, unknown> | undefined;
    const condition = typeof triggerRaw?.condition === "string" && triggerRaw.condition.trim() ? triggerRaw.condition.trim() : "Continue the story.";
    const patternsRaw = Array.isArray(triggerRaw?.patterns) ? triggerRaw.patterns : [];
    const patterns: string[] = patternsRaw.filter(p => typeof p === "string" && p.trim()).map(p => String(p).trim());

    transitions.push({
      id,
      from: fromId,
      to: toId,
      label,
      trigger: {
        type: "regex",
        patterns: patterns.length ? patterns : ["/\\bcontinue\\b/i"],
        condition,
      },
    });
  }

  return { transitions, newCheckpointIds };
}

function parseOnActivate(raw: unknown, roles: Record<string, string>): OnActivate {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;

  const authors_note: OnActivate["authors_note"] = {};
  if (obj.authors_note && typeof obj.authors_note === "object") {
    for (const [roleId, noteRaw] of Object.entries(obj.authors_note as Record<string, unknown>)) {
      if (!roleId || !noteRaw || typeof noteRaw !== "object") continue;
      const note = noteRaw as Record<string, unknown>;
      const text = typeof note.text === "string" && note.text.trim() ? note.text.trim() : null;
      if (!text) continue;
      authors_note[roleId] = {
        text,
        position: (["before", "chat", "after"] as const).includes(note.position as never) ? note.position as "before" | "chat" | "after" : "chat",
        interval: typeof note.interval === "number" && note.interval >= 1 ? Math.floor(note.interval) : 3,
        depth: typeof note.depth === "number" && note.depth >= 0 ? Math.floor(note.depth) : 4,
        role: (["system", "user", "assistant"] as const).includes(note.role as never) ? note.role as "system" | "user" | "assistant" : "system",
      };
    }
  }

  const talkControlReplies = parseTalkControlReplies(obj.talkControl ?? obj.talk_control, roles);

  const result: OnActivate = {};
  if (Object.keys(authors_note).length) result.authors_note = authors_note;
  return result;
}

function parseTalkControlReplies(raw: unknown, _roles: Record<string, string>): TalkControlConfig["checkpoints"] {
  const replies: TalkControlConfig["checkpoints"] = {};
  if (!raw || typeof raw !== "object") return replies;
  const obj = raw as Record<string, unknown>;
  const repliesRaw = Array.isArray(obj.replies) ? obj.replies : [];

  const parsedReplies = repliesRaw
    .filter(r => r && typeof r === "object")
    .map(r => {
      const reply = r as Record<string, unknown>;
      const memberId = typeof reply.memberId === "string" && reply.memberId.trim() ? reply.memberId.trim() : "";
      if (!memberId) return null;
      const triggerRaw = typeof reply.trigger === "string" ? reply.trigger : "onEnter";
      const validTriggers = ["onEnter", "afterSpeak", "beforeArbiter", "afterArbiter"] as const;
      const trigger = validTriggers.includes(triggerRaw as never) ? triggerRaw as typeof validTriggers[number] : "onEnter";
      const probability = typeof reply.probability === "number" ? Math.min(100, Math.max(0, Math.floor(reply.probability))) : 100;
      const maxTriggers = typeof reply.maxTriggers === "number" && reply.maxTriggers >= 1 ? Math.floor(reply.maxTriggers) : undefined;
      const content = reply.content as Record<string, unknown> | undefined;
      const kind = content?.kind === "static" ? "static" : "llm";
      const contentParsed = kind === "static"
        ? { kind: "static" as const, text: typeof content?.text === "string" && content.text.trim() ? content.text.trim() : "..." }
        : { kind: "llm" as const, instruction: typeof content?.instruction === "string" && content.instruction.trim() ? content.instruction.trim() : "Speak naturally." };

      return { memberId, speakerId: "", enabled: true, trigger, probability, maxTriggers, content: contentParsed };
    })
    .filter(Boolean) as TalkControlConfig["checkpoints"][string]["replies"];

  return parsedReplies.length ? { _generated: { replies: parsedReplies } } : {};
}

export class StoryGeneratorService {
  private onPhaseUpdate?: (update: PhaseUpdate) => void;

  setPhaseCallback(cb: (update: PhaseUpdate) => void) {
    this.onPhaseUpdate = cb;
  }

  private notify(update: PhaseUpdate) {
    try { this.onPhaseUpdate?.(update); } catch { /* ignore */ }
  }

  async generateSeed(input: SeedInput): Promise<SeedResult> {
    const { premise, characters, worldInfo, storyTitle } = input;
    const charContext = buildCharacterContext(characters);
    const wiContext = buildWorldInfoContext(worldInfo);

    this.notify({ phase: "roadmap", done: false });
    const roadmapRaw = await callLlm(
      `You are a narrative director.\n\nPREMISE:\n${premise}\n\nCHARACTERS:\n${charContext}\n\nACTIVE WORLD INFO:\n${wiContext}\n\nWrite a narrative roadmap for this story. Include:\n- Tone and themes\n- Each character's arc and motivation\n- Key turning points and possible paths\n- 2-3 possible endings\n\nWrite in prose, 150-250 words. This is a living outline, not a fixed script.\n\nReturn ONLY the prose text, no JSON, no headings.`
    );
    const roadmap = extractText(roadmapRaw) || "A story unfolds.";
    this.notify({ phase: "roadmap", done: true });

    this.notify({ phase: "checkpoint", done: false });
    const cpRaw = await callLlm(
      `You are a narrative director.\n\nNARRATIVE ROADMAP:\n${roadmap}\n\nSTORY TITLE: ${storyTitle}\n\nGenerate the OPENING story beat as JSON. Return ONLY this JSON object (no code fences):\n{\n  "name": "short evocative name for this opening scene",\n  "objective": "what the player encounters and should do in this opening scene",\n  "roles": {\n    "roleId": "Character Display Name"\n  }\n}\n\nRole IDs should be short lowercase identifiers (e.g. "companion", "villain", "innkeeper").\nBase roles on these characters: ${characters.map(c => c.name).join(", ")}`
    );
    const cpObj = extractJson(cpRaw) as Record<string, unknown>;
    const usedCpIds = new Set<string>(["cp-seed"]);
    const usedTIds = new Set<string>();
    const seedId = "cp-seed";
    const checkpoint = parseCheckpointCore(cpObj, seedId);
    const roles = parseRoles(cpObj.roles, characters);
    this.notify({ phase: "checkpoint", done: true, checkpointName: checkpoint.name, checkpointObjective: checkpoint.objective });

    this.notify({ phase: "transitions", done: false });
    const roleList = Object.entries(roles).map(([k, v]) => `${k}: ${v}`).join(", ");
    const transRaw = await callLlm(
      `You are a narrative director.\n\nNARRATIVE ROADMAP:\n${roadmap}\n\nCURRENT CHECKPOINT: "${checkpoint.name}" — ${checkpoint.objective}\nROLES: ${roleList}\n\nGenerate 2-3 outgoing transitions from this checkpoint. Each transition should have a unique destination ID.\nReturn ONLY this JSON (no code fences):\n{\n  "transitions": [\n    {\n      "to_id": "unique-destination-id",\n      "label": "short label",\n      "trigger": {\n        "type": "regex",\n        "patterns": ["/pattern/i"],\n        "condition": "plain-language description of what the player does to trigger this"\n      }\n    }\n  ]\n}`
    );
    const transObj = extractJson(transRaw);
    const { transitions, newCheckpointIds } = parseTransitions(transObj, seedId, usedTIds, usedCpIds);
    this.notify({ phase: "transitions", done: true, transitionCount: transitions.length });

    this.notify({ phase: "actions", done: false });
    const actionsRaw = await callLlm(
      `You are a narrative director.\n\nNARRATIVE ROADMAP:\n${roadmap}\n\nCHECKPOINT: "${checkpoint.name}" — ${checkpoint.objective}\nROLES: ${roleList}\n\nGenerate scene configuration for this opening checkpoint. Return ONLY this JSON (no code fences):\n{\n  "authors_note": {\n    "roleId": {\n      "text": "behavioral instruction for this character in this scene",\n      "position": "chat",\n      "interval": 3,\n      "depth": 4\n    }\n  },\n  "talkControl": {\n    "replies": [\n      {\n        "memberId": "roleId",\n        "trigger": "onEnter",\n        "probability": 90,\n        "maxTriggers": 1,\n        "content": { "kind": "llm", "instruction": "Brief instruction for how this character should open the scene" }\n      }\n    ]\n  }\n}`
    );
    const actionsObj = extractJson(actionsRaw);
    const onActivate = parseOnActivate(actionsObj, roles);
    const tcReplies = parseTalkControlReplies((actionsObj as Record<string, unknown>)?.talkControl ?? (actionsObj as Record<string, unknown>)?.talk_control, roles);
    this.notify({ phase: "actions", done: true });

    const fullCheckpoint: Checkpoint = { ...checkpoint, on_activate: onActivate };

    const stubCheckpoints: Checkpoint[] = newCheckpointIds.map(id => ({
      id,
      name: `Upcoming Beat (${id})`,
      objective: "To be revealed…",
      _isStub: true,
    } as Checkpoint & { _isStub: true }));

    const talkControl: TalkControlConfig = {
      checkpoints: Object.keys(tcReplies).length
        ? { [seedId]: { replies: tcReplies["_generated"]?.replies ?? [] } }
        : {},
    };

    return { roles, initialCheckpoint: fullCheckpoint, transitions, talkControl };
  }

  async expandCheckpoint(input: ExpansionInput, onPhase?: (update: PhaseUpdate) => void): Promise<ExpansionResult> {
    if (onPhase) this.onPhaseUpdate = onPhase;
    const {
      premise, roadmap, transitionLabel, transitionCondition,
      targetCheckpointId, targetCheckpointName,
      pastCheckpoints, characters, worldInfo,
      existingCheckpointIds, existingTransitionIds,
    } = input;

    const charContext = buildCharacterContext(characters);
    const wiContext = buildWorldInfoContext(worldInfo);
    const pastContext = buildPastCheckpointsContext(pastCheckpoints);
    const chatSummary = buildChatSummary();

    const usedCpIds = new Set<string>(existingCheckpointIds);
    const usedTIds = new Set<string>(existingTransitionIds);

    this.notify({ phase: "roadmap", done: false });
    const roadmapRaw = await callLlm(
      `You are a narrative director managing a living story.\n\nCURRENT ROADMAP:\n${roadmap}\n\nWHAT JUST HAPPENED:\nThe player took the transition "${transitionLabel}": ${transitionCondition}\n\nRECENT CHAT:\n${chatSummary}\n\nUpdate the roadmap to reflect what actually happened and what new possibilities are now open.\nKeep 150-250 words. Adjust character arcs, remove closed paths, add new ones if the chat revealed something unexpected.\n\nReturn ONLY the updated prose roadmap text.`
    );
    const updatedRoadmap = extractText(roadmapRaw) || roadmap;
    this.notify({ phase: "roadmap", done: true });

    this.notify({ phase: "checkpoint", done: false });
    const cpRaw = await callLlm(
      `You are a narrative director.\n\nNARRATIVE ROADMAP:\n${updatedRoadmap}\n\nPREMISE: ${premise}\n\nSTORY SO FAR:\n${pastContext}\n\nTRANSITION TAKEN: "${transitionLabel}" — ${transitionCondition}\n\nRECENT CHAT:\n${chatSummary}\n\nCHARACTERS:\n${charContext}\n\nACTIVE WORLD INFO:\n${wiContext}\n\nGenerate the next story beat. Checkpoint ID must be exactly: "${targetCheckpointId}"\nThe player just did: "${transitionCondition}". Continue naturally.\n\nReturn ONLY this JSON (no code fences):\n{\n  "name": "${targetCheckpointName || "Next Beat"}",\n  "objective": "what the player encounters and should do in this beat"\n}`
    );
    const cpObj = extractJson(cpRaw) as Record<string, unknown>;
    const checkpoint = parseCheckpointCore(cpObj, targetCheckpointId);
    this.notify({ phase: "checkpoint", done: true, checkpointName: checkpoint.name, checkpointObjective: checkpoint.objective });

    this.notify({ phase: "transitions", done: false });
    const transRaw = await callLlm(
      `You are a narrative director.\n\nNARRATIVE ROADMAP:\n${updatedRoadmap}\n\nCURRENT CHECKPOINT: "${checkpoint.name}" — ${checkpoint.objective}\nCHARACTERS: ${charContext}\n\nGenerate 2-3 outgoing transitions. Do NOT reuse these existing IDs: ${[...usedCpIds].join(", ")}.\nReturn ONLY this JSON (no code fences):\n{\n  "transitions": [\n    {\n      "to_id": "unique-new-destination-id",\n      "label": "short label",\n      "trigger": {\n        "type": "regex",\n        "patterns": ["/pattern/i"],\n        "condition": "what the player does to trigger this"\n      }\n    }\n  ]\n}`
    );
    const transObj = extractJson(transRaw);
    const { transitions } = parseTransitions(transObj, targetCheckpointId, usedTIds, usedCpIds);
    this.notify({ phase: "transitions", done: true, transitionCount: transitions.length });

    this.notify({ phase: "actions", done: false });
    const actionsRaw = await callLlm(
      `You are a narrative director.\n\nNARRATIVE ROADMAP:\n${updatedRoadmap}\n\nCHECKPOINT: "${checkpoint.name}" — ${checkpoint.objective}\nCHARACTERS: ${charContext}\n\nGenerate scene configuration. Return ONLY this JSON (no code fences):\n{\n  "authors_note": {\n    "roleId": {\n      "text": "behavioral instruction for this character in this scene",\n      "position": "chat",\n      "interval": 3,\n      "depth": 4\n    }\n  },\n  "talkControl": {\n    "replies": [\n      {\n        "memberId": "roleId",\n        "trigger": "onEnter",\n        "probability": 90,\n        "maxTriggers": 1,\n        "content": { "kind": "llm", "instruction": "How this character should open the scene" }\n      }\n    ]\n  }\n}`
    );
    const actionsObj = extractJson(actionsRaw);
    const onActivate = parseOnActivate(actionsObj, {});
    const tcReplies = parseTalkControlReplies((actionsObj as Record<string, unknown>)?.talkControl ?? (actionsObj as Record<string, unknown>)?.talk_control, {});
    this.notify({ phase: "actions", done: true });

    const fullCheckpoint: Checkpoint = { ...checkpoint, on_activate: onActivate };
    const talkControl: TalkControlConfig = {
      checkpoints: Object.keys(tcReplies).length
        ? { [targetCheckpointId]: { replies: tcReplies["_generated"]?.replies ?? [] } }
        : {},
    };

    const stubCheckpoints: Checkpoint[] = transitions.map(t => ({
      id: t.to,
      name: `Upcoming Beat`,
      objective: "To be revealed…",
      _isStub: true,
    } as Checkpoint & { _isStub: true }));

    return { roadmap: updatedRoadmap, checkpoint: fullCheckpoint, transitions, talkControl };
  }

  static buildCharacterSummaries(): CharacterSummary[] {
    try {
      const script = (window as unknown as Record<string, unknown>)["characters"];
      if (!Array.isArray(script)) return [];
      return script
        .filter(c => c?.name)
        .map(c => ({
          name: String(c.name).trim(),
          description: typeof c.description === "string" ? c.description.trim().slice(0, 200) : undefined,
        }));
    } catch {
      return [];
    }
  }

  static buildWorldInfoSummaries(): string[] {
    try {
      const ctx = getContext();
      const worldInfoObj = (ctx as unknown as Record<string, unknown>)?.worldInfo;
      if (!worldInfoObj || typeof worldInfoObj !== "object") return [];
      return Object.values(worldInfoObj as Record<string, unknown>)
        .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
        .filter(e => !e.disable && e.comment)
        .map(e => String(e.comment).trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }
}
