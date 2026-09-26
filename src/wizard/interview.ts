import { WIZARD_QUESTION_LIMIT, type WizardAnswer, type WizardLorebookGrant, type WizardQuestion, type WizardSessionState } from "./types";
import { lorebookFileId } from "@utils/string";

export const YOU_DECIDE = "You decide — pick sensible defaults and say which ones you picked.";

const slug = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// One wizard session per draft, so an interrupted setup resumes on the story it belongs to and
// never bleeds into the next one. A draft with no id yet keys by its title.
export const wizardSessionKey = (draft: { id?: string; title?: string }): string => slug(draft.id ?? draft.title ?? "") || "untitled";

export const newWizardSession = (key: string, seed = ""): WizardSessionState => ({
  key,
  stage: "qualities",
  history: [],
  questions: [],
  applied: [],
  createdLorebooks: [],
  seed,
  updatedAt: new Date().toISOString(),
});

export const capQuestions = (questions: WizardQuestion[]): WizardQuestion[] => questions.slice(0, WIZARD_QUESTION_LIMIT);

// Answers re-enter the conversation as one compact author turn: the raw question block never goes
// back into history (token hygiene — the same rule the proposal JSON follows).
export function renderAnswers(questions: WizardQuestion[], answers: WizardAnswer[]): string {
  const byId = new Map(answers.map((answer) => [answer.id, answer.text.trim()]));
  const lines = questions.map((question) => {
    const given = byId.get(question.id);
    return `${question.text} → ${given || YOU_DECIDE}`;
  });
  return lines.join("\n");
}

export const allDeferred = (questions: WizardQuestion[], answers: WizardAnswer[]): boolean =>
  questions.every((question) => !answers.find((answer) => answer.id === question.id)?.text.trim());

// "Fix with wizard": the unmet requirements become the premise of the provisioning stage, so the
// author lands on a pre-filled step instead of re-explaining what the diagnostics already know.
export function provisioningSeed(missing: { personas?: string[]; members?: string[]; lorebooks?: string[] }): string {
  const parts: string[] = [];
  if (missing.members?.length) parts.push(`cast members that do not exist yet: ${missing.members.join(", ")}`);
  if (missing.lorebooks?.length) parts.push(`lorebooks that do not exist yet: ${missing.lorebooks.join(", ")}`);
  if (missing.personas?.length) parts.push(`personas the story expects (create these yourself, the wizard never touches personas): ${missing.personas.join(", ")}`);
  if (!parts.length) return "";
  return `This story cannot run yet. Propose the provisioning steps that fix exactly this, and nothing else — ${parts.join("; ")}.`;
}

export const recordApplied = (session: WizardSessionState, target: string): WizardSessionState => ({
  ...session,
  applied: session.applied.includes(target) ? session.applied : [...session.applied, target],
  updatedAt: new Date().toISOString(),
});

// v2.3 plan 02 (R8). A grant is the author's own decision, so it is theirs to make and to take
// back; it lives with the session, never in the story record. File id, not display name: that is
// what `world_names` and every WI host call actually address.
export const recordGrant = (session: WizardSessionState, storyId: string, book: string, granted = true, at = new Date().toISOString()): WizardSessionState => {
  const fileId = lorebookFileId(book);
  const grants = session.grants ?? [];
  const same = (entry: WizardLorebookGrant) => entry.storyId === storyId && entry.lorebookFileId === fileId;
  const wanted = granted
    ? [...grants.filter((entry) => !same(entry)), { storyId, lorebookFileId: fileId, at, confirmed: true as const }]
    : grants.filter((entry) => !same(entry));
  return { ...session, grants: wanted, updatedAt: at };
};
