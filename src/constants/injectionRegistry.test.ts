import { findInjectionRegistryProblems, INJECTION_REGISTRY } from "./injectionRegistry";

describe("injection registry", () => {
  it("has no duplicate keys and every depth collision is allowlisted", () => {
    expect(findInjectionRegistryProblems()).toEqual([]);
  });

  it("keeps every injection key namespaced under story_", () => {
    for (const spec of Object.values(INJECTION_REGISTRY)) {
      expect(spec.key.startsWith("story_")).toBe(true);
    }
  });
});
