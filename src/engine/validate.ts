import {
  ARC_TEMPLATE_NAMES,
  GATE_OPERATORS,
  NPC_REPLY_KINDS,
  NPC_REPLY_TRIGGERS,
  QUALITY_SOURCES,
  QUALITY_TYPES,
  STORY_ID_PATTERN,
  TENSION_CURRENT_KEY,
  TENSION_LEVELS,
  type ArcTemplate,
  type BackgroundEffect,
  type AgencyPolicy,
  type Checkpoint,
  type CheckpointEffects,
  type GateLeaf,
  type GateNode,
  type NormalizedStoryV2,
  type NormalizedTransition,
  type PrimitiveValue,
  type Quality,
  type QualityType,
  type StoryRequirements,
  type QualityCriterion,
  type QualityRatingLevel,
  type StoryLoreSelect,
  type StorySceneRead,
  type StoryStagecraft,
  type StoryV2,
  type TalkControl,
  type TalkControlSpeaker,
  type Transition,
  type ValidationError,
} from "./schema";
import { QUALITY_READ_AS, ratingLevels, READ_AS_TYPES } from "./qualityRead";
import { progressQualityForAnchor } from "./convergence";

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
};

const isPrimitive = (value: unknown): value is PrimitiveValue => {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
};

const readRoster = (roster: StoryV2["roster"], errors: ValidationError[]): StoryV2["roster"] => roster.map((member, index) => {
  if (!isRecord(member) || member.role === undefined) return member;
  if (typeof member.role !== "string") {
    addError(errors, `roster.${index}.role`, "roster role must be a string");
    return member;
  }
  const { role, ...rest } = member;
  return role.trim() ? { ...rest, role: role.trim() } : rest;
});

const addError = (errors: ValidationError[], path: string, message: string) => {
  errors.push({ path, message });
};

const asString = (value: unknown): string | null => typeof value === "string" && value.trim() ? value : null;

const isOneOf = <T extends readonly string[]>(value: unknown, values: T): value is T[number] => {
  return typeof value === "string" && (values as readonly string[]).includes(value);
};

const readCriterion = (value: unknown): string | QualityCriterion | null => {
  if (typeof value === "string") return value.trim() || null;
  if (!isRecord(value) || typeof value.what !== "string" || !value.what.trim()) return null;
  const examples = Array.isArray(value.examples) ? value.examples.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
  return { what: value.what.trim(), ...(typeof value.not_for === "string" && value.not_for.trim() ? { not_for: value.not_for.trim() } : {}), ...(examples.length ? { examples } : {}) };
};

// v2.2 plan 06: `read_as` + `criteria`. A hint that cannot work is an error, never a silent no-op.
const readQualityRead = (value: Record<string, unknown>, type: Quality["type"], source: Quality["source"], rubric: string, values: string[] | undefined, path: string, errors: ValidationError[]): Pick<Quality, "read_as" | "criteria"> => {
  if (value.read_as === undefined) {
    if (value.criteria !== undefined) addError(errors, `${path}.criteria`, "criteria need a read_as hint");
    return {};
  }
  if (!isOneOf(value.read_as, QUALITY_READ_AS)) {
    addError(errors, `${path}.read_as`, "read_as must be choice, stated or rating");
    return {};
  }
  const readAs = value.read_as;
  if (source !== "extractor") addError(errors, `${path}.read_as`, "only extractor qualities can be read by the judge");
  if (!READ_AS_TYPES[readAs].includes(type)) addError(errors, `${path}.read_as`, `read_as ${readAs} does not fit a ${type} quality`);
  if (value.criteria === undefined) {
    if (readAs === "rating" && !ratingLevels({ rubric })) addError(errors, `${path}.criteria`, "a rating needs criteria.levels or a rubric that reads \"from N (low) to M (high)\", for example \"from 1 (barely) to 5 (completely)\"");
    return { read_as: readAs };
  }
  if (!isRecord(value.criteria)) {
    addError(errors, `${path}.criteria`, "criteria must be an object");
    return { read_as: readAs };
  }
  if (readAs === "rating") {
    const levels = Array.isArray(value.criteria.levels)
      ? value.criteria.levels.filter((level): level is QualityRatingLevel => isRecord(level) && typeof level.value === "number" && typeof level.label === "string" && level.label.trim().length > 0)
      : [];
    if (levels.length < 2) addError(errors, `${path}.criteria.levels`, "a rating needs at least two levels with a number value and a label");
    return levels.length >= 2 ? { read_as: readAs, criteria: { levels } } : { read_as: readAs };
  }
  if (readAs === "stated") {
    addError(errors, `${path}.criteria`, "a stated quality takes no criteria: its options are found in the text");
    return { read_as: readAs };
  }
  const allowed = new Set(type === "bool" ? ["true", "false"] : values ?? []);
  const criteria: Record<string, string | QualityCriterion> = {};
  Object.entries(value.criteria).forEach(([option, raw]) => {
    if (!allowed.has(option)) {
      addError(errors, `${path}.criteria.${option}`, `'${option}' is not ${type === "bool" ? "true or false" : "one of the enum values"}`);
      return;
    }
    const criterion = readCriterion(raw);
    if (!criterion) addError(errors, `${path}.criteria.${option}`, "a criterion is text or { what, not_for?, examples? }");
    else criteria[option] = criterion;
  });
  return { read_as: readAs, ...(Object.keys(criteria).length ? { criteria } : {}) };
};

const readQuality = (value: unknown, path: string, errors: ValidationError[]): Quality | null => {
  if (!isRecord(value)) {
    addError(errors, path, "quality must be an object");
    return null;
  }

  const key = asString(value.key);
  const type = isOneOf(value.type, QUALITY_TYPES) ? value.type : null;
  const source = isOneOf(value.source, QUALITY_SOURCES) ? value.source : null;
  const rubric = asString(value.rubric);

  if (!key) addError(errors, `${path}.key`, "quality key is required");
  if (!type) addError(errors, `${path}.type`, "quality type is invalid");
  if (!source) addError(errors, `${path}.source`, "quality source is invalid");
  if (!rubric) addError(errors, `${path}.rubric`, "quality rubric is required");

  if (!key || !type || !source || !rubric) return null;

  const values = Array.isArray(value.values) ? value.values.filter((entry): entry is string => typeof entry === "string") : undefined;
  if (type === "enum" && (!values || values.length === 0)) {
    addError(errors, `${path}.values`, "enum qualities require values");
    return null;
  }
  if (type !== "enum" && values?.length) {
    addError(errors, `${path}.values`, "values are only valid for enum qualities");
    return null;
  }
  if (source === "code" && isRecord(value.ledger_binding)) {
    addError(errors, `${path}.ledger_binding`, "code qualities cannot bind to ledger fields");
    return null;
  }

  const ledgerBinding = isRecord(value.ledger_binding)
    && typeof value.ledger_binding.entity === "string"
    && typeof value.ledger_binding.field === "string"
    ? { entity: value.ledger_binding.entity, field: value.ledger_binding.field }
    : undefined;

  return {
    key,
    type,
    source,
    rubric,
    ...(values ? { values } : {}),
    ...(typeof value.latching === "boolean" ? { latching: value.latching } : {}),
    ...(typeof value.monotonic === "boolean" ? { monotonic: value.monotonic } : {}),
    ...(isRecord(value.scope_hint) ? { scope_hint: value.scope_hint as Quality["scope_hint"] } : {}),
    ...(ledgerBinding ? { ledger_binding: ledgerBinding } : {}),
    ...readQualityRead(value, type, source, rubric, values, path, errors),
  };
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
    if (!trigger || !member || !kind) return null;
    return {
      trigger,
      member,
      kind,
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

// v2.3 plan 07 (C4). Authored aliases normalize the same way requirements' do, and an unknown
// objective_kind is an error rather than a silent default: the whole point of the field is that the
// author said which objective this is.
const readAgency = (value: unknown, path: string, errors: ValidationError[]): Partial<AgencyPolicy> | null => {
  if (!isRecord(value)) {
    addError(errors, path, "agency must be an object");
    return null;
  }
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
  const alternate = asString(value.alternate ?? value.fallback);
  if (alternate) agency.alternate = alternate;
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
  return control;
};

const readCheckpoint = (value: unknown, path: string, errors: ValidationError[]): Checkpoint | null => {
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
  return checkpoint;
};

const readGate = (value: unknown, path: string, errors: ValidationError[]): GateNode | null => {
  if (!isRecord(value)) {
    addError(errors, path, "gate must be an object");
    return null;
  }

  if ("q" in value || "op" in value || "v" in value) {
    const q = asString(value.q);
    const op = isOneOf(value.op, GATE_OPERATORS) ? value.op : null;
    const v = value.v;
    if (!q) addError(errors, `${path}.q`, "gate quality key is required");
    if (!op) addError(errors, `${path}.op`, "gate operator is invalid");
    if (!isPrimitive(v) && !(Array.isArray(v) && v.every(isPrimitive))) {
      addError(errors, `${path}.v`, "gate value must be a literal or literal array");
    }
    if (!q || !op || (!isPrimitive(v) && !(Array.isArray(v) && v.every(isPrimitive)))) return null;
    return { q, op, v };
  }

  if (Array.isArray(value.all)) {
    const all = value.all.map((entry, index) => readGate(entry, `${path}.all.${index}`, errors)).filter((entry): entry is GateNode => entry !== null);
    return { all };
  }
  if (Array.isArray(value.any)) {
    const any = value.any.map((entry, index) => readGate(entry, `${path}.any.${index}`, errors)).filter((entry): entry is GateNode => entry !== null);
    return { any };
  }
  if ("not" in value) {
    const not = readGate(value.not, `${path}.not`, errors);
    return not ? { not } : null;
  }

  addError(errors, path, "gate must be a leaf, all, any, or not node");
  return null;
};

const readTransition = (value: unknown, path: string, errors: ValidationError[]): Transition | null => {
  if (!isRecord(value)) {
    addError(errors, path, "transition must be an object");
    return null;
  }
  const from = asString(value.from);
  const to = asString(value.to);
  const priority = typeof value.priority === "number" && Number.isFinite(value.priority) ? value.priority : null;
  const gate = readGate(value.gate, `${path}.gate`, errors);
  if (!from) addError(errors, `${path}.from`, "transition from is required");
  if (!to) addError(errors, `${path}.to`, "transition to is required");
  if (priority === null) addError(errors, `${path}.priority`, "transition priority is required");
  if (!from || !to || priority === null || !gate) return null;

  const transition: Transition = { from, to, priority, gate };
  if (isRecord(value.effects)) transition.effects = value.effects as Transition["effects"];
  if (typeof value.extractor_trigger === "string") transition.extractor_trigger = value.extractor_trigger;
  if (typeof value.extraction_hint === "string") transition.extraction_hint = value.extraction_hint;
  return transition;
};

const typeMatches = (type: QualityType, value: PrimitiveValue): boolean => {
  if (type === "bool") return typeof value === "boolean";
  if (type === "string" || type === "enum") return typeof value === "string";
  if (type === "float") return typeof value === "number" && Number.isFinite(value);
  return typeof value === "number" && Number.isInteger(value);
};

const validateGateLeaf = (leaf: GateLeaf, qualityByKey: Record<string, Quality>, path: string, errors: ValidationError[]) => {
  const quality = qualityByKey[leaf.q];
  if (!quality) {
    addError(errors, path, `unknown quality '${leaf.q}'`);
    return;
  }
  if ([">=", "<=", ">", "<"].includes(leaf.op) && quality.type !== "int" && quality.type !== "float") {
    addError(errors, `${path}.op`, "ordered comparisons require numeric qualities");
  }
  if (leaf.op === "in") {
    if (!Array.isArray(leaf.v)) {
      addError(errors, `${path}.v`, "in requires an array value");
      return;
    }
    if (quality.type !== "enum" && quality.type !== "string") {
      addError(errors, `${path}.op`, "in requires enum or string qualities");
    }
    leaf.v.forEach((entry, index) => validateLiteral(quality, entry, `${path}.v.${index}`, errors));
    return;
  }
  if (Array.isArray(leaf.v)) {
    addError(errors, `${path}.v`, "only in accepts array values");
    return;
  }
  validateLiteral(quality, leaf.v, `${path}.v`, errors);
};

const validateLiteral = (quality: Quality, value: PrimitiveValue, path: string, errors: ValidationError[]) => {
  if (!typeMatches(quality.type, value)) {
    addError(errors, path, `value does not match ${quality.type}`);
    return;
  }
  if (quality.type === "enum" && !quality.values?.includes(String(value))) {
    addError(errors, path, `enum value '${String(value)}' is not declared`);
  }
};

const validateGate = (gate: GateNode, qualityByKey: Record<string, Quality>, path: string, errors: ValidationError[]) => {
  if ("q" in gate) {
    validateGateLeaf(gate, qualityByKey, path, errors);
    return;
  }
  if ("all" in gate) gate.all.forEach((entry, index) => validateGate(entry, qualityByKey, `${path}.all.${index}`, errors));
  if ("any" in gate) gate.any.forEach((entry, index) => validateGate(entry, qualityByKey, `${path}.any.${index}`, errors));
  if ("not" in gate) validateGate(gate.not, qualityByKey, `${path}.not`, errors);
};

const buildReachability = (checkpoints: Checkpoint[], transitions: NormalizedTransition[]) => {
  const direct = new Map<string, string[]>();
  checkpoints.forEach((checkpoint) => direct.set(checkpoint.id, []));
  transitions.forEach((transition) => direct.get(transition.from)?.push(transition.to));

  return Object.fromEntries(checkpoints.map((checkpoint) => {
    const seen = new Set<string>();
    const stack = [...(direct.get(checkpoint.id) ?? [])];
    while (stack.length) {
      const next = stack.shift();
      if (!next || seen.has(next)) continue;
      seen.add(next);
      stack.push(...(direct.get(next) ?? []));
    }
    return [checkpoint.id, [...seen]];
  }));
};

const addProgressQualities = (qualities: Quality[], checkpoints: Checkpoint[], errors: ValidationError[]) => {
  const used = new Set(qualities.map((quality) => quality.key));
  const next = [...qualities];
  checkpoints.filter((checkpoint) => checkpoint.type === "anchor").forEach((anchor) => {
    const key = progressQualityForAnchor(anchor.id);
    const existing = next.find((quality) => quality.key === key);
    if (existing) {
      if (existing.source !== "code" || existing.type !== "float" || !existing.monotonic) {
        addError(errors, `qualities.${key}`, "progress qualities must be code float monotonic");
      }
      return;
    }
    if (!used.has(key)) {
      used.add(key);
      next.push({ key, type: "float", source: "code", monotonic: true, rubric: `Code-set convergence progress toward ${anchor.id}` });
    }
  });
  return next;
};

const addBuiltinTensionQuality = (qualities: Quality[], errors: ValidationError[]) => {
  const existing = qualities.find((quality) => quality.key === TENSION_CURRENT_KEY);
  if (existing) {
    if (existing.type !== "float" || existing.source !== "extractor") {
      addError(errors, `qualities.${TENSION_CURRENT_KEY}`, "tension_current must be an extractor float quality");
    }
    return qualities;
  }
  return [...qualities, {
    key: TENSION_CURRENT_KEY,
    type: "float" as const,
    source: "extractor" as const,
    rubric: "Current dramatic tension, read as a named level and smoothed into a 0-1 value",
  }];
};

const readRequirementList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim());
  return typeof value === "string" && value.trim() ? [value.trim()] : [];
};

// Authored aliases collapse here so nothing downstream has to know them (runtime/requirements.ts,
// the Studio editor and the wizard all read {personas, members, lorebooks}).
const readRequirements = (value: unknown, errors: ValidationError[]): StoryRequirements | undefined => {
  if (!isRecord(value)) {
    addError(errors, "requirements", "requirements must be an object");
    return undefined;
  }
  const personas = readRequirementList(value.personas ?? value.persona);
  const members = readRequirementList(value.members ?? value.groupMembers ?? value.group_members);
  const lorebooks = readRequirementList(value.lorebooks ?? value.globalLorebooks ?? value.global_lorebooks);
  return {
    ...(personas.length ? { personas } : {}),
    ...(members.length ? { members } : {}),
    ...(lorebooks.length ? { lorebooks } : {}),
  };
};

// The curator's write scope, authored explicitly. An empty list is no scope at all, which is the
// safe default: nothing here is inferred from requirements or world_info effects.
const readStagecraft = (value: unknown, errors: ValidationError[]): StoryStagecraft | undefined => {
  if (!isRecord(value)) {
    addError(errors, "stagecraft", "stagecraft must be an object");
    return undefined;
  }
  const lorebooks = readRequirementList(value.lorebooks ?? value.lorebook);
  return lorebooks.length ? { lorebooks } : undefined;
};

const readSceneRead = (value: unknown, errors: ValidationError[]): StorySceneRead | undefined => {
  if (!isRecord(value)) {
    addError(errors, "scene_read", "scene_read must be an object");
    return undefined;
  }
  if (value.inject !== undefined && typeof value.inject !== "boolean") addError(errors, "scene_read.inject", "scene_read.inject must be true or false");
  const locations = readRequirementList(value.locations);
  const times = readRequirementList(value.times);
  const out: StorySceneRead = { ...(locations.length ? { locations } : {}), ...(times.length ? { times } : {}), ...(value.inject === false ? { inject: false } : {}) };
  return Object.keys(out).length ? out : undefined;
};

const readLoreSelect = (value: unknown, errors: ValidationError[]): StoryLoreSelect | undefined => {
  if (!isRecord(value)) {
    addError(errors, "lore_select", "lore_select must be an object");
    return undefined;
  }
  const lorebooks = readRequirementList(value.lorebooks ?? value.lorebook);
  const number = (key: "top_k" | "min_p", min: number, max: number) => {
    const raw = value[key];
    if (raw === undefined) return undefined;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < min || raw > max) {
      addError(errors, `lore_select.${key}`, `lore_select.${key} must be a number from ${min} to ${max}`);
      return undefined;
    }
    return key === "top_k" ? Math.round(raw) : raw;
  };
  const topK = number("top_k", 1, 12);
  const minP = number("min_p", 0, 1);
  return lorebooks.length ? { lorebooks, ...(topK !== undefined ? { top_k: topK } : {}), ...(minP !== undefined ? { min_p: minP } : {}) } : undefined;
};

const readArcTemplate = (value: unknown, errors: ValidationError[]): ArcTemplate | undefined => {
  if (isOneOf(value, ARC_TEMPLATE_NAMES)) return value;
  if (isRecord(value) && Array.isArray(value.points)) {
    const points = value.points.map((entry, index) => {
      if (!isRecord(entry) || typeof entry.at !== "number" || typeof entry.tension !== "number"
        || entry.at < 0 || entry.at > 1 || entry.tension < 0 || entry.tension > 1) {
        addError(errors, `arc_template.points.${index}`, "each point needs at and tension in [0,1]");
        return null;
      }
      return { at: entry.at, tension: entry.tension };
    }).filter((entry): entry is { at: number; tension: number } => entry !== null);
    if (!points.length) {
      addError(errors, "arc_template.points", "custom arc_template needs at least one point");
      return undefined;
    }
    return { points };
  }
  addError(errors, "arc_template", `arc_template must be one of ${ARC_TEMPLATE_NAMES.join(", ")} or { points: [...] }`);
  return undefined;
};

export const parseStoryV2 = (json: unknown): NormalizedStoryV2 | ValidationError[] => {
  const errors: ValidationError[] = [];
  if (!isRecord(json)) return [{ path: "$", message: "story must be an object" }];
  if (json.format !== 2) addError(errors, "format", "story format must be 2");
  const storyId = json.id === undefined ? undefined : asString(json.id)?.trim().toLowerCase();
  if (json.id !== undefined && (!storyId || !STORY_ID_PATTERN.test(storyId))) {
    addError(errors, "id", "id must be a slug: lowercase letters, digits, '-' or '_', starting alphanumeric, max 64 chars");
  }
  const storyVersion = json.version === undefined ? 1 : (typeof json.version === "number" && Number.isInteger(json.version) && json.version >= 1 ? json.version : null);
  if (storyVersion === null) addError(errors, "version", "version must be an integer >= 1");
  if (typeof json.title !== "string") addError(errors, "title", "title is required");
  if (typeof json.description !== "string") addError(errors, "description", "description is required");
  if (!Array.isArray(json.qualities)) addError(errors, "qualities", "qualities must be an array");
  if (!Array.isArray(json.checkpoints)) addError(errors, "checkpoints", "checkpoints must be an array");
  if (!Array.isArray(json.transitions)) addError(errors, "transitions", "transitions must be an array");
  if (!Array.isArray(json.roster)) addError(errors, "roster", "roster must be an array");
  if (errors.length) return errors;

  const checkpoints = (json.checkpoints as unknown[]).map((entry, index) => readCheckpoint(entry, `checkpoints.${index}`, errors)).filter((entry): entry is Checkpoint => entry !== null);
  const baseQualities = (json.qualities as unknown[]).map((entry, index) => readQuality(entry, `qualities.${index}`, errors)).filter((entry): entry is Quality => entry !== null);
  const transitions = (json.transitions as unknown[]).map((entry, index) => readTransition(entry, `transitions.${index}`, errors)).filter((entry): entry is Transition => entry !== null);
  const qualities = addBuiltinTensionQuality(addProgressQualities(baseQualities, checkpoints, errors), errors);
  const arcTemplate = json.arc_template !== undefined ? readArcTemplate(json.arc_template, errors) : undefined;
  const requirements = json.requirements !== undefined ? readRequirements(json.requirements, errors) : undefined;
  const stagecraft = json.stagecraft !== undefined ? readStagecraft(json.stagecraft, errors) : undefined;
  const sceneRead = json.scene_read !== undefined ? readSceneRead(json.scene_read, errors) : undefined;
  const loreSelect = json.lore_select !== undefined ? readLoreSelect(json.lore_select, errors) : undefined;
  const roster = readRoster(json.roster as StoryV2["roster"], errors);
  const arcBridges = Array.isArray(json.arc_bridges) ? json.arc_bridges.map((entry, index) => {
    const bridgePath = `arc_bridges.${index}`;
    if (!isRecord(entry)) {
      addError(errors, bridgePath, "arc bridge must be an object");
      return null;
    }
    const arcMatch = asString(entry.arcMatch);
    const anchor = asString(entry.anchor);
    const amount = typeof entry.amount === "number" && Number.isFinite(entry.amount) ? entry.amount : null;
    if (!arcMatch) addError(errors, `${bridgePath}.arcMatch`, "arcMatch is required");
    if (!anchor) addError(errors, `${bridgePath}.anchor`, "anchor is required");
    if (amount === null) addError(errors, `${bridgePath}.amount`, "amount is required");
    return arcMatch && anchor && amount !== null ? { arcMatch, anchor, amount } : null;
  }).filter((entry): entry is NonNullable<typeof entry> => entry !== null) : undefined;

  const checkpointById: Record<string, Checkpoint> = {};
  checkpoints.forEach((checkpoint, index) => {
    if (checkpointById[checkpoint.id]) addError(errors, `checkpoints.${index}.id`, `duplicate checkpoint '${checkpoint.id}'`);
    checkpointById[checkpoint.id] = checkpoint;
  });

  const qualityByKey: Record<string, Quality> = {};
  qualities.forEach((quality, index) => {
    if (qualityByKey[quality.key]) addError(errors, `qualities.${index}.key`, `duplicate quality '${quality.key}'`);
    qualityByKey[quality.key] = quality;
  });

  const starts = checkpoints.filter((checkpoint) => checkpoint.start);
  if (starts.length > 1) addError(errors, "checkpoints", "only one checkpoint may be start");
  if (!checkpoints.length) addError(errors, "checkpoints", "at least one checkpoint is required");
  const startCheckpointId = starts[0]?.id ?? checkpoints[0]?.id ?? "";

  transitions.forEach((transition, index) => {
    if (!checkpointById[transition.from]) addError(errors, `transitions.${index}.from`, `unknown checkpoint '${transition.from}'`);
    if (!checkpointById[transition.to]) addError(errors, `transitions.${index}.to`, `unknown checkpoint '${transition.to}'`);
    validateGate(transition.gate, qualityByKey, `transitions.${index}.gate`, errors);
    if (transition.effects?.progress && !checkpointById[transition.effects.progress.anchor]) {
      addError(errors, `transitions.${index}.effects.progress.anchor`, `unknown anchor '${transition.effects.progress.anchor}'`);
    }
  });

  arcBridges?.forEach((bridge, index) => {
    if (!checkpointById[bridge.anchor] || checkpointById[bridge.anchor].type !== "anchor") {
      addError(errors, `arc_bridges.${index}.anchor`, `unknown anchor '${bridge.anchor}'`);
    }
  });

  checkpoints.forEach((checkpoint, checkpointIndex) => {
    Object.entries(checkpoint.state_snapshot ?? {}).forEach(([key, value]) => {
      const quality = qualityByKey[key];
      if (!quality) addError(errors, `checkpoints.${checkpointIndex}.state_snapshot.${key}`, `unknown quality '${key}'`);
      else validateLiteral(quality, value, `checkpoints.${checkpointIndex}.state_snapshot.${key}`, errors);
    });
  });

  const normalizedTransitions = transitions.map((transition, declarationIndex) => ({ ...transition, declarationIndex }));
  const reachableByCheckpoint = buildReachability(checkpoints, normalizedTransitions);
  checkpoints.forEach((checkpoint, index) => {
    if (checkpoint.type !== "intermediate") return;
    const reachableAnchors = reachableByCheckpoint[checkpoint.id]?.some((id) => checkpointById[id]?.type === "anchor");
    if (!reachableAnchors) addError(errors, `checkpoints.${index}`, "intermediate checkpoint has no reachable anchor beyond it");
  });

  if (errors.length) return errors;

  const outgoingByCheckpoint: Record<string, NormalizedTransition[]> = Object.fromEntries(checkpoints.map((checkpoint) => [checkpoint.id, []]));
  normalizedTransitions.forEach((transition) => outgoingByCheckpoint[transition.from]?.push(transition));
  Object.values(outgoingByCheckpoint).forEach((outgoing) => {
    outgoing.sort((left, right) => right.priority - left.priority || left.declarationIndex - right.declarationIndex);
  });

  return {
    format: 2,
    ...(storyId ? { id: storyId } : {}),
    version: storyVersion ?? 1,
    title: json.title as string,
    description: json.description as string,
    qualities,
    checkpoints,
    transitions,
    roster,
    ...(arcTemplate !== undefined ? { arc_template: arcTemplate } : {}),
    ...(arcBridges ? { arc_bridges: arcBridges } : {}),
    ...(requirements ? { requirements } : {}),
    ...(stagecraft ? { stagecraft } : {}),
    ...(sceneRead ? { scene_read: sceneRead } : {}),
    ...(loreSelect ? { lore_select: loreSelect } : {}),
    startCheckpointId,
    checkpointById,
    outgoingByCheckpoint,
    qualityByKey,
    reachableByCheckpoint,
  };
};

export const parseStoryV2OrThrow = (json: unknown): NormalizedStoryV2 => {
  const parsed = parseStoryV2(json);
  if (Array.isArray(parsed)) {
    throw new Error(parsed.map((error) => `${error.path}: ${error.message}`).join("; "));
  }
  return parsed;
};
