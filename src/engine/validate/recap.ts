import type { GateNode, Milestone, Quality, QualityType, Quest, QuestRecap, RecapText, Transition, ValidationError } from "../schema";
import { isRecord } from "@utils/guards";
import { addError, refuse, rejectUnknownKeys } from "./common";

type ReadGate = (value: unknown, path: string, errors: ValidationError[]) => GateNode | null;
type ValidateGate = (gate: GateNode, qualityByKey: Record<string, Quality>, path: string, errors: ValidationError[]) => void;

export const RECAP_TEXT_MAX = 240;
export const PLAYER_ACTION_MAX = 120;

const readLine = (value: unknown, path: string, errors: ValidationError[]): string | undefined => {
  if (value === undefined) return undefined;
  const text = typeof value === "string" ? value.trim() : "";
  return text && text.length <= RECAP_TEXT_MAX ? text : refuse(errors, path, `a recap line is text of at most ${RECAP_TEXT_MAX} characters`, undefined);
};

export const readRecapText = (value: unknown, path: string, errors: ValidationError[]): RecapText | undefined => {
  if (value === undefined) return undefined;
  if (typeof value === "string") {
    const text = readLine(value, path, errors);
    return text ? { text } : undefined;
  }
  if (!isRecord(value)) return refuse(errors, path, "recap is a line, or {text?, because?}", undefined);
  rejectUnknownKeys(value, ["text", "because"], path, errors);
  const text = readLine(value.text, `${path}.text`, errors);
  const because = readLine(value.because, `${path}.because`, errors);
  if (!text && !because) return refuse(errors, path, "recap needs text or because", undefined);
  return { ...(text ? { text } : {}), ...(because ? { because } : {}) };
};

const readQuestRecap = (value: unknown, path: string, errors: ValidationError[]): QuestRecap | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return refuse(errors, path, "a quest's recap is {done?, failed?}", undefined);
  rejectUnknownKeys(value, ["done", "failed"], path, errors);
  const done = readRecapText(value.done, `${path}.done`, errors);
  const failed = readRecapText(value.failed, `${path}.failed`, errors);
  return done || failed ? { ...(done ? { done } : {}), ...(failed ? { failed } : {}) } : undefined;
};

const readWhen = (value: Record<string, unknown>, hasRecap: boolean, path: string, errors: ValidationError[], readGate: ReadGate): GateNode | undefined => {
  if (value.recap_when === undefined) return undefined;
  if (!hasRecap) return refuse(errors, `${path}.recap_when`, "recap_when narrows an authored recap: add recap", undefined);
  return readGate(value.recap_when, `${path}.recap_when`, errors) ?? undefined;
};

export const readRecapFields = (value: Record<string, unknown>, path: string, errors: ValidationError[], readGate: ReadGate): Pick<Transition, "recap" | "recap_when"> => {
  const recap = readRecapText(value.recap, `${path}.recap`, errors);
  const when = readWhen(value, value.recap !== undefined, path, errors, readGate);
  return { ...(recap ? { recap } : {}), ...(when ? { recap_when: when } : {}) };
};

export const readQuestRecapFields = (value: Record<string, unknown>, path: string, errors: ValidationError[], readGate: ReadGate): Pick<Quest, "recap" | "recap_when"> => {
  const recap = readQuestRecap(value.recap, `${path}.recap`, errors);
  const when = readWhen(value, value.recap !== undefined, path, errors, readGate);
  return { ...(recap ? { recap } : {}), ...(when ? { recap_when: when } : {}) };
};

const actionOptions = (type: QualityType, values: string[] | undefined): string[] | null => {
  if (type === "enum") return values ?? [];
  return type === "bool" ? ["true", "false"] : null;
};

const committable = (quality: Pick<Quality, "commit_evidence">, option: string): boolean =>
  typeof quality.commit_evidence === "string" || typeof quality.commit_evidence?.[option] === "string";

export const readPlayerAction = (
  value: Record<string, unknown>,
  quality: Pick<Quality, "type" | "values" | "commit_evidence">,
  path: string,
  errors: ValidationError[],
): Pick<Quality, "player_action"> => {
  if (value.player_action === undefined) return {};
  const options = actionOptions(quality.type, quality.values);
  if (!options || !isRecord(value.player_action)) {
    addError(errors, `${path}.player_action`, "player_action maps enum or bool values to what the player did (\"took the posting\")");
    return {};
  }
  const clauses: Record<string, string> = {};
  Object.entries(value.player_action).forEach(([option, clause]) => {
    const at = `${path}.player_action.${option}`;
    const text = typeof clause === "string" ? clause.trim() : "";
    if (!options.includes(option)) addError(errors, at, `'${option}' is not a value of this quality`);
    else if (!text || text.length > PLAYER_ACTION_MAX) addError(errors, at, `a player action is a clause of at most ${PLAYER_ACTION_MAX} characters`);
    else if (!committable(quality, option)) addError(errors, at, "a player action shows only for a value the player committed to: give this value a commit_evidence pattern");
    else clauses[option] = text;
  });
  return Object.keys(clauses).length ? { player_action: clauses } : {};
};

export const checkRecapGates = (
  parts: { transitions: Transition[]; quests?: Quest[]; milestones?: Milestone[] },
  qualityByKey: Record<string, Quality>,
  errors: ValidationError[],
  validateGate: ValidateGate,
) => {
  const check = (gate: GateNode | undefined, path: string) => { if (gate) validateGate(gate, qualityByKey, path, errors); };
  parts.transitions.forEach((transition, index) => check(transition.recap_when, `transitions.${index}.recap_when`));
  (parts.quests ?? []).forEach((quest, index) => check(quest.recap_when, `quests.${index}.recap_when`));
  (parts.milestones ?? []).forEach((milestone, index) => check(milestone.recap_when, `milestones.${index}.recap_when`));
};
