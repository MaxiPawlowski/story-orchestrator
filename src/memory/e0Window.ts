import { E0_LOCAL_WEIGHTS, localScore, rankByScore, type E0PoolQuestion, type E0Ranked } from "./e0Ranking";
import { scoreRankings, type E0ArmMetrics } from "./e0Score";
import { QUERY_WINDOW, recencyWeights } from "./score";
import { jaccardSimilarity } from "./similarity";

const windowParts = (query: string): Array<{ text: string; weight: number }> => {
  const lines = query.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(-QUERY_WINDOW);
  const weights = recencyWeights(lines.length);
  return lines.map((text, index) => ({ text, weight: weights[index] }));
};

const scaled = (values: number[]): number[] => {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return values.map((value) => (max > min ? (value - min) / (max - min) : 0));
};

export function armWindow(question: E0PoolQuestion): E0Ranked {
  const parts = windowParts(question.query);
  const similarity = question.candidates.map((candidate) => parts.reduce((sum, part) => sum + part.weight * jaccardSimilarity(candidate.text, part.text), 0));
  const proximity = question.candidates.map((candidate) => 1 / (1 + Math.max(0, question.askMessageId - candidate.messageId) / E0_LOCAL_WEIGHTS.distance));
  const [simN, proxN] = [scaled(similarity), scaled(proximity)];
  const scores = new Map(question.candidates.map((candidate, index) => [candidate.messageId, E0_LOCAL_WEIGHTS.similarity * simN[index] + E0_LOCAL_WEIGHTS.proximity * proxN[index]]));
  return { ...rankByScore(question.candidates, (candidate) => scores.get(candidate.messageId) ?? 0), calls: 0, latencyMs: null, inputTokens: 0 };
}

export function compareWindowArm(questions: readonly E0PoolQuestion[]): { c: E0ArmMetrics; f: E0ArmMetrics } {
  const rank = (ranker: (question: E0PoolQuestion) => E0Ranked) => scoreRankings(questions, new Map(questions.map((question) => [question.id, ranker(question)])));
  return {
    c: rank((question) => ({ ...rankByScore(question.candidates, (candidate) => localScore(question, candidate)), calls: 0, latencyMs: null, inputTokens: 0 })),
    f: rank(armWindow),
  };
}
