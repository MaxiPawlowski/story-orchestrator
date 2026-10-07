import { askText, parseSharedReadResponse, type ExtractionReply, type ModelCall, type ModelPass, type PassRole } from "@extraction/index";
import { buildFixtureRun, type ExtractionFixtureSpec, type FixtureSourceRead } from "@extraction/fixtureRun";
import { applyRatingGrounding } from "@extraction/ratingGuard";
import { agendaStepKey, parseStoryV2OrThrow, type PrimitiveValue } from "@engine/index";
import { loadGameLayer } from "@engine/validate/gameLayer";
import { buildMeanwhilePrompt, parseMeanwhile, type MeanwhileParse } from "./meanwhilePrompt";
import { MEANWHILE_MAX_TOKENS } from "./coordinators/agendaProposalCoordinator";
import type { ContextLimit, SceneArm, SceneArmSpec } from "@extraction/index";
import { requestBudgetFor, routedProfileId } from "./requestBudget";
import { sceneArmRunner, type SceneArmResult } from "./sceneArmRunner";
import { profileExists } from "@services/STAPI";
import { createModelCall } from "./modelCall";
import { buildTypedPlan, readTypedDeltas } from "@judge/index";
import { buildCreateCandidatePrompt, caseContext, caseScope, scoreCreateSample, type CreateCase, type CreateCaseSample } from "@stagecraft/createCandidate";
import type { RuntimeManager } from "./runtimeManager";
import {
  runRoleCase, summarizeRoleCalibration, type CalibrationCaseMap, type CalibrationRole, type RoleCaseRecord,
  type RoleSummary,
} from "./roleCalibration";

export interface LiveFixtureResult {
  prompt: string;
  rawResponse: string;
  deltas: Array<{ q: string; v: unknown; evidence: string; judge?: number }>;
  facts: Array<{ text: string; importance: number }>;
  rejected: Array<{ line: string; reason: string }>;
  // The same read already parses these tiers, and the suite scored only plot
  // deltas while reporting the number as live extraction accuracy. They are handed back so a
  // fixture that states an expectation for them can be scored against it.
  memory: Array<{ tier: string; text: string }>;
  arcs: Array<{ kind: string; text: string }>;
  epistemic: Array<{ tag: string; subject: string; hiddenFrom?: string; content: string }>;
  ledger: Array<{ entity: string; entityType: string; field: string; value: string }>;
  judged?: { answered: string[]; answers: unknown; model: string | null; fallback?: string };
  scope: string[];
  sources: FixtureSourceRead[];
  guarded: Array<{ q: string; v: unknown }>;
}

export interface MeanwhileCaseSpec {
  story: unknown;
  member: string;
  agenda: string;
  done: number;
  window: Array<{ speaker: string; text: string }>;
}

export interface MeanwhileCaseResult {
  prompt: string;
  rawResponse: string;
  proposals: MeanwhileParse["proposals"];
  refused: MeanwhileParse["refused"];
}

export interface LifeBlockReading {
  text: string;
  tokens: number;
}

// `so-live-suite --judge`: a fixture's own hint sidecar ({key: {read_as, criteria?}})
// is merged into its story, the judge reads the hinted qualities first, and the LLM prompt covers
// only the rest, exactly as runSharedRead splits a cadence read. The call is a probe, so nothing is
// recorded in the open chat.
export interface LiveFixtureOptions {
  judge?: boolean;
  hints?: Record<string, Record<string, unknown>>;
}

export interface BudgetReading {
  estimate: number;
  contextLimit: ContextLimit;
  profileId: string | null;
}

export interface LiveSuiteHandle {
  measureBudget: (text: string, role?: PassRole) => Promise<BudgetReading>;
  runSceneArm: (spec: SceneArmSpec, arm: SceneArm, chunkBudget?: number) => Promise<SceneArmResult>;
  runFixture: (spec: ExtractionFixtureSpec, options?: LiveFixtureOptions) => Promise<LiveFixtureResult>;
  runCuratorCreate: (entry: CreateCase) => Promise<{ prompt: string; rawResponse: string; sample: CreateCaseSample }>;
  runRoleCase: <R extends CalibrationRole>(role: R, entry: CalibrationCaseMap[R]) => Promise<RoleCaseRecord<R>>;
  summarizeRoleCalibration: (role: CalibrationRole, records: RoleCaseRecord[], options?: { floorIds?: string[] }) => RoleSummary;
  askModel: (prompt: string, maxTokens: number, role: PassRole) => Promise<ExtractionReply>;
  runMeanwhileCase: (spec: MeanwhileCaseSpec) => Promise<MeanwhileCaseResult>;
  lifeBlock: (story: unknown, values: Record<string, PrimitiveValue>, memberId: string) => Promise<LifeBlockReading>;
}

const withHints = (story: unknown, hints: LiveFixtureOptions["hints"]) => {
  if (!hints || !story || typeof story !== "object") return story;
  const raw = story as { qualities?: Array<Record<string, unknown>> };
  return { ...raw, qualities: (raw.qualities ?? []).map((quality) => ({ ...quality, ...(hints[String(quality.key)] ?? {}) })) };
};

type LiveReadTiers = Pick<LiveFixtureResult, "facts" | "rejected" | "memory" | "arcs" | "epistemic" | "ledger">;

export const liveReadTiers = (parsed: ReturnType<typeof parseSharedReadResponse>): LiveReadTiers => ({
  facts: parsed.facts.map((entry) => ({ text: entry.text, importance: entry.importance })),
  rejected: parsed.rejected,
  memory: parsed.memory.map((entry) => ({ tier: entry.tier, text: entry.text })),
  arcs: parsed.arcs.map((entry) => ({ kind: entry.kind, text: entry.text })),
  epistemic: parsed.epistemic.map((entry) => ({ tag: entry.tag, subject: entry.subject, ...(entry.hiddenFrom ? { hiddenFrom: entry.hiddenFrom } : {}), content: entry.content })),
  ledger: parsed.ledger.map((entry) => ({ entity: entry.entity, entityType: entry.entityType, field: entry.field, value: entry.value })),
});

const ROLE_PASS: Record<PassRole, ModelPass> = { read: "read", synthesis: "sceneSummary", authoring: "copilot", director: "director", curator: "curator", inner: "inner" };

const liveModel = (manager: RuntimeManager): ModelCall => createModelCall({ settings: () => manager.getExtractionSettings(), exists: profileExists, planted: false });

export function registerLiveSuite(manager: RuntimeManager) {
  const model = liveModel(manager);
  const handle: LiveSuiteHandle = {
    runCuratorCreate: curatorCreateRunner(manager),
    runRoleCase: (role, entry) => runRoleCase(role, entry, { profileId: manager.getExtractionSettings().profileId, model }),
    summarizeRoleCalibration,
    runSceneArm: sceneArmRunner(model),
    measureBudget: async (text, role = "read") => {
      const budget = requestBudgetFor(role);
      await budget.meter.prime([text]);
      return { estimate: budget.meter.count(text), contextLimit: budget.contextLimit, profileId: routedProfileId(role) };
    },
    askModel: (prompt, maxTokens, role) => model(prompt, { role, pass: ROLE_PASS[role], maxTokens }),
    runMeanwhileCase: async (spec) => {
      await loadGameLayer();
      const story = parseStoryV2OrThrow(spec.story);
      const prompt = buildMeanwhilePrompt(story, { [agendaStepKey(spec.member, spec.agenda)]: spec.done }, spec.window);
      const rawResponse = await askText(model, prompt, { role: "curator", pass: "curator", maxTokens: MEANWHILE_MAX_TOKENS });
      return { prompt, rawResponse, ...parseMeanwhile(rawResponse, story) };
    },
    lifeBlock: async (story, values, memberId) => {
      const layer = await loadGameLayer();
      const text = layer.life.privateLifeLines(parseStoryV2OrThrow(story), values, memberId);
      const budget = requestBudgetFor("read");
      await budget.meter.prime([text]);
      return { text, tokens: text ? budget.meter.count(text) : 0 };
    },
    runFixture: async (spec, options = {}) => {
      await loadGameLayer();
      const hinted = { ...spec, story: withHints(spec.story, options.hints) };
      const first = buildFixtureRun(hinted);
      let judged: LiveFixtureResult["judged"];
      let judgedDeltas: LiveFixtureResult["deltas"] = [];
      const judge = manager.getJudge();
      if (options.judge && judge) {
        const qualities = first.scope.map((entry) => entry.quality).filter((quality) => quality.read_as && quality.source === "extractor");
        const checkpoint = first.story.checkpointById[first.activeCheckpointId];
        const window = spec.transcript.map((entry) => ({ id: entry.index, speaker: entry.speaker, text: entry.text }));
        const plan = qualities.length && checkpoint ? buildTypedPlan(qualities, window, { title: first.story.title, checkpointName: checkpoint.name, objective: checkpoint.objective }) : null;
        if (plan) {
          const result = await judge.probe(plan.request);
          const read = result.answers ? readTypedDeltas(result.answers, plan, qualities, window) : { deltas: [], answered: [] };
          judged = { answered: read.answered, answers: result.answers, model: result.model, ...(result.fallback ? { fallback: result.fallback } : {}) };
          judgedDeltas = read.deltas.map((delta) => ({ q: delta.q, v: delta.v, evidence: delta.evidence, judge: delta.confidence }));
        }
      }
      const answered = judged?.answered ?? [];
      const { story, prompt, sources } = answered.length ? buildFixtureRun({ ...hinted, excludeKeys: answered }) : first;
      const rawResponse = await askText(model, prompt, { role: "read", pass: "read", maxTokens: 512 });
      const parsed = parseSharedReadResponse(rawResponse, story);
      const llmDeltas = parsed.deltas.filter((entry) => !answered.includes(entry.delta.q));
      const judgedParsed = judgedDeltas.map((delta) => ({ delta: { q: delta.q, v: delta.v as PrimitiveValue }, evidence: delta.evidence }));
      const guarded = applyRatingGrounding(story.qualityByKey, spec.blackboard?.values ?? {}, [...judgedParsed, ...llmDeltas]).accepted.map((entry) => ({ q: entry.delta.q, v: entry.delta.v }));
      return {
        prompt,
        rawResponse,
        deltas: [...judgedDeltas, ...llmDeltas.map((entry) => ({ q: entry.delta.q, v: entry.delta.v, evidence: entry.evidence }))],
        ...liveReadTiers(parsed),
        scope: first.scope.map((entry) => entry.key),
        sources,
        guarded,
        ...(judged ? { judged } : {}),
      };
    },
  };
  globalThis.storyOrchestratorLiveSuite = handle;
}

// Phase A: the create op is measured before it is built. The candidate prompt and
// the code guards run over the curator's own model (the curator role's routed profile); nothing is written.
export function curatorCreateRunner(manager: RuntimeManager): LiveSuiteHandle["runCuratorCreate"] {
  return async (entry) => {
    const context = caseContext(entry);
    const prompt = buildCreateCandidatePrompt(caseScope(entry), context);
    const rawResponse = await askText(liveModel(manager), prompt, { role: "curator", pass: "curator", maxTokens: 512 });
    return { prompt, rawResponse, sample: scoreCreateSample(entry, rawResponse) };
  };
}
