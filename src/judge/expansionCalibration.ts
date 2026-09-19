import { buildChainRequest, CHAIN_SHAPE_LEVELS, judgeVerdict, pickChain, readChain, type ChainInput, type ChainRead } from "./expansion";
import { CRITIC_ADVANCES_MIN, CRITIC_CONTRADICTS_MAX, CRITIC_NEW_CHARACTER_MAX } from "./policy";
import type { JudgeSelfTestReport, JudgeSelfTestRow } from "./selfTest";
import type { JudgeRequest, JudgeResult } from "./types";

export interface CriticCase {
  id: string;
  lang: string;
  input: ChainInput;
  labels: { contradicts: boolean; advances: boolean; newCharacter: boolean };
}

export interface VariantStub {
  id: string;
  lang: string;
  base: Omit<ChainInput, "beats">;
  chains: Array<{ label: "clean" | "contradicts" | "wanders"; beats: ChainInput["beats"] }>;
}

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) / 2)];
};

const toReport = (perCase: Array<{ rows: JudgeSelfTestRow[]; model: string | null; latencyMs: number }>): JudgeSelfTestReport => {
  const rows = perCase.flatMap((entry) => entry.rows);
  return { ranAt: new Date().toISOString(), model: perCase.find((entry) => entry.model)?.model ?? null, total: rows.length, right: rows.filter((row) => row.right).length, p50LatencyMs: median(perCase.map((entry) => entry.latencyMs)), rows };
};

const describe = (read: ChainRead | null) => (read ? `c=${read.contradicts} a=${read.advances} n=${read.newCharacter}${read.shape === null ? "" : ` s=${read.shape}`}` : null);

// Rows `<case>.verdict` (pass/fail agrees with the labels) and one per check at the policy cuts.
export async function runCriticCalibration(ask: (request: JudgeRequest) => Promise<JudgeResult>, cases: CriticCase[]): Promise<JudgeSelfTestReport> {
  return toReport(await Promise.all(cases.map(async (entry) => {
    const result = await ask(buildChainRequest(entry.input));
    const read = result.answers ? readChain(result.answers) : null;
    const base = { latencyMs: result.latencyMs, picked: describe(read), ...(result.fallback ? { fallback: result.fallback } : {}) };
    const truth = !entry.labels.contradicts && entry.labels.advances && !entry.labels.newCharacter;
    const rows: JudgeSelfTestRow[] = read
      ? [
        { id: `${entry.id}.verdict`, right: judgeVerdict(read).pass === truth, ...base },
        { id: `${entry.id}.contradicts`, right: read.contradicts >= CRITIC_CONTRADICTS_MAX === entry.labels.contradicts, ...base },
        { id: `${entry.id}.advances`, right: read.advances >= CRITIC_ADVANCES_MIN === entry.labels.advances, ...base },
        { id: `${entry.id}.newCharacter`, right: read.newCharacter >= CRITIC_NEW_CHARACTER_MAX === entry.labels.newCharacter, ...base },
      ]
      : [{ id: `${entry.id}.verdict`, right: false, ...base }];
    return { rows, model: result.model, latencyMs: result.latencyMs };
  })));
}

// Rows `<stub>.pick` (code picks the clean chain) and `<stub>.rejected` (the contradicting chain
// fails the verdict at CRITIC_CONTRADICTS_MAX): the two Phase A floors.
export async function runVariantCalibration(ask: (request: JudgeRequest) => Promise<JudgeResult>, stubs: VariantStub[]): Promise<JudgeSelfTestReport> {
  return toReport(await Promise.all(stubs.map(async (stub) => {
    const results = await Promise.all(stub.chains.map((chain) => ask(buildChainRequest({ ...stub.base, beats: chain.beats }))));
    const reads = results.map((result) => (result.answers ? readChain(result.answers) : null));
    const picked = pickChain(reads);
    const contradicting = stub.chains.findIndex((chain) => chain.label === "contradicts");
    const latencyMs = Math.max(0, ...results.map((result) => result.latencyMs));
    const rows: JudgeSelfTestRow[] = [
      { id: `${stub.id}.pick`, right: picked !== null && stub.chains[picked].label === "clean", picked: picked === null ? "none passed" : `${stub.chains[picked].label} (${describe(reads[picked])})`, latencyMs },
      ...(contradicting >= 0 ? [{ id: `${stub.id}.rejected`, right: reads[contradicting] !== null && !judgeVerdict(reads[contradicting]!).pass, picked: describe(reads[contradicting]), latencyMs }] : []),
    ];
    return { rows, model: results.find((result) => result.model)?.model ?? null, latencyMs };
  })));
}

export const CHAIN_SHAPE_LEVEL_COUNT = CHAIN_SHAPE_LEVELS.length;
