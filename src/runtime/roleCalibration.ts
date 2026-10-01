import type { StoryV2 } from "@engine/index";
import { detectDegenerate, profileRoute, routedModel, type ModelCall, estimateTokens, maxTokensFor, maxTokensForInput, stripChannelNoise, type PassRole } from "@extraction/index";
import { renderStagePrompt, runAuthoringStage, type CopilotStage, type ProposalOp } from "@copilot/index";
import { parseDirectorResponse, renderDirectorPrompt, type DirectorWindowMessage } from "@talk/index";
import { buildWiCuratorPrompt, parseCuratorResponse, planCuratorProposal, type CuratorScope, type WiCuratorOp } from "@stagecraft/index";
import { buildSceneSummaryPrompt } from "@memory/contract";
import type { ProvisioningEnvironment } from "@wizard/index";
import { DIRECTOR_MAX_TOKENS, DIRECTOR_TIMEOUT_MS } from "./talkControl";

export type CalibrationRole = Exclude<PassRole, "read" | "inner">;

export interface DirectorCalibrationCase {
  id: string;
  lang?: string;
  acceptable: string[];
  input: {
    storyTitle: string;
    checkpointName: string;
    objective: string;
    candidates: Array<{ rosterId: string; name: string; role?: string; aliases?: string[] }>;
    allowSilence: boolean;
    lead?: string;
    instruction?: string;
    window: DirectorWindowMessage[];
  };
}

export interface CuratorCalibrationCase {
  id: string;
  lang: string;
  label: "change" | "none";
  scope: CuratorScope;
  required: Array<{ comment: string; kinds: WiCuratorOp["kind"][] }>;
  forbidden: string[];
}

export interface AuthoringCalibrationCase {
  id: string;
  lang: string;
  stage: CopilotStage;
  draft: StoryV2;
  ask: "never" | "allowed";
  message: string;
  require: { kind: ProposalOp["kind"]; min: number; match?: Record<string, string> };
  environment?: ProvisioningEnvironment;
}

export interface SynthesisCalibrationCase {
  id: string;
  lang: string;
  messages: Array<{ speaker: string; text: string }>;
}

export interface CalibrationCaseMap {
  director: DirectorCalibrationCase;
  curator: CuratorCalibrationCase;
  authoring: AuthoringCalibrationCase;
  synthesis: SynthesisCalibrationCase;
}

export interface DirectorScore { pick: string | null; answerCorrect: boolean; inTime: boolean; correct: boolean }
export interface CuratorScore { valid: boolean; opLines: number; survived: number; decision: boolean; kept: string[]; dropped: string[] }
export interface AuthoringScore { valid: boolean; status: string; shape: boolean; allowedKinds: string[]; kinds: string[]; repaired: boolean; issues: string[] }
export interface SynthesisScore { valid: boolean; empty: boolean; truncated: boolean; noise: boolean }

export interface CalibrationScoreMap {
  director: DirectorScore;
  curator: CuratorScore;
  authoring: AuthoringScore;
  synthesis: SynthesisScore;
}

export interface RoleCaseRecord<R extends CalibrationRole = CalibrationRole> {
  role: R;
  id: string;
  lang: string;
  responses: string[];
  finishes: string[];
  latencyMs: number;
  score: CalibrationScoreMap[R];
}

export interface RoleCaseOptions {
  profileId: string | null;
  model?: ModelCall;
  now?: () => number;
}

const modelOf = (options: RoleCaseOptions): ModelCall => options.model ?? routedModel(profileRoute(options.profileId));

const NOISE = /<\/?think(?:ing)?>|<\|?channel\|?>|<\|start\|>|<\|end\|>|<\|message\|>/i;

const namesOf = (lines: string[]) => lines.map((line) => line.toLowerCase());

export function scoreDirector(entry: DirectorCalibrationCase, raw: string, latencyMs: number): DirectorScore {
  const candidates = entry.input.candidates.map((candidate) => ({ ...candidate, weight: 1 }));
  const verdict = parseDirectorResponse(raw, candidates, entry.input.allowSilence);
  const pick = verdict === null ? null : verdict.rosterId === null ? "NONE" : candidates.find((candidate) => candidate.rosterId === verdict.rosterId)?.name ?? null;
  const answerCorrect = pick !== null && entry.acceptable.includes(pick);
  const inTime = latencyMs <= DIRECTOR_TIMEOUT_MS;
  return { pick, answerCorrect, inTime, correct: answerCorrect && inTime };
}

export function scoreCurator(entry: CuratorCalibrationCase, raw: string): CuratorScore {
  const proposal = parseCuratorResponse(raw, entry.scope.entries);
  const opLines = proposal.ops.length + proposal.dropped.length;
  const explicitNone = stripChannelNoise(raw ?? "").split(/\r?\n/).some((line) => line.trim().replace(/^[-*]\s+/, "").toUpperCase() === "NONE");
  const plan = planCuratorProposal(proposal, entry.scope.entries, { mode: "review" });
  const kept = plan.records.map((record) => `${record.op.kind}:${"comment" in record.op ? record.op.comment : ""}`);
  const touched = plan.records.flatMap((record) => ("comment" in record.op ? [{ kind: record.op.kind, comment: record.op.comment.toLowerCase() }] : []));
  const forbidden = new Set(namesOf(entry.forbidden));
  const required = entry.required.every((item) => touched.some((op) => op.comment === item.comment.toLowerCase() && (item.kinds as string[]).includes(op.kind)));
  const clean = !touched.some((op) => forbidden.has(op.comment));
  const decision = entry.label === "none" ? touched.length === 0 : required && clean;
  return { valid: opLines > 0 || explicitNone, opLines, survived: plan.records.length, decision, kept, dropped: plan.dropped };
}

export const allowedStageKinds = (prompt: string): string[] => /Only emit ([A-Za-z/]+) ops/.exec(prompt)?.[1].split("/") ?? [];

const matches = (op: ProposalOp, match: Record<string, string> | undefined): boolean => {
  if (!match) return true;
  const body = (op as Record<string, unknown>).quality ?? (op as Record<string, unknown>).checkpoint ?? (op as Record<string, unknown>).transition ?? op;
  return Object.entries(match).every(([key, value]) => (body as Record<string, unknown>)[key] === value);
};

export function scoreAuthoring(entry: AuthoringCalibrationCase, status: string, ops: ProposalOp[], repaired: boolean, issues: string[]): AuthoringScore {
  const allowedKinds = allowedStageKinds(renderStagePrompt(entry.stage, entry.draft, entry.message, [], entry.environment));
  const kinds = ops.map((op) => op.kind);
  const valid = status === "ok" || status === "questions";
  const inStage = kinds.every((kind) => allowedKinds.includes(kind));
  const wanted = ops.filter((op) => op.kind === entry.require.kind && matches(op, entry.require.match)).length;
  const shape = status === "questions" ? entry.ask === "allowed" : status === "ok" && inStage && wanted >= entry.require.min;
  return { valid, status, shape, allowedKinds, kinds, repaired, issues: issues.slice(0, 4) };
}

export function scoreSynthesis(raw: string, finish: string): SynthesisScore {
  const text = stripChannelNoise(raw ?? "").trim();
  const truncated = finish === "length" || detectDegenerate(raw ?? "").degenerate;
  const noise = NOISE.test(text);
  return { valid: text.length > 0 && !truncated && !noise, empty: text.length === 0, truncated, noise };
}

type Runner<R extends CalibrationRole> = (entry: CalibrationCaseMap[R], options: RoleCaseOptions, clock: () => number) => Promise<Omit<RoleCaseRecord<R>, "role" | "id" | "lang">>;

const runDirector: Runner<"director"> = async (entry, options, clock) => {
  const candidates = entry.input.candidates.map((candidate) => ({ ...candidate, weight: 1 }));
  const prompt = renderDirectorPrompt({
    storyTitle: entry.input.storyTitle,
    checkpointName: entry.input.checkpointName,
    objective: entry.input.objective,
    candidates,
    allowSilence: entry.input.allowSilence,
    lead: candidates.find((candidate) => candidate.name === entry.input.lead)?.name,
    instruction: entry.input.instruction,
    window: entry.input.window,
  });
  const started = clock();
  const reply = await modelOf(options)(prompt, { role: "director", pass: "director", maxTokens: DIRECTOR_MAX_TOKENS });
  const latencyMs = Math.round(clock() - started);
  return { responses: [reply.text], finishes: [reply.finish], latencyMs, score: scoreDirector(entry, reply.text, latencyMs) };
};

const runCurator: Runner<"curator"> = async (entry, options, clock) => {
  const prompt = buildWiCuratorPrompt(entry.scope);
  const started = clock();
  const reply = await modelOf(options)(prompt, { role: "curator", pass: "curator", maxTokens: maxTokensForInput("curator", prompt) });
  return { responses: [reply.text], finishes: [reply.finish], latencyMs: Math.round(clock() - started), score: scoreCurator(entry, reply.text) };
};

const runAuthoring: Runner<"authoring"> = async (entry, options, clock) => {
  const started = clock();
  const result = await runAuthoringStage(
    { draft: entry.draft, stage: entry.stage, message: entry.message, history: [], ...(entry.environment ? { environment: entry.environment } : {}) },
    modelOf(options),
    { role: "authoring", pass: "copilot" },
  );
  const responses = [result.audit.rawResponse, ...(result.audit.repairResponse !== undefined ? [result.audit.repairResponse] : [])];
  return {
    responses,
    finishes: [result.audit.finish, ...(result.audit.repairFinish !== undefined ? [result.audit.repairFinish] : [])],
    latencyMs: Math.round(clock() - started),
    score: scoreAuthoring(entry, result.status, result.proposal.ops, result.audit.repairResponse !== undefined, result.issues),
  };
};

const runSynthesis: Runner<"synthesis"> = async (entry, options, clock) => {
  const scene = entry.messages.map((message) => `${message.speaker}: ${message.text}`).join("\n");
  const started = clock();
  const reply = await modelOf(options)(buildSceneSummaryPrompt(scene), { role: "synthesis", pass: "sceneSummary", maxTokens: maxTokensFor("sceneSummary", estimateTokens(scene)) });
  return { responses: [reply.text], finishes: [reply.finish], latencyMs: Math.round(clock() - started), score: scoreSynthesis(reply.text, reply.finish) };
};

const RUNNERS: { [R in CalibrationRole]: Runner<R> } = { director: runDirector, curator: runCurator, authoring: runAuthoring, synthesis: runSynthesis };

export async function runRoleCase<R extends CalibrationRole>(role: R, entry: CalibrationCaseMap[R], options: RoleCaseOptions): Promise<RoleCaseRecord<R>> {
  const clock = options.now ?? (() => Date.now());
  const outcome = await (RUNNERS[role] as Runner<R>)(entry, options, clock);
  return { role, id: entry.id, lang: entry.lang ?? "en", ...outcome };
}

export interface MetricResult { passed: number; total: number; rate: number | null; floor: number | null; ok: boolean | null }
export interface SliceSummary { cases: number; metrics: Record<string, MetricResult> }
export interface RoleSummary { role: CalibrationRole; overall: SliceSummary; meetsFloors: boolean | null }

export const DIRECTOR_FLOOR = { passed: 22, total: 25 } as const;

export const ROLE_CALIBRATION_FLOORS: Record<CalibrationRole, Record<string, number>> = {
  director: { correct: DIRECTOR_FLOOR.passed / DIRECTOR_FLOOR.total },
  curator: { validity: 0.9, opShape: 0.85, decision: 0.7 },
  authoring: { validity: 0.9, opShape: 0.8 },
  synthesis: {},
};

const metric = (passed: number, total: number, floor: number | null): MetricResult => {
  const rate = total ? passed / total : null;
  return { passed, total, rate, floor, ok: floor === null ? null : rate !== null && rate + 1e-9 >= floor };
};

const count = <T>(items: T[], test: (item: T) => boolean) => items.filter(test).length;

function sliceOf(role: CalibrationRole, records: RoleCaseRecord[]): SliceSummary {
  const floors = ROLE_CALIBRATION_FLOORS[role];
  const floor = (name: string) => floors[name] ?? null;
  const scores = records.map((record) => record.score);
  if (role === "director") {
    const director = scores as DirectorScore[];
    return {
      cases: records.length,
      metrics: {
        correct: metric(count(director, (score) => score.correct), director.length, floor("correct")),
        answerCorrect: metric(count(director, (score) => score.answerCorrect), director.length, null),
      },
    };
  }
  if (role === "curator") {
    const curator = scores as CuratorScore[];
    const opLines = curator.reduce((sum, score) => sum + score.opLines, 0);
    const survived = curator.reduce((sum, score) => sum + score.survived, 0);
    return {
      cases: records.length,
      metrics: {
        validity: metric(count(curator, (score) => score.valid), curator.length, floor("validity")),
        opShape: metric(survived, opLines, floor("opShape")),
        decision: metric(count(curator, (score) => score.decision), curator.length, floor("decision")),
      },
    };
  }
  if (role === "authoring") {
    const authoring = scores as AuthoringScore[];
    return {
      cases: records.length,
      metrics: {
        validity: metric(count(authoring, (score) => score.valid), authoring.length, floor("validity")),
        opShape: metric(count(authoring, (score) => score.shape), authoring.length, floor("opShape")),
        firstTry: metric(count(authoring, (score) => score.valid && !score.repaired), authoring.length, null),
      },
    };
  }
  const synthesis = scores as SynthesisScore[];
  return { cases: records.length, metrics: { validity: metric(count(synthesis, (score) => score.valid), synthesis.length, null) } };
}

export function summarizeRoleCalibration(role: CalibrationRole, records: RoleCaseRecord[], options: { floorIds?: string[] } = {}): RoleSummary {
  const { floorIds } = options;
  const floored = floorIds ? records.filter((record) => floorIds.includes(record.id)) : records;
  const overall = sliceOf(role, floored);
  if (role === "director") {
    const ok = overall.metrics.correct.passed >= DIRECTOR_FLOOR.passed && overall.metrics.correct.total === DIRECTOR_FLOOR.total;
    return { role, overall: { ...overall, metrics: { ...overall.metrics, correct: { ...overall.metrics.correct, ok } } }, meetsFloors: ok };
  }
  const oks = Object.values(overall.metrics).map((value) => value.ok).filter((value): value is boolean => value !== null);
  return { role, overall, meetsFloors: oks.length ? oks.every(Boolean) : null };
}
