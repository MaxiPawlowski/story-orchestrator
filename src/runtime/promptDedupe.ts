import { NO_CLOSING_QUESTION_CLAUSE, NO_SKIP_CLAUSE, PLAYER_MIND_CLAUSE } from "@engine/index";

export const SHARED_CLAUSES: readonly string[] = [NO_CLOSING_QUESTION_CLAUSE, NO_SKIP_CLAUSE, PLAYER_MIND_CLAUSE];

export const withoutCarriedClauses = (text: string, carrier: string, clauses: readonly string[] = SHARED_CLAUSES): string =>
  clauses.filter((clause) => carrier.includes(clause) && text.includes(clause))
    .reduce((rest, clause) => rest.split(clause).join("").replace(/ {2,}/g, " ").replace(/ +([.,;:])/g, "$1"), text).trim();
