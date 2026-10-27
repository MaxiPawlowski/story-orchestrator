import { readsByStep, TENSION_CURRENT_KEY, TENSION_FRESH_MESSAGES, TENSION_LEVELS, type Quality, type TensionLevel } from "@engine/index";
import { STEP_READ_RULE } from "./stepRead";

const TENSION_SCALE: Record<TensionLevel, string> = {
  calm: "safety, rest, or routine; no active threat",
  stirring: "unease, foreshadowing, or first signs of trouble",
  tense: "open conflict, danger, or pressure in the current scene",
  critical: "high stakes in motion: violence, chase, ultimatum, imminent loss",
  peak: "climactic confrontation or catastrophe at full intensity",
};

export const WORLD_EVIDENCE_RULE = "Evidence must quote a line the player did not write.";
export const PARTY_EVIDENCE_RULE = "Evidence may quote the player's own line only where the player moves themselves or the party; anything else must quote a line the player did not write.";
export const PLAYER_MARK = " (player)";
export const STEP_READ_HEADER = `Every type=direction quality: ${STEP_READ_RULE}`;

export const renderQuestion = (quality: Quality, hints: readonly string[] = [], counted?: number): string => {
  const hintText = hints.length ? ` Hints: ${hints.join(" | ")}` : "";
  if (quality.key === TENSION_CURRENT_KEY) {
    return [
      `- ${TENSION_CURRENT_KEY}: type=level; Rate the tension as it stands in the newest ${TENSION_FRESH_MESSAGES} messages — pick the highest level whose description ` +
        `they meet, not the average mood; a threat earlier in the window that has since been answered, defused or left behind no longer counts. Write value as one ` +
        `quoted level and cite the strongest signal from those newest messages.${hintText}`,
      ...TENSION_LEVELS.map((level) => `  ${level}: ${TENSION_SCALE[level]}`),
    ].join("\n");
  }
  const allowed = quality.values?.length ? ` Allowed values: ${quality.values.join(", ")}.` : "";
  const world = quality.evidence_from === "party" ? ` ${PARTY_EVIDENCE_RULE}` : quality.evidence_from === "world" ? ` ${WORLD_EVIDENCE_RULE}` : "";
  const type = readsByStep(quality) ? "direction" : quality.type;
  const total = typeof counted === "number" ? ` ${runningTotalRule(counted)}` : "";
  return `- ${quality.key}: type=${type}; ${quality.rubric}${allowed}${hintText}${world}${total}`;
};

export const runningTotalRule = (counted: number): string =>
  `Current value: ${counted}, a running total for the whole story that already counts what earlier messages showed. ` +
  `Write the new total, never less than ${counted}: ${counted} plus what this transcript shows that the total cannot already include. If nothing new, write no DELTA for it.`;
