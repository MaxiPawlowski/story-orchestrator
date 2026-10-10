import type { StoryV2 } from "@engine/index";
import type { ProvisioningEnvironment } from "@wizard/index";
import { isRecord } from "@utils/guards";
import { truncate } from "@utils/string";
import { FIRST_MESSAGE_RULE, OPENING_CAST_RULE } from "../prompts";
import { GUIDE_TOPIC_IDS } from "../guideTopics";
import { renderCoverage, storyCoverage } from "../../studio/coverage";
import { runReadTool } from "./readTools";
import { recipeIndex } from "./recipes";
import { createdSteps, rejectedSteps } from "./rejected";
import { renderToolSchema } from "./tools";
import { emptyLookup, type AgentSession, type AgentStep } from "./types";

const RECENT_STEPS = 12;
const RECENT_OBSERVATION = 600;
const EARLIER_STEPS = 60;
const TARGET_KEYS = ["id", "key", "name", "field", "lorebook", "comment", "member"];

const RULES = [
  "You are the agent inside the Story Orchestrator wizard. You change the story draft ONLY through the tools listed below, one tool call per reply, and the author reviews every change.",
  "Reply with exactly one JSON object and nothing else.",
  [
    "Cover the whole story model, not only the beats: qualities with rubrics, checkpoints with objectives, tension targets and agency policy,",
    "gates the reader can score, the cast with roles, requirements, lore select, house rules, backgrounds, and the cards and lorebook the story needs.",
    "readCoverage lists what the story does not use yet.",
  ].join(" "),
  [
    "Give each cast member a drive (setRosterDrive: what they want across the story) and, at the beats where it changes, a motive (setCheckpointMotive: what they want",
    "right now). Both are told only to that character, so write them as that character's private aim, never as a plan for the player.",
    "A long premise may be split into chapters (setChapters); chapters are optional.",
  ].join(" "),
  `${FIRST_MESSAGE_RULE} ${OPENING_CAST_RULE} setCheckpointEffects replaces a beat's whole effects block, so keep what is already there.`,
  [
    "The player is the persona, never a cast member: if the premise or a greeting tells the player \"you are the pawnbroker\", there is no Pawnbroker card or roster member.",
    "Say who the player plays with setPlayer (role, summary, assumes; name.mode fixed only when the story cannot work under another name); the player picks or creates the persona at the start.",
    "effects.background names a file from the backgrounds listed under INSTALL; when none fits, leave the background out.",
    "Every name in cast_changes and requirements.members needs a card on the install, and every story needs its group:",
    "stories play in group chats only, even a one-character story (its character plus a narrator).",
  ].join(" "),
  [
    "Provisioning tools create NEW SillyTavern assets and the author confirms each one.",
    "You never edit an existing card or lorebook, never touch personas, and never save the story: saving is the author's click.",
  ].join(" "),
  `Consult readGuide(topic) before authoring a field you have not used yet in this session. Topics: ${GUIDE_TOPIC_IDS.join(", ")}.`,
  `For a whole task, readRecipe(recipe) first and follow its steps in order. Recipes: ${recipeIndex()}.`,
  "After each accepted write you are shown the validation and diagnostics. Fix blocking problems before adding more.",
  "The DRAFT section below is the current story, block contents included, and EARLIER STEPS lists what you already did: do not re-read either.",
  "A rejected step comes back with the author's reason. Do not repeat it unchanged.",
];

const renderStep = (step: AgentStep): string => {
  const parts = [`#${step.id} ${step.call.tool} → ${step.status}`];
  if (step.reason) parts.push(`author's reason: ${step.reason}`);
  parts.push(truncate(step.observation, RECENT_OBSERVATION));
  if (step.check) parts.push(`check: ${truncate(step.check, RECENT_OBSERVATION)}`);
  return parts.join("\n  ");
};

const stringTarget = (record: Record<string, unknown>): string | null => {
  const key = TARGET_KEYS.find((entry) => typeof record[entry] === "string" && String(record[entry]).trim());
  return key ? String(record[key]) : null;
};

const targetOf = (args: Record<string, unknown>): string =>
  stringTarget(args) ?? Object.values(args).filter(isRecord).map(stringTarget).find((entry): entry is string => entry !== null) ?? "";

const renderEarlier = (step: AgentStep): string => {
  const target = targetOf(step.call.args);
  return `#${step.id} ${step.call.tool}${target ? `(${truncate(target, 40)})` : ""} → ${step.status}`;
};

const earlierSteps = (session: AgentSession): string[] => {
  const earlier = session.steps.slice(0, -RECENT_STEPS);
  if (!earlier.length) return [];
  const shown = earlier.slice(-EARLIER_STEPS);
  const skipped = earlier.length - shown.length;
  return [`EARLIER STEPS (compact, oldest first)\n${skipped ? `… ${skipped} older step(s)\n` : ""}${shown.map(renderEarlier).join("\n")}`];
};

const rejectedByAuthor = (session: AgentSession): string[] => {
  const rows = rejectedSteps(session).map((step) => {
    const target = targetOf(step.call.args);
    return `- #${step.id} ${step.call.tool}${target ? `(${truncate(target, 60)})` : ""}: ${step.reason ?? "no reason given"}`;
  });
  return rows.length ? [`REJECTED BY THE AUTHOR (never propose these again; an identical call is refused)\n${rows.join("\n")}`] : [];
};

const alreadyCreated = (session: AgentSession): string[] => {
  const rows = createdSteps(session).map((step) => `- #${step.id} ${step.call.tool}${targetOf(step.call.args) ? `(${truncate(targetOf(step.call.args), 60)})` : ""}`);
  return rows.length ? [`ALREADY CREATED THIS SESSION (these exist on the install now; never create them again)\n${rows.join("\n")}`] : [];
};

const BACKGROUND_LIMIT = 40;

const renderBackgrounds = (backgrounds: readonly string[]): string => {
  if (!backgrounds.length) return "backgrounds on the install: unknown (lookupBackgrounds lists them)";
  const more = backgrounds.length > BACKGROUND_LIMIT ? `, … ${backgrounds.length - BACKGROUND_LIMIT} more (lookupBackgrounds)` : "";
  return `backgrounds on the install: ${backgrounds.slice(0, BACKGROUND_LIMIT).join(", ")}${more}`;
};

const renderInstall = (environment: ProvisioningEnvironment, backgrounds: readonly string[]): string => [
  `characters on the install: ${environment.characterNames.length}`,
  `lorebooks on the install: ${environment.lorebookNames.length}`,
  `lorebooks this story may write into: ${environment.ownedLorebooks.join(", ") || "(none yet: create the story's own lorebook first)"}`,
  `this story's cast (a group may hold only these): ${environment.castNames.join(", ") || "(none yet: add roster members first)"}`,
  `personas on the install (requirements.personas may name only these, and usually none): ${environment.personaNames.join(", ") || "(none)"}`,
  renderBackgrounds(backgrounds),
].join("\n");

const NATIVE_RULES = [
  "You are the agent inside the Story Orchestrator wizard. You change the story draft ONLY through your tools, one call at a time, and the author reviews every change.",
  "Call the tools natively. A plan or a finished reply is one JSON object as plain text.",
];

const authorNotes = (session: AgentSession): string[] => session.notes.slice(1)
  .filter((note) => note.role === "author" && (note.onceAt === undefined || note.onceAt === session.steps.length))
  .map((note) => `- ${note.text}`);

const header = (session: AgentSession, draft: StoryV2, environment: ProvisioningEnvironment, native = false, backgrounds: readonly string[] = []): string[] => [
  (native ? [...NATIVE_RULES, ...RULES.slice(2)] : RULES).join("\n"),
  ...(native ? [] : [`TOOLS\n${renderToolSchema()}`]),
  `GOAL\n${session.goal}`,
  `DRAFT\n${runReadTool("readStory", {}, draft, emptyLookup())}`,
  `UNUSED FIELDS\n${renderCoverage(storyCoverage(draft))}`,
  `INSTALL (create-only)\n${renderInstall(environment, backgrounds)}`,
  ...(authorNotes(session).length ? [`AUTHOR NOTES\n${authorNotes(session).join("\n")}`] : []),
];

export const renderPlanPrompt = (session: AgentSession, draft: StoryV2, environment: ProvisioningEnvironment, native = false, backgrounds: readonly string[] = []): string => [
  ...header(session, draft, environment, native, backgrounds),
  "REPLY NOW with the plan only: {\"plan\": [\"one step per entry, in the order you will do them\"]}",
].join("\n\n");

export const renderStepPrompt = (session: AgentSession, draft: StoryV2, environment: ProvisioningEnvironment, native = false, backgrounds: readonly string[] = []): string => [
  ...header(session, draft, environment, native, backgrounds),
  `PLAN (agreed with the author)\n${session.plan.map((step, index) => `${index + 1}. ${step}`).join("\n")}`,
  ...earlierSteps(session),
  ...rejectedByAuthor(session),
  ...alreadyCreated(session),
  `RECENT STEPS (newest last)\n${session.steps.slice(-RECENT_STEPS).map(renderStep).join("\n") || "(none yet)"}`,
  `Budget: step ${session.steps.length + 1} of ${session.budget.maxSteps}.`,
  native
    ? "CONTINUE NOW: call your tools one at a time for the steps that remain. When the plan is finished, reply with {\"done\": \"what you did\"} as plain text."
    : "REPLY NOW with one tool call: {\"thought\": \"why this step\", \"tool\": \"<name>\", \"args\": {…}} — or {\"done\": \"what you did\"} when the plan is finished.",
].join("\n\n");
