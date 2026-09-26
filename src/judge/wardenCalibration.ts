import { continuityFactRows, type ContinuityCase, type RescoreResult, type RescoreRow } from "./curatorCalibration";
import { AGENCY_SCORE, HOUSE_RULE_P, WARDEN_MAX_RULES } from "./policy";
import { noulAnswer, scoreAnswer } from "./questions";
import type { JudgeSelfTestReport, JudgeSelfTestRow } from "./selfTest";
import type { JudgeAnswer, JudgeFallback, JudgeRequest, JudgeResult } from "./types";
import { AGENCY_LEVELS, buildWardenRequests, readWarden, type WardenInput } from "./warden";
import { median } from "./stats";

export type Ask = (request: JudgeRequest) => Promise<JudgeResult>;

export interface WardenAsked {
  answers: Record<string, JudgeAnswer> | null;
  model: string | null;
  latencyMs: number;
  fallback?: JudgeFallback;
}

export async function askWarden(ask: Ask, input: WardenInput): Promise<WardenAsked> {
  const results = await Promise.all(buildWardenRequests(input).map((request) => ask(request)));
  const failed = results.find((result) => !result.answers);
  const latencyMs = Math.max(0, ...results.map((result) => result.latencyMs));
  const model = results.find((result) => result.model)?.model ?? null;
  if (!results.length || failed) return { answers: null, model, latencyMs, ...(failed?.fallback ? { fallback: failed.fallback } : {}) };
  return { answers: Object.assign({}, ...results.map((result) => result.answers)), model, latencyMs };
}

const report = (perCase: Array<{ rows: JudgeSelfTestRow[]; model: string | null; latencyMs: number }>): JudgeSelfTestReport => {
  const rows = perCase.flatMap((entry) => entry.rows);
  return {
    ranAt: new Date().toISOString(),
    model: perCase.find((entry) => entry.model)?.model ?? null,
    total: rows.length,
    right: rows.filter((row) => row.right).length,
    p50LatencyMs: median(perCase.map((entry) => entry.latencyMs)),
    rows,
  };
};

export interface AgencyCase {
  id: string;
  lang: string;
  group?: boolean;
  player: string;
  playerMessage: string;
  reply: { speaker: string; text: string };
  family: "writes" | "clean";
  level: number;
  source?: string;
}

export const agencyInput = (entry: Pick<AgencyCase, "player" | "playerMessage" | "reply">): WardenInput => ({
  reply: entry.reply,
  facts: [],
  agency: { player: entry.player, message: entry.playerMessage },
  houseRules: [],
});

// Rows: `<case>.writes` (flagged over AGENCY_SCORE) or `<case>.clean` (not flagged), read raw.
export async function runAgencyCalibration(ask: Ask, cases: AgencyCase[]): Promise<JudgeSelfTestReport> {
  return report(await Promise.all(cases.map(async (entry) => {
    const asked = await askWarden(ask, agencyInput(entry));
    const value = asked.answers ? scoreAnswer(asked.answers, "agency")?.score ?? null : null;
    const flagged = value !== null && value > AGENCY_SCORE;
    const row: JudgeSelfTestRow = {
      id: `${entry.id}.${entry.family}`,
      right: value !== null && flagged === (entry.family === "writes"),
      picked: value === null ? null : `score=${Number(value.toFixed(3))}`,
      detail: `level ${entry.level}: ${AGENCY_LEVELS[entry.level] ?? "?"}`,
      latencyMs: asked.latencyMs,
      ...(asked.fallback ? { fallback: asked.fallback } : {}),
    };
    return { rows: [row], model: asked.model, latencyMs: asked.latencyMs };
  })));
}

export interface HouseRuleCase {
  id: string;
  lang: string;
  rules: string[];
  reply: { speaker: string; text: string };
  broken: number[];
  kept: number[];
  source?: string;
}

export const houseRuleInput = (entry: Pick<HouseRuleCase, "rules" | "reply">): WardenInput => ({ reply: entry.reply, facts: [], agency: null, houseRules: entry.rules });

// Rows per rule: `<case>.broken:<i>` (flagged), `<case>.kept:<i>` and `<case>.untouched:<i>` (not flagged).
export async function runHouseRuleCalibration(ask: Ask, cases: HouseRuleCase[]): Promise<JudgeSelfTestReport> {
  return report(await Promise.all(cases.map(async (entry) => {
    const asked = await askWarden(ask, houseRuleInput(entry));
    const rows: JudgeSelfTestRow[] = entry.rules.slice(0, WARDEN_MAX_RULES).map((rule, index) => {
      const p = asked.answers ? noulAnswer(asked.answers, `rule:${index}`) : null;
      const flagged = p !== null && p >= HOUSE_RULE_P;
      const family = entry.broken.includes(index) ? "broken" : entry.kept.includes(index) ? "kept" : "untouched";
      return {
        id: `${entry.id}.${family}:${index}`,
        right: p !== null && (family === "broken" ? flagged : !flagged),
        picked: p === null ? null : `p=${p}`,
        detail: rule,
        latencyMs: asked.latencyMs,
        ...(asked.fallback ? { fallback: asked.fallback } : {}),
      };
    });
    return { rows, model: asked.model, latencyMs: asked.latencyMs };
  })));
}

export interface CombinedContinuityCase extends ContinuityCase {
  player?: string;
  playerMessage?: string;
  houseRules?: string[];
}

export const continuityCombinedInput = (entry: CombinedContinuityCase): WardenInput => ({
  reply: entry.reply,
  facts: entry.established,
  agency: entry.playerMessage !== undefined ? { player: entry.player ?? "", message: entry.playerMessage } : null,
  houseRules: entry.houseRules ?? [],
});

export const isCombinedCase = (entry: CombinedContinuityCase): boolean => entry.playerMessage !== undefined || Boolean(entry.houseRules?.length);

// The regression family (plan 07 §6): the continuity rows, asked inside the combined warden request.
export async function runCombinedContinuityCalibration(ask: Ask, cases: CombinedContinuityCase[]): Promise<JudgeSelfTestReport> {
  return report(await Promise.all(cases.map(async (entry) => {
    const input = continuityCombinedInput(entry);
    const asked = await askWarden(ask, input);
    const note = asked.answers ? readWarden(asked.answers, input).find((finding) => finding.family === "continuity") ?? null : null;
    const base = { latencyMs: asked.latencyMs, ...(asked.fallback ? { fallback: asked.fallback } : {}) };
    const pOf = (index: number) => (asked.answers ? noulAnswer(asked.answers, `fact:${index}`) : null);
    const rows: JudgeSelfTestRow[] = [
      { id: `${entry.id}.reply`, right: asked.answers !== null && Boolean(note) === entry.contradicts.length > 0, picked: asked.answers ? (note ? note.facts.join(" | ") : "no note") : null, ...base },
      ...continuityFactRows(entry, pOf, base),
    ];
    return { rows, model: asked.model, latencyMs: asked.latencyMs };
  })));
}

export const WARDEN_RESCORE_USES = ["continuity", "agency", "house-rules"] as const;
export type WardenRescoreUse = (typeof WARDEN_RESCORE_USES)[number];

export interface WardenRescoreRow extends RescoreRow {
  player?: string;
  playerMessage?: string;
  houseRules?: string[];
}

const rescoreInput = (use: WardenRescoreUse, row: WardenRescoreRow): WardenInput | null => {
  if (use === "continuity") return row.established.length ? { reply: row.reply, facts: row.established, agency: null, houseRules: [] } : null;
  if (use === "agency") return typeof row.playerMessage === "string" ? { reply: row.reply, facts: [], agency: { player: row.player ?? "", message: row.playerMessage }, houseRules: [] } : null;
  return row.houseRules?.length ? { reply: row.reply, facts: [], agency: null, houseRules: row.houseRules } : null;
};

// X12: both arms scored by the one calibrated question. A row with nothing to hold it to is not
// asked (no facts, no player line, no rules), as the warden would not have asked either.
export async function runWardenRescore(ask: Ask, use: WardenRescoreUse, rows: WardenRescoreRow[]): Promise<RescoreResult[]> {
  const asked = rows.map((row) => ({ row, input: rescoreInput(use, row) })).filter((entry): entry is { row: WardenRescoreRow; input: WardenInput } => entry.input !== null);
  return Promise.all(asked.map(async ({ row, input }) => {
    const result = await askWarden(ask, input);
    const findings = result.answers ? readWarden(result.answers, input) : [];
    const family = use === "house-rules" ? "house-rule" : use;
    const finding = findings.find((entry) => entry.family === family) ?? null;
    const value = use === "agency" && result.answers ? scoreAnswer(result.answers, "agency")?.score : undefined;
    return {
      id: row.id,
      arm: row.arm,
      flagged: result.answers ? Boolean(finding) : null,
      broken: finding?.rules ?? finding?.facts ?? [],
      latencyMs: result.latencyMs,
      model: result.model,
      ...(value !== undefined ? { score: Number(value.toFixed(3)) } : {}),
      ...(result.fallback ? { fallback: result.fallback } : {}),
    };
  }));
}
