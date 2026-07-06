import type { GateLeaf, GateOperator, PrimitiveValue, Quality, QualityType } from "@engine/index";

export const opsForType = (type: QualityType): GateOperator[] => {
  if (type === "int" || type === "float") return ["==", "!=", ">=", "<=", ">", "<"];
  if (type === "bool") return ["==", "!="];
  return ["==", "!=", "in"];
};

export const defaultValueForOp = (quality: Quality, op: GateOperator): PrimitiveValue | PrimitiveValue[] => {
  if (op === "in") return [];
  if (quality.type === "bool") return false;
  if (quality.type === "int" || quality.type === "float") return 0;
  if (quality.type === "enum") return quality.values?.[0] ?? "";
  return "";
};

export const coerceOpForQuality = (quality: Quality, op: GateOperator): GateOperator => {
  const allowed = opsForType(quality.type);
  return allowed.includes(op) ? op : allowed[0];
};

export const defaultLeaf = (qualities: Quality[]): GateLeaf => {
  const quality = qualities[0];
  if (!quality) return { q: "", op: "==", v: "" };
  return { q: quality.key, op: "==", v: defaultValueForOp(quality, "==") };
};
