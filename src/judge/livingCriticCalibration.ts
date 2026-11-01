import { buildDirectorCriticRequest, directorCriticVerdict, readDirectorCritic, type DirectorCriticInput, type DirectorCriticRead } from "./livingCritic";
import { DIRECTOR_CRITIC_PLAYER_ACT_MAX } from "./policy";
import type { JudgeSelfTestReport } from "./selfTest";
import type { JudgeRequest, JudgeResult } from "./types";
import { median } from "./stats";

export interface DirectorCriticCase {
  id: string;
  source: string;
  input: DirectorCriticInput;
  labels: { playerAct: boolean; accept: boolean };
}

export interface DirectorCriticScore {
  playerActRecall: number;
  playerActCaught: number;
  playerActTotal: number;
  falseRefusals: number;
  acceptTotal: number;
  falseRefusalRate: number;
  unanswered: number;
}

const describe = (read: DirectorCriticRead | null) => (read
  ? `p=${read.playerAct} c=${read.contradicts} o=${read.outcomeName} n=${read.newPerson} f=${read.followsThread}`
  : null);

export async function runDirectorCriticCalibration(ask: (request: JudgeRequest) => Promise<JudgeResult>, cases: DirectorCriticCase[]): Promise<JudgeSelfTestReport> {
  const perCase = await Promise.all(cases.map(async (entry) => {
    const result = await ask(buildDirectorCriticRequest(entry.input));
    const read = result.answers ? readDirectorCritic(result.answers) : null;
    const base = { latencyMs: result.latencyMs, picked: describe(read), ...(result.fallback ? { fallback: result.fallback } : {}) };
    const rows = read
      ? [
        { id: `${entry.id}.verdict`, right: directorCriticVerdict(read).pass === entry.labels.accept, ...base },
        { id: `${entry.id}.playerAct`, right: read.playerAct >= DIRECTOR_CRITIC_PLAYER_ACT_MAX === entry.labels.playerAct, ...base },
      ]
      : [{ id: `${entry.id}.verdict`, right: false, ...base }];
    return { rows, model: result.model, latencyMs: result.latencyMs };
  }));
  const rows = perCase.flatMap((entry) => entry.rows);
  return {
    ranAt: new Date().toISOString(), model: perCase.find((entry) => entry.model)?.model ?? null,
    total: rows.length, right: rows.filter((row) => row.right).length, p50LatencyMs: median(perCase.map((entry) => entry.latencyMs)), rows,
  };
}

export function scoreDirectorCritic(cases: DirectorCriticCase[], reads: ReadonlyMap<string, DirectorCriticRead | null>): DirectorCriticScore {
  const acts = cases.filter((entry) => entry.labels.playerAct);
  const accepts = cases.filter((entry) => entry.labels.accept);
  const caught = acts.filter((entry) => {
    const read = reads.get(entry.id);
    return read ? read.playerAct >= DIRECTOR_CRITIC_PLAYER_ACT_MAX : false;
  }).length;
  const refused = accepts.filter((entry) => {
    const read = reads.get(entry.id);
    return read ? !directorCriticVerdict(read).pass : false;
  }).length;
  return {
    playerActRecall: acts.length ? caught / acts.length : 0, playerActCaught: caught, playerActTotal: acts.length,
    falseRefusals: refused, acceptTotal: accepts.length, falseRefusalRate: accepts.length ? refused / accepts.length : 0,
    unanswered: cases.filter((entry) => !reads.get(entry.id)).length,
  };
}
