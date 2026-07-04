import {
  GATE_OPERATORS,
  QUALITY_SOURCES,
  QUALITY_TYPES,
  TENSION_LEVELS,
  type Checkpoint,
  type GateLeaf,
  type GateNode,
  type NormalizedStoryV2,
  type NormalizedTransition,
  type PrimitiveValue,
  type Quality,
  type QualityType,
  type StoryV2,
  type Transition,
  type ValidationError,
} from "./schema";
import { progressQualityForAnchor } from "./convergence";

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
};

const isPrimitive = (value: unknown): value is PrimitiveValue => {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
};

const addError = (errors: ValidationError[], path: string, message: string) => {
  errors.push({ path, message });
};

const asString = (value: unknown): string | null => typeof value === "string" && value.trim() ? value : null;

const isOneOf = <T extends readonly string[]>(value: unknown, values: T): value is T[number] => {
  return typeof value === "string" && (values as readonly string[]).includes(value);
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
  };
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
  if (isRecord(value.effects)) checkpoint.effects = value.effects;
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

export const parseStoryV2 = (json: unknown): NormalizedStoryV2 | ValidationError[] => {
  const errors: ValidationError[] = [];
  if (!isRecord(json)) return [{ path: "$", message: "story must be an object" }];
  if (json.format !== 2) addError(errors, "format", "story format must be 2");
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
  const qualities = addProgressQualities(baseQualities, checkpoints, errors);

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
    title: json.title as string,
    description: json.description as string,
    qualities,
    checkpoints,
    transitions,
    roster: (json.roster as StoryV2["roster"]),
    ...(json.arc_template !== undefined ? { arc_template: json.arc_template } : {}),
    ...(json.requirements !== undefined ? { requirements: json.requirements } : {}),
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
