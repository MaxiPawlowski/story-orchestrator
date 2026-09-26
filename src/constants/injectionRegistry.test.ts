import { findInjectionRegistryProblems, INJECTION_REGISTRY, isScannableInjectionKey, SCANNABLE_INJECTIONS } from "./injectionRegistry";

describe("injection registry", () => {
  it("has no duplicate keys and every depth collision is allowlisted", () => {
    expect(findInjectionRegistryProblems()).toEqual([]);
  });

  it("keeps every injection key namespaced under story_", () => {
    for (const spec of Object.values(INJECTION_REGISTRY)) {
      expect(spec.key.startsWith("story_")).toBe(true);
    }
  });

  describe("L4: which blocks may be added to the World Info scan", () => {
    it("only the facts, scene history and checkpoint guidance blocks are scannable", () => {
      expect([...SCANNABLE_INJECTIONS].sort()).toEqual([INJECTION_REGISTRY.checkpointGuidance.key, INJECTION_REGISTRY.memoryFacts.key, INJECTION_REGISTRY.memorySceneHistory.key].sort());
      expect(isScannableInjectionKey(INJECTION_REGISTRY.memoryFacts.key)).toBe(true);
      expect(isScannableInjectionKey(INJECTION_REGISTRY.epistemic.key)).toBe(false);
      expect(isScannableInjectionKey("story_copilot_nudge")).toBe(false);
    });

    it("negative control: a registry that marks the epistemic block scannable fails the guard", () => {
      const planted = { ...INJECTION_REGISTRY, epistemic: { ...INJECTION_REGISTRY.epistemic, scannable: true as const } };
      expect(findInjectionRegistryProblems(planted)).toEqual([`"${INJECTION_REGISTRY.epistemic.key}" may never be added to the World Info scan`]);
    });

    it("negative control: the ledger and a key outside the allowlist fail too", () => {
      const planted = {
        ...INJECTION_REGISTRY,
        ledger: { ...INJECTION_REGISTRY.ledger, scannable: true as const },
        pacing: { ...INJECTION_REGISTRY.pacing, scannable: true as const },
      };
      expect(findInjectionRegistryProblems(planted)).toEqual([
        `"${INJECTION_REGISTRY.pacing.key}" is not on the scannable allowlist`,
        `"${INJECTION_REGISTRY.ledger.key}" may never be added to the World Info scan`,
      ]);
    });
  });
});
