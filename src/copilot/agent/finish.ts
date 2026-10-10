import type { Checkpoint, StoryV2 } from "@engine/index";
import { draftCastNames, isProvisioningKind, type ProvisioningEnvironment, type ProvisioningOp } from "@wizard/index";
import { passThroughExits } from "../../studio/arrivalDiagnostics";
import type { AgentSession, AgentStepStatus } from "./types";

const fold = (text: string) => text.trim().toLowerCase();

const has = (names: readonly string[], name: string) => names.some((entry) => fold(entry) === fold(name));

const provisioned = (session: AgentSession, status: AgentStepStatus): ProvisioningOp[] => session.steps.flatMap((step) =>
  (step.family === "provision" && step.status === status && step.op && isProvisioningKind(step.op.kind) ? [step.op as ProvisioningOp] : []));

const namesOf = (ops: ProvisioningOp[], kind: "createCharacterCard" | "createStoryLorebook"): string[] =>
  ops.flatMap((op) => (op.kind === kind ? [op.name] : []));

const missingCards = (draft: StoryV2, environment: ProvisioningEnvironment, declined: string[]): string[] => {
  if (!environment.characterNames.length) return [];
  return draft.roster.map((member) => member.name ?? member.id)
    .filter((name) => !has(environment.characterNames, name) && !has(declined, name))
    .map((name) => `no card for "${name}"`);
};

const missingBooks = (draft: StoryV2, environment: ProvisioningEnvironment, declined: string[]): string[] => {
  if (!environment.lorebookNames.length) return [];
  return (draft.requirements?.lorebooks ?? [])
    .filter((name) => !has(environment.lorebookNames, name) && !has(declined, name))
    .map((name) => `no lorebook "${name}"`);
};

const castGroupExists = (draft: StoryV2, environment: ProvisioningEnvironment): boolean => {
  const cast = draftCastNames(draft);
  return cast.length > 0 && (environment.groupCasts ?? []).some((group) => cast.every((name) => has(group.members, name)));
};

const wantsGroup = (session: AgentSession, draft: StoryV2, environment: ProvisioningEnvironment): boolean => {
  const created = provisioned(session, "applied");
  const declined = provisioned(session, "rejected");
  const decided = [...created, ...declined].some((op) => op.kind === "createGroup");
  return draft.roster.length > 0 && !decided && !has(environment.groupNames, draft.title) && !castGroupExists(draft, environment);
};

const groupGaps = (session: AgentSession, draft: StoryV2): string[] => provisioned(session, "applied").flatMap((op) => {
  if (op.kind !== "createGroup") return [];
  const missing = draftCastNames(draft).filter((name) => !has(op.members, name));
  return missing.length
    ? [`the group "${op.name}" lacks ${missing.join(", ")}, so the story never reads as ready there: the wizard cannot edit a group, so tell the author to add ` +
      `${missing.length === 1 ? "that member" : "them"} in SillyTavern (Repair offers "Add … back to the group")`]
    : [];
});

const passedThrough = (draft: StoryV2): string[] => passThroughExits(draft).map(({ index, exit }) =>
  `'${exit.from}' is passed straight through (gate-open-on-arrival at transitions.${index}.gate): its way out to '${exit.to}' is already open when the story arrives, ` +
  "so gate it on something that happens in that checkpoint");

export const missingAtDone = (session: AgentSession, draft: StoryV2, environment: ProvisioningEnvironment): string[] => {
  const declined = provisioned(session, "rejected");
  return [
    ...groupGaps(session, draft),
    ...missingCards(draft, environment, namesOf(declined, "createCharacterCard")),
    ...missingBooks(draft, environment, namesOf(declined, "createStoryLorebook")),
    ...(wantsGroup(session, draft, environment) ? ["no group for the cast (createGroup with every card)"] : []),
    ...passedThrough(draft),
  ];
};

export const refusedDoneLast = (session: AgentSession): boolean => {
  const last = session.steps.at(-1);
  return last?.call.tool === "done" && last.status === "refused";
};

const count = (amount: number, one: string, many = `${one}s`) => `${amount} ${amount === 1 ? one : many}`;

const NUMBER_CLAIM = /\b(?:\d+|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|dozen)\b/i;

const CREATED: Array<[ProvisioningOp["kind"], string, string?]> = [
  ["createCharacterCard", "card"],
  ["createStoryLorebook", "lorebook"],
  ["upsertLorebookEntry", "lorebook entry", "lorebook entries"],
  ["createGroup", "group"],
];

const present = (value: unknown) => value !== undefined && value !== null && value !== "" && !(typeof value === "object" && !Object.keys(value as object).length);

const FEATURES: Array<{ label: string; claim: RegExp; on: (checkpoint: Checkpoint) => boolean }> = [
  { label: "guidance", claim: /\bguidance\b/i, on: (checkpoint) => present(checkpoint.guidance) },
  { label: "tension target", claim: /\btension\b/i, on: (checkpoint) => present(checkpoint.tension_target) },
  { label: "agency", claim: /\bagency\b/i, on: (checkpoint) => present(checkpoint.agency) },
  { label: "talk control", claim: /\btalk[_ ]control\b|\bspeaker direction\b|\bwho speaks\b/i, on: (checkpoint) => present(checkpoint.talk_control) },
  {
    label: "cast changes",
    claim: /\bcast[_ ]changes?\b|\bcast gating\b|\bwho enters\b|\benters? (?:the story )?(?:when|later)\b/i,
    on: (checkpoint) => present(checkpoint.effects?.cast_changes),
  },
  { label: "background", claim: /\bbackgrounds?\b/i, on: (checkpoint) => present(checkpoint.effects?.background) },
  { label: "author note", claim: /\bauthor['’]?s? notes?\b/i, on: (checkpoint) => present(checkpoint.effects?.author_note) },
  { label: "motives", claim: /\bmotives?\b/i, on: (checkpoint) => present(checkpoint.motives) },
];

const EVERY = /\b(?:every|each|all)\b/i;

const coverage = (draft: StoryV2) => FEATURES.map((feature) => ({ ...feature, count: draft.checkpoints.filter(feature.on).length }));

const unsupported = (sentence: string, measured: ReturnType<typeof coverage>, total: number): boolean => measured.some(({ claim, count }) =>
  claim.test(sentence) && (count === 0 || (EVERY.test(sentence) && count < total)));

export const doneSummary = (session: AgentSession, draft: StoryV2, claim: string): string => {
  const created = provisioned(session, "applied");
  const made = CREATED.map(([kind, one, many]) => [created.filter((op) => op.kind === kind).length, one, many] as const)
    .filter(([amount]) => amount > 0)
    .map(([amount, one, many]) => count(amount, one, many));
  const holds = [
    count(draft.checkpoints.length, "checkpoint"),
    count(draft.transitions.length, "transition"),
    count(draft.qualities.length, "quality", "qualities"),
    count(draft.roster.length, "cast member"),
  ];
  const measured = coverage(draft);
  const total = draft.checkpoints.length;
  const set = measured.filter(({ count }) => count > 0).map(({ label, count }) => `${label} ${count} of ${total}`);
  const facts = `The draft holds ${holds.join(", ")}${made.length ? `; this session created ${made.join(", ")}` : ""}.${set.length ? ` Checkpoints with ${set.join(", ")}.` : ""}`;
  const prose = claim.split(/(?<=[.!?])\s+/)
    .filter((sentence) => sentence.trim() && !NUMBER_CLAIM.test(sentence) && !unsupported(sentence, measured, total))
    .join(" ");
  return prose ? `${facts} ${prose}` : facts;
};
