import type { StoryV2 } from "@engine/index";
import { isProvisioningKind, type ProvisioningEnvironment, type ProvisioningOp } from "@wizard/index";
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

const wantsGroup = (session: AgentSession, draft: StoryV2, environment: ProvisioningEnvironment): boolean => {
  const created = provisioned(session, "applied");
  const declined = provisioned(session, "rejected");
  const decided = [...created, ...declined].some((op) => op.kind === "createGroup");
  return created.some((op) => op.kind === "createCharacterCard") && draft.roster.length > 1 && !decided && !has(environment.groupNames, draft.title);
};

export const missingAtDone = (session: AgentSession, draft: StoryV2, environment: ProvisioningEnvironment): string[] => {
  const declined = provisioned(session, "rejected");
  return [
    ...missingCards(draft, environment, namesOf(declined, "createCharacterCard")),
    ...missingBooks(draft, environment, namesOf(declined, "createStoryLorebook")),
    ...(wantsGroup(session, draft, environment) ? ["no group for the cast (createGroup with every card)"] : []),
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

export const doneSummary = (session: AgentSession, draft: StoryV2, claim: string): string => {
  const created = provisioned(session, "applied");
  const made = CREATED.map(([kind, one, many]) => [created.filter((op) => op.kind === kind).length, one, many] as const)
    .filter(([amount]) => amount > 0)
    .map(([amount, one, many]) => count(amount, one, many));
  const holds = [count(draft.checkpoints.length, "checkpoint"), count(draft.transitions.length, "transition"), count(draft.qualities.length, "quality", "qualities"), count(draft.roster.length, "cast member")];
  const facts = `The draft holds ${holds.join(", ")}${made.length ? `; this session created ${made.join(", ")}` : ""}.`;
  const prose = claim.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.trim() && !NUMBER_CLAIM.test(sentence)).join(" ");
  return prose ? `${facts} ${prose}` : facts;
};
