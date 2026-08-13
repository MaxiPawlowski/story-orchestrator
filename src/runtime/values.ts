import type { PrimitiveValue, QualityType } from "@engine/index";

// Author-typed text (slash commands, the driver) into a typed blackboard value. `undefined` means
// "this text is not a value of that type" — never a silent coercion.
export const parseQualityValue = (type: QualityType | string, value: string): PrimitiveValue | undefined => {
  const trimmed = value.trim();
  if (type === "bool") {
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
    return undefined;
  }
  if (type === "int") {
    const parsed = Number(trimmed);
    return Number.isInteger(parsed) ? parsed : undefined;
  }
  if (type === "float") {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return trimmed;
};
