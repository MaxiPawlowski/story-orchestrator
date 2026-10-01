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
  runCuratorFilterCalibration, type CuratorFilterCase, type JudgeDirectorDecision, type JudgeDirectorInput, type JudgeProviderId, type JudgeRequest, type JudgeResult,
} from "@judge/index";
import {
  runContradictionReleaseCalibration, scoreReleasePhaseA, type ContradictionReleaseCase, type ReleasePhaseAVerdict,
} from "@judge/contradictionCalibration";
import { runWardenLoreCalibration, type WardenLoreCase } from "@judge/calibration";
import type { JudgeRuntime } from "./judge";

export interface JudgeHarness {
  probe(request: JudgeRequest, model?: string, provider?: JudgeProviderId): Promise<JudgeResult>;
  director(input: JudgeDirectorInput): Promise<JudgeDirectorDecision | null>;
  invalidateStatus(): void;
  modelVerdict: JudgeRuntime["modelVerdict"];
  calibrate(use: string, cases: unknown[], model?: string, provider?: JudgeProviderId): Promise<JudgeSelfTestReport>;
  calibrateLoreRelevance(cases: unknown[], model?: string, provider?: JudgeProviderId): Promise<LoreRelevanceReport>;
  rescore(use: string, rows: WardenRescoreRow[], model?: string, provider?: JudgeProviderId): Promise<RescoreResult[]>;
  scoreContradictionRelease(report: Pick<JudgeSelfTestReport, "rows">, cases: ContradictionReleaseCase[], modes: Record<string, readonly string[] | null>): ReleasePhaseAVerdict;
}

type Ask = (request: JudgeRequest) => Promise<JudgeResult>;

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

export const createJudgeHarness = (runtime: JudgeRuntime): JudgeHarness => ({
  probe: (request, model, provider) => runtime.probe(request, model, provider),
  director: (input) => runtime.director(input),
  invalidateStatus: () => runtime.invalidateStatus(),
  modelVerdict: (requested, answered) => runtime.modelVerdict(requested, answered),
  calibrate: (use, cases, model, provider) => {
    const run = CALIBRATIONS[use];
    return run ? run((request) => runtime.probe(request, model, provider), cases) : Promise.reject(new Error(`no calibration for judge use '${use}' yet`));
  },
  calibrateLoreRelevance: (cases, model, provider) => runLoreRelevanceCalibration((request) => runtime.probe(request, model, provider), cases as never),
  rescore: (use, rows, model, provider) => ((WARDEN_RESCORE_USES as readonly string[]).includes(use)
    ? runWardenRescore((request) => runtime.probe(request, model, provider), use as WardenRescoreUse, rows)
    : Promise.reject(new Error(`no rescore for judge use '${use}' yet`))),
  scoreContradictionRelease: (report, cases, modes) => scoreReleasePhaseA(report, cases, modes),
});
