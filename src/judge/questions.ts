import { JUDGE_CHARS_PER_TOKEN, JUDGE_MAX_CHOICE_OPTIONS, JUDGE_MAX_ESTIMATED_TOKENS, JUDGE_MAX_REQUEST_CHARS, type JudgeAnswer, type JudgeChoiceAnswer, type JudgeChoiceQuestion, type JudgeNoulQuestion, type JudgeOption, type JudgeRequest, type JudgeScoreAnswer, type JudgeScoreQuestion } from "./types";

export const noul = (instructions: string, criteria?: { true: string; false: string }): JudgeNoulQuestion => (criteria ? { type: "noul", instructions, criteria } : { type: "noul", instructions });

export const choice = (instructions: string, criteria: Record<string, JudgeOption>): JudgeChoiceQuestion => ({ type: "choice", instructions, criteria });

export const score = (instructions: string, levels: string[]): JudgeScoreQuestion => ({ type: "score", instructions, criteria: levels });

export const withNoMatch = (criteria: Record<string, JudgeOption>, key: string, description: string): Record<string, JudgeOption> => ({ ...criteria, [key]: description });

export const stateRef = (path: string) => `\`${path}\``;

export function estimateJudgeTokens(request: JudgeRequest): number {
  const longest = Math.max(0, ...Object.values(request.questions ?? {}).map((question) => JSON.stringify(question).length));
  return Math.ceil((JSON.stringify(request.state ?? {}).length + longest) / JUDGE_CHARS_PER_TOKEN);
}

export function validateJudgeRequest(request: JudgeRequest): string[] {
  const issues: string[] = [];
  const entries = Object.entries(request.questions);
  if (!entries.length) issues.push("questions is empty");
  for (const [id, question] of entries) {
    if (!question.instructions.trim()) issues.push(`${id}: missing instructions`);
    if (question.type === "choice") {
      const count = Object.keys(question.criteria).length;
      if (count < 2 || count > JUDGE_MAX_CHOICE_OPTIONS) issues.push(`${id}: choice needs 2-${JUDGE_MAX_CHOICE_OPTIONS} options (has ${count})`);
    } else if (question.type === "score") {
      if (question.criteria.length < 2 || question.criteria.length > 10) issues.push(`${id}: score needs 2-10 levels (has ${question.criteria.length})`);
    } else if (question.criteria) {
      const extra = Object.keys(question.criteria).filter((key) => key !== "true" && key !== "false");
      if (extra.length) issues.push(`${id}: noul criteria only takes true/false (got ${extra.join(", ")})`);
    }
  }
  if (JSON.stringify(request).length > JUDGE_MAX_REQUEST_CHARS) issues.push(`request is over ${JUDGE_MAX_REQUEST_CHARS} chars`);
  const tokens = estimateJudgeTokens(request);
  if (tokens > JUDGE_MAX_ESTIMATED_TOKENS) issues.push(`request is over ${JUDGE_MAX_ESTIMATED_TOKENS} estimated tokens (${tokens})`);
  return issues;
}

export const noulAnswer = (answers: Record<string, JudgeAnswer>, id: string): number | null => {
  const answer = answers[id];
  return answer?.type === "noul" && Number.isFinite(answer.noul) ? answer.noul : null;
};

export const choiceAnswer = (answers: Record<string, JudgeAnswer>, id: string): JudgeChoiceAnswer | null => {
  const answer = answers[id];
  return answer?.type === "choice" && typeof answer.choice === "string" ? answer : null;
};

export const scoreAnswer = (answers: Record<string, JudgeAnswer>, id: string): JudgeScoreAnswer | null => {
  const answer = answers[id];
  return answer?.type === "score" && Number.isFinite(answer.score) ? answer : null;
};
