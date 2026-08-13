import { WIZARD_QUESTION_LIMIT, type WizardAnswer, type WizardQuestion, type WizardSessionState } from "./types";

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
