import {
  runWardenRescore, WARDEN_RESCORE_USES, type WardenRescoreUse, type WardenRescoreRow,
  runAgencyCalibration, type AgencyCase, runHouseRuleCalibration, type HouseRuleCase, runCombinedContinuityCalibration,
  isCombinedCase, type CombinedContinuityCase, type RescoreResult, runJudgeDirectorSelfTest,
  runMemoryPairsCalibration, runMemoryVerifyCalibration, runSceneCalibration, type SceneCalibrationCase,
  runLoreCalibration, type LoreCalibrationCase, runLoreRelevanceCalibration, type LoreRelevanceReport,
  runContinuityCalibration, type ContinuityCase,
  runBackgroundCalibration, type BackgroundCase, runTypedCalibration, type TypedCase, runStallCalibration,
  type StallCase, runCriticCalibration, type CriticCase, runVariantCalibration, type VariantStub, type MemoryPairCase,
  type MemoryVerifyCase, type JudgeSelfTestCase, type JudgeSelfTestReport,
} from "@judge/calibration";
import {
  runCuratorFilterCalibration, DEFAULT_JUDGE_PROVIDER, type CuratorFilterCase, type JudgeDirectorDecision, type JudgeDirectorInput, type JudgeProviderId, type JudgeRequest, type JudgeResult,
} from "@judge/index";
import {
  runContradictionReleaseCalibration, scoreReleasePhaseA, type ContradictionReleaseCase, type ReleasePhaseAVerdict,
} from "@judge/contradictionCalibration";
import { runWardenLoreCalibration, runVoiceCalibration, type VoiceCase, type WardenLoreCase } from "@judge/calibration";
import { parseStoryV2OrThrow, type NormalizedStoryV2 } from "@engine/index";
import { loadGameLayer } from "@engine/validate/gameLayer";
import type { JudgeRuntime } from "./judge";
import { voiceProfile } from "./continuity";
import { rosterMemberName } from "./roster";

export interface VoiceRow {
  id: string;
  member: string;
  label: "in" | "ooc";
  reply: string;
}

export interface JudgeHarness {
  probe(request: JudgeRequest, model?: string, provider?: JudgeProviderId): Promise<JudgeResult>;
  director(input: JudgeDirectorInput): Promise<JudgeDirectorDecision | null>;
  invalidateStatus(): void;
  modelVerdict: JudgeRuntime["modelVerdict"];
  calibrate(use: string, cases: unknown[], model?: string, provider?: JudgeProviderId, split?: number): Promise<JudgeSelfTestReport>;
  calibrateLoreRelevance(cases: unknown[], model?: string, provider?: JudgeProviderId, split?: number): Promise<LoreRelevanceReport>;
  calibrateVoice(story: unknown, rows: VoiceRow[], model?: string, provider?: JudgeProviderId): Promise<JudgeSelfTestReport>;
  rescore(use: string, rows: WardenRescoreRow[], model?: string, provider?: JudgeProviderId): Promise<RescoreResult[]>;
  scoreContradictionRelease(report: Pick<JudgeSelfTestReport, "rows">, cases: ContradictionReleaseCase[], modes: Record<string, readonly string[] | null>): ReleasePhaseAVerdict;
}

type Ask = (request: JudgeRequest) => Promise<JudgeResult>;

const mergeParts = (parts: JudgeResult[]): JudgeResult => {
  const answered = parts.filter((part) => part.answers);
  const usage = {
    input_tokens: parts.reduce((sum, part) => sum + (part.usage?.input_tokens ?? 0), 0),
    output_tokens: parts.reduce((sum, part) => sum + (part.usage?.output_tokens ?? 0), 0),
  };
  const fallback = parts.find((part) => part.fallback)?.fallback;
  return {
    answers: answered.length ? Object.assign({}, ...answered.map((part) => part.answers)) : null,
    model: parts.find((part) => part.model)?.model ?? null,
    latencyMs: parts.reduce((sum, part) => sum + part.latencyMs, 0),
    stateChars: parts[0]?.stateChars ?? 0,
    questionCount: parts.reduce((sum, part) => sum + part.questionCount, 0),
    cached: parts.every((part) => part.cached),
    usage,
    ...(fallback && !answered.length ? { fallback } : {}),
  };
};

export const splitQuestions = (ask: Ask, size: number): Ask => async (request) => {
  const ids = Object.keys(request.questions);
  if (!(size >= 1) || ids.length <= size) return ask(request);
  const parts: JudgeResult[] = [];
  for (let start = 0; start < ids.length; start += size) {
    parts.push(await ask({ ...request, questions: Object.fromEntries(ids.slice(start, start + size).map((id) => [id, request.questions[id]])) }));
  }
  return mergeParts(parts);
};

const askVia = (runtime: JudgeRuntime, model: string | undefined, provider: JudgeProviderId | undefined, split: number | undefined): Ask => {
  const ask: Ask = (request) => runtime.probe(request, model, provider);
  return split && provider && provider !== DEFAULT_JUDGE_PROVIDER ? splitQuestions(ask, split) : ask;
};

const CALIBRATIONS: Record<string, (ask: Ask, cases: unknown[]) => Promise<JudgeSelfTestReport>> = {
  director: (ask, cases) => runJudgeDirectorSelfTest(ask, cases as JudgeSelfTestCase[]),
  "memory-verify": (ask, cases) => runMemoryVerifyCalibration(ask, cases as MemoryVerifyCase[]),
  "memory-pairs": (ask, cases) => runMemoryPairsCalibration(ask, cases as MemoryPairCase[]),
  "contradiction-release": (ask, cases) => runContradictionReleaseCalibration(ask, cases as ContradictionReleaseCase[]),
  scene: (ask, cases) => runSceneCalibration(ask, cases as SceneCalibrationCase[]),
  lore: (ask, cases) => runLoreCalibration(ask, cases as LoreCalibrationCase[]),
  "curator-filter": (ask, cases) => runCuratorFilterCalibration(ask, cases as CuratorFilterCase[]),
  continuity: (ask, cases) => ((cases as CombinedContinuityCase[]).some(isCombinedCase)
    ? runCombinedContinuityCalibration(ask, cases as CombinedContinuityCase[])
    : runContinuityCalibration(ask, cases as ContinuityCase[])),
  agency: (ask, cases) => runAgencyCalibration(ask, cases as AgencyCase[]),
  "house-rules": (ask, cases) => runHouseRuleCalibration(ask, cases as HouseRuleCase[]),
  "warden-lore": (ask, cases) => runWardenLoreCalibration(ask, cases as WardenLoreCase[]),
  "warden-lore-facts": (ask, cases) => runWardenLoreCalibration(ask, cases as WardenLoreCase[], "facts"),
  typed: (ask, cases) => runTypedCalibration(ask, cases as TypedCase[]),
  stall: (ask, cases) => runStallCalibration(ask, cases as StallCase[]),
  critic: (ask, cases) => runCriticCalibration(ask, cases as CriticCase[]),
  variants: (ask, cases) => runVariantCalibration(ask, cases as VariantStub[]),
  backgrounds: (ask, cases) => runBackgroundCalibration(ask, cases as BackgroundCase[], (cases as Array<{ installed?: string[] }>)[0]?.installed ?? []),
};

export const voiceCases = (story: NormalizedStoryV2, rows: VoiceRow[]): VoiceCase[] => rows.map((row) => {
  const wanted = row.member.trim().toLowerCase();
  const member = story.roster.find((entry) => entry.id.toLowerCase() === wanted || rosterMemberName(entry).trim().toLowerCase() === wanted);
  const voice = member ? voiceProfile(story, null, rosterMemberName(member)) : null;
  if (!member || !voice) throw new Error(`voice row ${row.id}: "${row.member}" is not a roster member of ${story.title}`);
  return { id: row.id, label: row.label, reply: { speaker: voice.speaker, text: row.reply }, voice };
});

export const createJudgeHarness =(runtime: JudgeRuntime): JudgeHarness => ({
  probe: (request, model, provider) => runtime.probe(request, model, provider),
  director: (input) => runtime.director(input),
  invalidateStatus: () => runtime.invalidateStatus(),
  modelVerdict: (requested, answered) => runtime.modelVerdict(requested, answered),
  calibrate: (use, cases, model, provider, split) => {
    const run = CALIBRATIONS[use];
    return run ? run(askVia(runtime, model, provider, split), cases) : Promise.reject(new Error(`no calibration for judge use '${use}' yet`));
  },
  calibrateLoreRelevance: (cases, model, provider, split) => runLoreRelevanceCalibration(askVia(runtime, model, provider, split), cases as never),
  calibrateVoice: async (story, rows, model, provider) => {
    await loadGameLayer();
    return runVoiceCalibration(askVia(runtime, model, provider, undefined), voiceCases(parseStoryV2OrThrow(story), rows));
  },
  rescore: (use, rows, model, provider) => ((WARDEN_RESCORE_USES as readonly string[]).includes(use)
    ? runWardenRescore((request) => runtime.probe(request, model, provider), use as WardenRescoreUse, rows)
    : Promise.reject(new Error(`no rescore for judge use '${use}' yet`))),
  scoreContradictionRelease: (report, cases, modes) => scoreReleasePhaseA(report, cases, modes),
});
