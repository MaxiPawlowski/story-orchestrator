import {
  GATE_OPERATORS, type Checkpoint, type GateLeaf, type GateNode, type NormalizedTransition, type PrimitiveValue,
  type Quality, type QualityType, type Transition, type ValidationError,
} from "../schema";
import { isRecord } from "@utils/guards";
import { addError, asString, isOneOf, isPrimitive } from "./common";
import { gameLayer } from "./gameLayer";

export const readGate = (value: unknown, path: string, errors: ValidationError[]): GateNode | null => {
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

export const readTransition = (value: unknown, path: string, errors: ValidationError[]): Transition | null => {
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
  const check = value.check === undefined ? null : gameLayer()?.readCheck(value.check, `${path}.check`, errors) ?? null;
  return check ? { ...transition, check } : transition;
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

export const validateLiteral = (quality: Quality, value: PrimitiveValue, path: string, errors: ValidationError[]) => {
  if (!typeMatches(quality.type, value)) {
    addError(errors, path, `value does not match ${quality.type}`);
    return;
  }
  if (quality.type === "enum" && !quality.values?.includes(String(value))) {
    addError(errors, path, `enum value '${String(value)}' is not declared`);
  }
};

export const validateGate = (gate: GateNode, qualityByKey: Record<string, Quality>, path: string, errors: ValidationError[]) => {
  if ("q" in gate) {
    validateGateLeaf(gate, qualityByKey, path, errors);
    return;
  }
  if ("all" in gate) gate.all.forEach((entry, index) => validateGate(entry, qualityByKey, `${path}.all.${index}`, errors));
  if ("any" in gate) gate.any.forEach((entry, index) => validateGate(entry, qualityByKey, `${path}.any.${index}`, errors));
  if ("not" in gate) validateGate(gate.not, qualityByKey, `${path}.not`, errors);
};

export const buildReachability = (checkpoints: Checkpoint[], transitions: NormalizedTransition[]) => {
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
