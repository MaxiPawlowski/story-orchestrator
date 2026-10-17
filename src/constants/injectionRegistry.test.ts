import { carriesInto, CARRY_TYPES, findInjectionRegistryProblems, INJECTION_REGISTRY, isScannableInjectionKey, SCANNABLE_INJECTIONS, type InjectionSpec } from "./injectionRegistry";
import { WITHHOLDING_TYPES } from "../runtime/generationLifecycle";

describe("injection registry", () => {
  it("has no duplicate keys and every depth collision is allowlisted", () => {
    expect(findInjectionRegistryProblems()).toEqual([]);
  });

  it("keeps every injection key namespaced under story_", () => {
    for (const spec of Object.values(INJECTION_REGISTRY)) {
      expect(spec.key.startsWith("story_")).toBe(true);
    }
  });

  describe("v2.8 69 K9: every block declares what a quiet and an impersonate run carry", () => {
    it("every entry declares keep or withhold for both withholding types, and those are exactly the lifecycle's", () => {
      expect([...CARRY_TYPES].sort()).toEqual([...WITHHOLDING_TYPES].sort());
      for (const spec of Object.values(INJECTION_REGISTRY) as InjectionSpec[]) {
        for (const type of CARRY_TYPES) expect([spec.key, ["keep", "withhold"].includes(spec.carry?.[type])]).toEqual([spec.key, true]);
      }
    });

    it("negative control: an entry without carry, or with an unknown value, fails the guard", () => {
      const { carry: _dropped, ...bare } = INJECTION_REGISTRY.pacing;
      const planted = { ...INJECTION_REGISTRY, pacing: bare as unknown as InjectionSpec, ledger: { ...INJECTION_REGISTRY.ledger, carry: { quiet: "keep", impersonate: "maybe" } } as unknown as InjectionSpec };
      expect(findInjectionRegistryProblems(planted)).toEqual([
        `"${INJECTION_REGISTRY.pacing.key}" does not declare what a quiet run carries`,
        `"${INJECTION_REGISTRY.pacing.key}" does not declare what a impersonate run carries`,
        `"${INJECTION_REGISTRY.ledger.key}" does not declare what a impersonate run carries`,
      ]);
    });

    it("a loud run carries everything; a withholding run carries only what keeps", () => {
      expect(carriesInto(INJECTION_REGISTRY.epistemic, "normal")).toBe(true);
      expect(carriesInto(INJECTION_REGISTRY.epistemic, null)).toBe(true);
      expect(carriesInto(INJECTION_REGISTRY.epistemic, "quiet")).toBe(false);
      expect(carriesInto(INJECTION_REGISTRY.playerRole, "impersonate")).toBe(true);
      const withheld = (Object.entries(INJECTION_REGISTRY) as Array<[string, InjectionSpec]>).filter(([, spec]) => !carriesInto(spec, "quiet")).map(([name]) => name).sort();
      expect(withheld).toEqual(["awayNotice", "chapterBridge", "checkOutcome", "checkpointGuidance", "continuityNote", "epistemic", "pacing", "previously"]);
    });
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
