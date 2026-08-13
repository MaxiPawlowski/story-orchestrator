import { derivePipelineStatus } from "./pipeline";
import type { ExtractionRuntimeState } from "./types";

const state = (overrides: Partial<ExtractionRuntimeState> = {}): ExtractionRuntimeState => ({
  settings: { enabled: true, profileId: "p1", cadence: 3, reconciliationMultiplier: 1.5, stabilityLag: 0 },
  audits: [],
  reconciliationEvents: [],
  lastReadBoundary: 0,
  scheduler: { queueDepth: 0, inFlight: false, lastError: null },
  ...overrides,
});

const pending = { id: "1", boundary: 4, checkpointId: "cp1", targetedKeys: ["has_key"], scheduledAt: "t", resolvedAt: null, evidence: [] };

describe("derivePipelineStatus", () => {
  it("reports a configured, quiet pipeline as following along", () => {
    expect(derivePipelineStatus(state())).toMatchObject({ state: "idle", needsSetup: false });
  });

  it("distinguishes a missing profile from a disabled pipeline, both actionable", () => {
    expect(derivePipelineStatus(state({ settings: { ...state().settings, profileId: null } }))).toMatchObject({ state: "not-configured", needsSetup: true });
    const disabled = derivePipelineStatus(state({ settings: { ...state().settings, enabled: false } }));
    expect(disabled.state).toBe("not-configured");
    expect(disabled.text).not.toBe(derivePipelineStatus(state({ settings: { ...state().settings, profileId: null } })).text);
  });

  it("shows a scheduler error above everything else", () => {
    const status = derivePipelineStatus(state({ scheduler: { queueDepth: 2, inFlight: true, lastError: "profile gone" }, reconciliationEvents: [pending] }));
    expect(status).toMatchObject({ state: "error", detail: "profile gone", needsSetup: true });
  });

  it("says it is re-checking while a stall re-read is unresolved, and stops once resolved", () => {
    const stalled = derivePipelineStatus(state({ reconciliationEvents: [pending], scheduler: { queueDepth: 1, inFlight: true, lastError: null } }));
    expect(stalled.state).toBe("stalled-rechecking");
    expect(stalled.text).toContain("re-checking");
    expect(derivePipelineStatus(state({ reconciliationEvents: [{ ...pending, resolvedAt: "t2" }] })).state).toBe("idle");
  });

  it("separates a read in flight from queued work", () => {
    expect(derivePipelineStatus(state({ scheduler: { queueDepth: 1, inFlight: true, lastError: null } })).state).toBe("reading");
    expect(derivePipelineStatus(state({ scheduler: { queueDepth: 1, inFlight: false, lastError: null } })).state).toBe("working");
  });
});
