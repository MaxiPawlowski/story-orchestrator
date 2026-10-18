import { agencyClauses, agencyForCheckpoint, guidanceShared, renderAgencyPolicy, type NormalizedStory } from "@engine/index";
import { askText, isPlanted, type ModelAsk, type ModelCall } from "@extraction/modelRoute";
import { isRecord } from "@utils/guards";
import { normalizeJsonText } from "@utils/json";
import { narratesPlayer } from "./living/guard";
import { parseCriticVerdict } from "./parse";
import { storyContext } from "./prompts";
import { ENCOUNTER_POOL_MAX, ENCOUNTER_POOL_MIN, type CodeCheckResult, type CriticVerdict, type GeneratedEncounter, type PlannedExpansionInput } from "./types";

const MAX_TITLE_CHARS = 60;
const MAX_TITLE_WORDS = 6;
const MIN_SITUATION_CHARS = 20;
const MAX_SITUATION_CHARS = 400;

const FORBIDDEN_KEYS = ["outcomes", "outcome", "gate", "progress", "deltas", "objective", "exit", "next"];

export interface ReviewedEncounters {
  encounters: GeneratedEncounter[];
  raw: string;
  issues: string[];
  codeCheck: CodeCheckResult | null;
  verdict: CriticVerdict;
  needsReview: boolean;
}

type Checked = { encounters: GeneratedEncounter[]; raw: string; issues: string[]; codeCheck: CodeCheckResult | null };

const placeName = (story: NormalizedStory, id: string): string => {
  const checkpoint = story.checkpointById[id];
  return (checkpoint?.player_name ?? checkpoint?.name ?? id).trim();
};

export function renderEncounterPrompt(story: NormalizedStory, input: PlannedExpansionInput): string {
  const place = story.checkpointById[input.candidate.stubId];
  const guidance = guidanceShared(place?.guidance).trim();
  return [
    `Story: ${story.title}`,
    ...storyContext(story),
    `Generate scaffolding only. Do not write prose scenes.`,
    `The party is free in an open stretch: "${placeName(story, input.candidate.stubId)}". Nobody has set them a task here, ` +
      `and they leave by their own move toward "${placeName(story, input.candidate.targetAnchorId)}".`,
    ...(guidance ? [`What the place is like: ${guidance}`] : []),
    `Write ${input.beats} optional situations the world could put in front of the party while they are here: someone arrives, something is found, a small problem shows itself. ` +
      `Each is a menu item the narrator may offer when play goes quiet. The party may engage with it or ignore it, and an ignored one is simply gone.`,
    `Each situation has a title of two to five words, a short scene name that names the place or the situation and never says what happens, and a situation of one or two sentences ` +
      `that sets something up and stops there. Name only the cast above or people the facts already establish.`,
    `None may have an outcome, a gate, progress, an objective or an exit, none may lead the party toward or away from the next place, and none may be required for anything.`,
    `Canon-lite:\n${input.canon || "(none)"}`,
    `Facts:\n${input.facts.join("\n") || "(none)"}`,
    `Agency policy for the situations you write:\n${renderAgencyPolicy(agencyForCheckpoint(story, input.candidate.stubId))}`,
    `Return exact JSON only: {"encounters":[{"title":"...","situation":"..."}]}`,
  ].join("\n");
}

export function renderEncounterCriticPrompt(story: NormalizedStory, input: PlannedExpansionInput, encounters: GeneratedEncounter[], issues: string[]): string {
  return [
    `Story: ${story.title}`,
    ...storyContext(story),
    `Review generated scaffolding only: optional situations for an open stretch, "${placeName(story, input.candidate.stubId)}".`,
    `Code issues: ${issues.join(" | ") || "none"}`,
    `Canon-lite:\n${input.canon || "(none)"}`,
    `Facts:\n${input.facts.join("\n") || "(none)"}`,
    `Encounters JSON:\n${JSON.stringify({ encounters })}`,
    `Review the situations against this policy:\n${agencyClauses(agencyForCheckpoint(story, input.candidate.stubId)).map((clause) => `- ${clause}`).join("\n")}`,
    `Fail a situation whose text narrates the player's own act (accepting, agreeing, refusing or going somewhere), resolves itself, requires the player to act before anything else can happen, ` +
      `moves the party toward or away from "${placeName(story, input.candidate.targetAnchorId)}" or gives it a task, or reveals a secret or an ending.`,
    `Return exact JSON: {"pass":true|false,"issues":["..."]}`,
  ].join("\n");
}

export function parseEncounters(raw: string): { encounters: GeneratedEncounter[]; issues: string[] } {
  const issues: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalizeJsonText(raw));
  } catch {
    return { encounters: [], issues: ["response is not valid JSON"] };
  }
  const source = isRecord(parsed) && Array.isArray(parsed.encounters) ? parsed.encounters : parsed;
  if (!Array.isArray(source)) return { encounters: [], issues: ["response must be an array or { encounters }"] };
  const encounters = source.map((entry, index): GeneratedEncounter | null => {
    const path = `encounters.${index}`;
    if (!isRecord(entry)) {
      issues.push(`${path}: encounter must be an object`);
      return null;
    }
    FORBIDDEN_KEYS.filter((key) => key in entry).forEach((key) => issues.push(`${path}.${key}: an encounter carries no outcome, gate, progress, objective or exit`));
    const title = typeof entry.title === "string" ? entry.title.trim().slice(0, MAX_TITLE_CHARS) : "";
    const situation = typeof entry.situation === "string" ? entry.situation.trim() : "";
    if (!title) issues.push(`${path}.title: required`);
    if (!situation) issues.push(`${path}.situation: required`);
    return title && situation ? { id: String(index), title, situation } : null;
  }).filter((entry): entry is GeneratedEncounter => Boolean(entry));
  return { encounters, issues };
}

export function runPoolChecks(encounters: GeneratedEncounter[], playerNames: readonly string[] = []): CodeCheckResult {
  const issues: string[] = [];
  if (encounters.length < ENCOUNTER_POOL_MIN || encounters.length > ENCOUNTER_POOL_MAX) issues.push(`a pool holds ${ENCOUNTER_POOL_MIN} to ${ENCOUNTER_POOL_MAX} encounters, not ${encounters.length}`);
  const seen = new Set<string>();
  encounters.forEach((encounter, index) => {
    const label = `encounter ${index + 1} '${encounter.title}'`;
    const key = encounter.title.toLowerCase();
    if (seen.has(key)) issues.push(`${label} repeats an earlier title`);
    seen.add(key);
    if (encounter.title.split(/\s+/).length > MAX_TITLE_WORDS) issues.push(`${label} has a title of more than ${MAX_TITLE_WORDS} words`);
    if (encounter.situation.length < MIN_SITUATION_CHARS) issues.push(`${label} has a situation too short to play`);
    if (encounter.situation.length > MAX_SITUATION_CHARS) issues.push(`${label} has a situation over ${MAX_SITUATION_CHARS} characters`);
    if (narratesPlayer(encounter.situation, playerNames) || narratesPlayer(encounter.title, playerNames)) issues.push(`${label} narrates the player's own act`);
  });
  return { ok: issues.length === 0, issues, progressTotal: 0 };
}

type Generated = { encounters: GeneratedEncounter[]; raw: string; issues: string[] };

async function generateEncounters(story: NormalizedStory, input: PlannedExpansionInput, model: ModelCall, ask: ModelAsk): Promise<Generated> {
  const prompt = renderEncounterPrompt(story, input);
  const raw = await askText(model, prompt, { ...ask, maxTokens: 1024 });
  const parsed = parseEncounters(raw);
  if (!parsed.issues.length) return { encounters: parsed.encounters, raw, issues: [] };
  const repairRaw = await askText(model, `${prompt}\n\nPrevious response was invalid: ${parsed.issues.join("; ")}\nReturn corrected exact JSON only.`, { ...ask, maxTokens: 1024 });
  const repaired = parseEncounters(repairRaw);
  return { encounters: repaired.encounters, raw: repairRaw, issues: repaired.issues };
}

async function generateChecked(story: NormalizedStory, input: PlannedExpansionInput, model: ModelCall, ask: ModelAsk, playerNames: readonly string[]): Promise<Checked> {
  const generated = await generateEncounters(story, input, model, ask);
  if (generated.issues.length) return { ...generated, codeCheck: null };
  const initial = runPoolChecks(generated.encounters, playerNames);
  if (initial.ok || isPlanted(model, ask)) return { ...generated, codeCheck: initial };
  const repairRaw = await askText(
    model,
    `${renderEncounterPrompt(story, input)}\n\nPrevious JSON failed hard code checks: ${initial.issues.join("; ")}\nReturn corrected exact JSON only.`,
    { ...ask, maxTokens: 1024 },
  );
  const repaired = parseEncounters(repairRaw);
  if (repaired.issues.length) return { ...generated, codeCheck: initial };
  return { encounters: repaired.encounters, raw: repairRaw, issues: [], codeCheck: runPoolChecks(repaired.encounters, playerNames) };
}

const failure = (checked: Checked): ReviewedEncounters => (checked.issues.length || !checked.codeCheck
  ? { ...checked, codeCheck: null, verdict: { pass: false, issues: checked.issues, raw: checked.raw }, needsReview: true }
  : { ...checked, verdict: { pass: false, issues: checked.codeCheck.issues, raw: "CODE_CHECK" }, needsReview: true });

export async function generateReviewedEncounters(
  story: NormalizedStory, input: PlannedExpansionInput, model: ModelCall, ask: ModelAsk, playerNames: readonly string[] = [],
): Promise<ReviewedEncounters> {
  const checked = await generateChecked(story, input, model, ask, playerNames);
  if (checked.issues.length || !checked.codeCheck) return failure(checked);
  if (isPlanted(model, ask)) return { ...checked, verdict: { pass: checked.codeCheck.ok, issues: checked.codeCheck.issues, raw: "DEBUG" }, needsReview: !checked.codeCheck.ok };
  if (!checked.codeCheck.ok) return failure(checked);
  const raw = await askText(model, renderEncounterCriticPrompt(story, input, checked.encounters, checked.codeCheck.issues), { ...ask, pass: "critic", maxTokens: 512 });
  const verdict = parseCriticVerdict(raw);
  return { ...checked, verdict, needsReview: !verdict.pass };
}
