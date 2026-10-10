export const CALIBRATION_USES = ['director', 'memory-verify', 'memory-pairs', 'scene', 'lore', 'curator-filter', 'continuity', 'backgrounds', 'typed', 'stall', 'critic', 'variants', 'agency', 'house-rules'] as const;
export type CalibrationUse = (typeof CALIBRATION_USES)[number];

export const FAMILY_USES: readonly CalibrationUse[] = ['scene', 'lore', 'curator-filter', 'continuity', 'backgrounds', 'typed', 'stall', 'critic', 'variants', 'agency', 'house-rules'];

export const USE_TIERS: Record<'tier1' | 'tier2' | 'tier3', readonly CalibrationUse[]> = {
  tier1: ['stall', 'agency', 'house-rules', 'memory-verify', 'memory-pairs', 'continuity'],
  tier2: ['director', 'scene', 'typed', 'backgrounds', 'curator-filter', 'critic', 'variants'],
  tier3: ['lore'],
};

export const isCalibrationUse = (value: string): value is CalibrationUse => (CALIBRATION_USES as readonly string[]).includes(value);

export async function runUse(judge: any, use: CalibrationUse, ask: any, fixture: any) {
  switch (use) {
    case 'director': return judge.runJudgeDirectorSelfTest(ask, fixture.rows);
    case 'memory-verify': return judge.runMemoryVerifyCalibration(ask, fixture.rows);
    case 'memory-pairs': return judge.runMemoryPairsCalibration(ask, fixture.rows);
    case 'scene': return judge.runSceneCalibration(ask, fixture.rows);
    case 'lore': return judge.runLoreCalibration(ask, judge.resolveLoreCases(fixture));
    case 'curator-filter': return judge.runCuratorFilterCalibration(ask, fixture.rows);
    case 'continuity': return fixture.rows.some(judge.isCombinedCase) ? judge.runCombinedContinuityCalibration(ask, fixture.rows) : judge.runContinuityCalibration(ask, fixture.rows);
    case 'agency': return judge.runAgencyCalibration(ask, fixture.rows);
    case 'house-rules': return judge.runHouseRuleCalibration(ask, fixture.rows);
    case 'backgrounds': return judge.runBackgroundCalibration(ask, fixture.rows, fixture.installed);
    case 'typed': return judge.runTypedCalibration(ask, fixture.rows);
    case 'stall': return judge.runStallCalibration(ask, fixture.rows);
    case 'critic': return judge.runCriticCalibration(ask, fixture.rows);
    case 'variants': return judge.runVariantCalibration(ask, fixture.rows);
  }
}
