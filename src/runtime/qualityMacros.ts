// v2.4 plan 08 R15 (X24): one `{{story_quality_<key>}}` per authored quality. The seam registers zero-argument
// macros only (08-H10), so the parametric `{{story_quality::key}}` form is v2.5. A macro is a pure read of the
// blackboard at evaluation: it never drains or computes, and a ledger-bound quality reads through the
// blackboard, its single writer. Epistemic content has no quality and so no macro.

export const QUALITY_MACRO_PREFIX = "story_quality_";
const MACRO_KEY = /^[a-z0-9_]+$/;

export interface QualitySource {
  qualities: Array<{ key: string }>;
}

export function qualityMacroPlan(story: QualitySource | null): { keys: string[]; skipped: string[] } {
  const keys: string[] = [];
  const skipped: string[] = [];
  for (const { key } of story?.qualities ?? []) (MACRO_KEY.test(key) ? keys : skipped).push(key);
  return { keys, skipped };
}

export const renderQualityValue = (values: Record<string, unknown>, key: string): string => {
  const value = values[key];
  return value === undefined || value === null ? "(unset)" : String(value);
};

export interface QualityMacroHost {
  register(name: string, read: () => string): void;
  unregister(name: string): void;
  journal(summary: string, detail: string): void;
  values(): Record<string, unknown>;
}

export function createQualityMacroSync(host: QualityMacroHost): (story: QualitySource | null) => void {
  let registered: string[] = [];
  let signature = "";
  return (story) => {
    const plan = qualityMacroPlan(story);
    const next = [...plan.keys].sort().join("|");
    const skippedSignature = plan.skipped.join("|");
    if (`${next}#${skippedSignature}` === signature) return;
    signature = `${next}#${skippedSignature}`;
    for (const name of registered) host.unregister(name);
    registered = plan.keys.map((key) => {
      const name = `${QUALITY_MACRO_PREFIX}${key}`;
      host.register(name, () => renderQualityValue(host.values(), key));
      return name;
    });
    for (const key of plan.skipped) host.journal("quality macro skipped", `{{${QUALITY_MACRO_PREFIX}${key}}} is not registered: a macro key must be lowercase letters, digits and _`);
  };
}
