import {
  NPC_REPLY_KINDS, NPC_REPLY_TRIGGERS, ROSTER_VIEWS, TALK_CHAIN_MAX_CAP, TENSION_LEVELS, type BackgroundEffect, type AgencyPolicy, type Checkpoint,
  type CheckpointEffects, type PrimitiveValue, type StoryV2, type TalkControl, type TalkControlChain, type TalkControlSpeaker,
  type ValidationError,
} from "../schema";
import { isRecord } from "@utils/guards";
import { addError, asString, isOneOf, rejectUnknownKeys } from "./common";

const readMemberText = (member: Record<string, unknown>, key: "role" | "drive", path: string, errors: ValidationError[]) => {
  const { [key]: value, ...rest } = member;
  if (value === undefined) return member;
  if (typeof value !== "string") {
    addError(errors, `${path}.${key}`, `roster ${key} must be a string`);
    return member;
  }
  return value.trim() ? { ...rest, [key]: value.trim() } : rest;
};

export const readRoster = (roster: StoryV2["roster"], errors: ValidationError[]): StoryV2["roster"] => roster.map((member, index) => {
  if (!isRecord(member)) return member;
  const path = `roster.${index}`;
  if (member.view !== undefined && !isOneOf(member.view, ROSTER_VIEWS)) addError(errors, `${path}.view`, "roster view must be own or omniscient");
  return readMemberText(readMemberText(member, "role", path, errors), "drive", path, errors) as StoryV2["roster"][number];
});

const readMotives = (value: unknown, path: string, errors: ValidationError[]): Record<string, string> | undefined => {
  if (!isRecord(value)) {
    addError(errors, path, "motives must be an object of roster id to text");
    return undefined;
  }
  const motives: Record<string, string> = {};
  Object.entries(value).forEach(([id, text]) => {
    if (typeof text !== "string") addError(errors, `${path}.${id}`, "a motive must be text");
    else if (id.trim() && text.trim()) motives[id.trim()] = text.trim();
  });
  return Object.keys(motives).length ? motives : undefined;
};

// `background: "tavern day.jpg"` and `background: { name: "tavern day.jpg" }` are the same effect;
// the shorthand collapses here so the applier only ever sees one shape.
const readBackground = (value: unknown, path: string, errors: ValidationError[]): BackgroundEffect | undefined => {
  const name = typeof value === "string" ? asString(value) : isRecord(value) ? asString(value.name) : null;
  if (!name) {
    addError(errors, path, "background must be a filename string or { name }");
    return undefined;
  }
  return { name: name.trim() };
};

const readCheckpointEffects = (value: unknown, path: string, errors: ValidationError[]): CheckpointEffects | null => {
  if (!isRecord(value)) return null;
  const effects: CheckpointEffects = { ...value };
  if (value.background !== undefined) {
    const background = readBackground(value.background, `${path}.background`, errors);
    if (background) effects.background = background;
    else delete effects.background;
  }
  if (value.npc_replies === undefined) return effects;
  if (!Array.isArray(value.npc_replies)) {
    addError(errors, `${path}.npc_replies`, "npc_replies must be an array");
    delete effects.npc_replies;
    return effects;
  }
  const replies = value.npc_replies.map((entry, index) => {
    const replyPath = `${path}.npc_replies.${index}`;
    if (!isRecord(entry)) {
      addError(errors, replyPath, "npc reply must be an object");
      return null;
    }
    const trigger = isOneOf(entry.trigger, NPC_REPLY_TRIGGERS) ? entry.trigger : null;
    const member = asString(entry.member);
    const kind = isOneOf(entry.kind, NPC_REPLY_KINDS) ? entry.kind : null;
    if (!trigger) addError(errors, `${replyPath}.trigger`, "npc reply trigger is invalid");
    if (!member) addError(errors, `${replyPath}.member`, "npc reply member is required");
    if (!kind) addError(errors, `${replyPath}.kind`, "npc reply kind is invalid");
    if (entry.new_chat_only !== undefined && (entry.new_chat_only !== true || trigger !== "onEnter" || kind !== "scripted")) {
      addError(errors, `${replyPath}.new_chat_only`, "new_chat_only requires a scripted onEnter reply");
    }
    if (!trigger || !member || !kind) return null;
    return {
      trigger,
      member,
      kind,
      ...(entry.new_chat_only === true && trigger === "onEnter" && kind === "scripted" ? { new_chat_only: true } : {}),
      ...(typeof entry.text === "string" ? { text: entry.text } : {}),
      ...(typeof entry.instruction === "string" ? { instruction: entry.instruction } : {}),
      ...(typeof entry.maxTriggers === "number" && Number.isFinite(entry.maxTriggers) ? { maxTriggers: entry.maxTriggers } : {}),
      ...(typeof entry.probability === "number" && Number.isFinite(entry.probability) ? { probability: entry.probability } : {}),
      ...(asString(entry.after_member) ? { after_member: entry.after_member as string } : {}),
      ...(typeof entry.enabled === "boolean" ? { enabled: entry.enabled } : {}),
    };
  }).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  effects.npc_replies = replies;
  return effects;
};

const AGENCY_KEYS = ["protect_player_choice", "never_narrate_player_action", "objective_kind", "alternate", "player_attempts_only"] as const;

// An unknown objective_kind is an error rather than a silent default: the whole
// point of the field is that the author said which objective this is.
const readAgency = (value: unknown, path: string, errors: ValidationError[]): Partial<AgencyPolicy> | null => {
  if (!isRecord(value)) {
    addError(errors, path, "agency must be an object");
    return null;
  }
  rejectUnknownKeys(value, AGENCY_KEYS, path, errors);
  const agency: Partial<AgencyPolicy> = {};
  if (value.protect_player_choice !== undefined) {
    if (typeof value.protect_player_choice !== "boolean") addError(errors, `${path}.protect_player_choice`, "must be a boolean");
    else agency.protect_player_choice = value.protect_player_choice;
  }
  if (value.never_narrate_player_action !== undefined) {
    if (typeof value.never_narrate_player_action !== "boolean") addError(errors, `${path}.never_narrate_player_action`, "must be a boolean");
    else agency.never_narrate_player_action = value.never_narrate_player_action;
  }
  const kind = asString(value.objective_kind);
  if (value.objective_kind !== undefined) {
    if (kind !== "world_pressure" && kind !== "player_action") addError(errors, `${path}.objective_kind`, "must be world_pressure or player_action");
    else agency.objective_kind = kind;
  }
  const alternate = asString(value.alternate);
  if (alternate) agency.alternate = alternate;
  if (value.player_attempts_only !== undefined) {
    if (typeof value.player_attempts_only !== "boolean") addError(errors, `${path}.player_attempts_only`, "must be a boolean");
    else agency.player_attempts_only = value.player_attempts_only;
  }
  return agency;
};

const readTalkControl = (value: unknown, path: string, errors: ValidationError[]): TalkControl | null => {
  if (!isRecord(value)) {
    addError(errors, path, "talk_control must be an object");
    return null;
  }
  const control: TalkControl = {};
  if (value.speakers !== undefined) {
    if (!Array.isArray(value.speakers)) {
      addError(errors, `${path}.speakers`, "speakers must be an array");
      return null;
    }
    control.speakers = value.speakers.map((entry, index) => {
      const speakerPath = `${path}.speakers.${index}`;
      if (typeof entry === "string") {
        if (entry.trim()) return { member: entry };
        addError(errors, speakerPath, "speaker member is required");
        return null;
      }
      if (!isRecord(entry)) {
        addError(errors, speakerPath, "speaker must be a member string or object");
        return null;
      }
      const member = asString(entry.member);
      if (!member) {
        addError(errors, `${speakerPath}.member`, "speaker member is required");
        return null;
      }
      if (entry.weight !== undefined && (typeof entry.weight !== "number" || !Number.isFinite(entry.weight) || entry.weight <= 0)) {
        addError(errors, `${speakerPath}.weight`, "speaker weight must be a positive number");
        return null;
      }
      return { member, ...(typeof entry.weight === "number" ? { weight: entry.weight } : {}) };
    }).filter((entry): entry is TalkControlSpeaker => entry !== null);
  }
  if (value.lead !== undefined) {
    const lead = asString(value.lead);
    if (!lead) addError(errors, `${path}.lead`, "lead must be a non-empty string");
    else control.lead = lead;
  }
  if (value.no_repeat !== undefined) {
    if (typeof value.no_repeat !== "boolean") addError(errors, `${path}.no_repeat`, "no_repeat must be a boolean");
    else control.no_repeat = value.no_repeat;
  }
  if (value.allow_silence !== undefined) {
    if (typeof value.allow_silence !== "boolean") addError(errors, `${path}.allow_silence`, "allow_silence must be a boolean");
    else control.allow_silence = value.allow_silence;
  }
  if (value.director !== undefined) {
    if (typeof value.director === "boolean") control.director = value.director;
    else if (isRecord(value.director)) {
      if (value.director.instruction !== undefined && typeof value.director.instruction !== "string") {
        addError(errors, `${path}.director.instruction`, "director instruction must be a string");
      } else {
        control.director = typeof value.director.instruction === "string" ? { instruction: value.director.instruction } : {};
      }
    } else {
      addError(errors, `${path}.director`, "director must be a boolean or object");
    }
  }
  if (value.chain !== undefined) {
    if (value.chain === false) {
      control.chain = false;
    } else if (isRecord(value.chain)) {
      const chain: TalkControlChain = {};
      if (value.chain.mode !== undefined) {
        if (value.chain.mode === "director" || value.chain.mode === "scripted") chain.mode = value.chain.mode;
        else addError(errors, `${path}.chain.mode`, "chain mode must be director or scripted");
      }
      if (value.chain.max !== undefined) {
        if (typeof value.chain.max !== "number" || !Number.isInteger(value.chain.max) || value.chain.max < 1 || value.chain.max > TALK_CHAIN_MAX_CAP) {
          addError(errors, `${path}.chain.max`, `chain max must be an integer between 1 and ${TALK_CHAIN_MAX_CAP}`);
        } else {
          chain.max = value.chain.max;
        }
      }
      if (value.chain.sequence !== undefined) {
        if (!Array.isArray(value.chain.sequence) || value.chain.sequence.some((entry) => typeof entry !== "string" || !entry.trim())) {
          addError(errors, `${path}.chain.sequence`, "chain sequence must be an array of member names");
        } else {
          chain.sequence = value.chain.sequence as string[];
        }
      }
      for (const key of ["stop_on_transition", "hold_extraction", "stop_on_player"] as const) {
        if (value.chain[key] === undefined) continue;
        if (typeof value.chain[key] !== "boolean") addError(errors, `${path}.chain.${key}`, `chain ${key} must be a boolean`);
        else chain[key] = value.chain[key] as boolean;
      }
      if (chain.mode === "scripted" && !chain.sequence?.length) addError(errors, `${path}.chain.sequence`, "a scripted chain needs a sequence");
      control.chain = chain;
    } else {
      addError(errors, `${path}.chain`, "chain must be an object or false");
    }
  }
  return control;
};

export const readCheckpoint = (value: unknown, path: string, errors: ValidationError[]): Checkpoint | null => {
  if (!isRecord(value)) {
    addError(errors, path, "checkpoint must be an object");
    return null;
  }

  const id = asString(value.id);
  const name = asString(value.name);
  const objective = typeof value.objective === "string" ? value.objective : null;
  const type = value.type === "anchor" || value.type === "intermediate" ? value.type : null;

  if (!id) addError(errors, `${path}.id`, "checkpoint id is required");
  if (!name) addError(errors, `${path}.name`, "checkpoint name is required");
  if (objective === null) addError(errors, `${path}.objective`, "checkpoint objective is required");
  if (!type) addError(errors, `${path}.type`, "checkpoint type is invalid");
  if (!id || !name || objective === null || !type) return null;

  const checkpoint: Checkpoint = { id, name, objective, type };
  for (const key of ["player_name", "player_text"] as const) {
    const text = value[key];
    if (text !== undefined && typeof text !== "string") addError(errors, `${path}.${key}`, `${key} must be text`);
    else if (typeof text === "string" && text.trim()) checkpoint[key] = text.trim();
  }
  if (typeof value.start === "boolean") checkpoint.start = value.start;
  if (isRecord(value.state_snapshot)) checkpoint.state_snapshot = value.state_snapshot as Record<string, PrimitiveValue>;
  if (isOneOf(value.tension_target, TENSION_LEVELS)) checkpoint.tension_target = value.tension_target;
  if (typeof value.target_turn_length === "number" && Number.isFinite(value.target_turn_length)) {
    checkpoint.target_turn_length = value.target_turn_length;
  }
  if (isRecord(value.effects)) checkpoint.effects = readCheckpointEffects(value.effects, `${path}.effects`, errors) ?? undefined;
  if (value.talk_control !== undefined) checkpoint.talk_control = readTalkControl(value.talk_control, `${path}.talk_control`, errors) ?? undefined;
  if (value.agency !== undefined) {
    const agency = readAgency(value.agency, `${path}.agency`, errors);
    if (agency) checkpoint.agency = agency;
  }
  if (typeof value.guidance === "string") checkpoint.guidance = value.guidance;
  if (typeof value.convergence_threshold === "number" && Number.isFinite(value.convergence_threshold)) {
    checkpoint.convergence_threshold = value.convergence_threshold;
  }
  const motives = value.motives === undefined ? undefined : readMotives(value.motives, `${path}.motives`, errors);
  if (motives) checkpoint.motives = motives;
  return checkpoint;
};
