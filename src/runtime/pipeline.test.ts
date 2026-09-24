import type { ExpansionRuntimeState, ExtractionRuntimeState } from "./types";
import { derivePipelineStatus, expansionInFlight, pipelineAction, PIPELINE_ACTION_COPY, TRANSPORT_PLAYER_TEXT } from "./pipeline";

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
    expect(status).toMatchObject({ state: "error", detail: "profile gone" });
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

// v2.3 plan 07: "preparing the road ahead" is said only while a draft is actually in flight, and a
// problem state still outranks it — a dead pipeline must never be dressed as a busy one.
describe("expansion activity", () => {
  const expansion = (overrides: Partial<ExpansionRuntimeState> = {}): ExpansionRuntimeState => ({
    entries: {},
    scheduler: { queueDepth: 0, inFlight: false, lastError: null },
    ...overrides,
  });
  const drafting = { key: "a->b->c", status: "generating" } as unknown as ExpansionRuntimeState["entries"][string];

  it("says nothing about the road ahead when no draft is in flight", () => {
    expect(expansionInFlight(expansion())).toBe(false);
    expect(derivePipelineStatus(state(), { generating: false }).state).toBe("idle");
  });

  it("reports a queued or generating draft, and the heavy lane", () => {
    expect(expansionInFlight(expansion({ entries: { "a->b->c": drafting } }))).toBe(true);
    expect(expansionInFlight(expansion({ entries: { "a->b->c": { ...drafting, status: "queued" } } }))).toBe(true);
    expect(expansionInFlight(expansion({ scheduler: { queueDepth: 1, inFlight: true, lastError: null } }))).toBe(true);
    expect(expansionInFlight(expansion({ entries: { "a->b->c": { ...drafting, status: "validated" } } }))).toBe(false);
    const status = derivePipelineStatus(state(), { generating: true });
    expect(status).toMatchObject({ state: "working", needsSetup: false });
    expect(status.text).toContain("Preparing the road ahead");
  });

  it("lets a problem state outrank the draft", () => {
    const broken = state({ settings: { ...state().settings, profileId: null } });
    expect(derivePipelineStatus(broken, { generating: true })).toMatchObject({ state: "not-configured", needsSetup: true });
    const erroring = state({ scheduler: { queueDepth: 0, inFlight: false, lastError: "profile gone" } });
    expect(derivePipelineStatus(erroring, { generating: true }).state).toBe("error");
    const catching = state({ reconciliationEvents: [pending] });
    expect(derivePipelineStatus(catching, { generating: true }).state).toBe("stalled-rechecking");
  });
});

// v2.3 plan 09. The state sentence says what the machine is doing; the next action says whether the
// player is being asked for something. Getting this wrong is how a stalled story reads as a working
// one, so the mapping is asserted per state rather than in aggregate.
describe("next action", () => {
  it("asks the player for nothing beyond waiting while the machine works", () => {
    expect(pipelineAction(derivePipelineStatus(state()))).toBe("Waiting for the next reply.");
    expect(pipelineAction(derivePipelineStatus(state({ scheduler: { queueDepth: 0, inFlight: true, lastError: null } })))).toBe("Waiting for the next reply.");
    expect(pipelineAction(derivePipelineStatus(state({ scheduler: { queueDepth: 2, inFlight: false, lastError: null } })))).toBe("Waiting for the next reply.");
    expect(pipelineAction(derivePipelineStatus(state(), { generating: true }))).toBe("Waiting for the next reply.");
  });

  it("says retrying while it is re-checking, and open Repair when it is stopped", () => {
    const catching = derivePipelineStatus(state({ reconciliationEvents: [pending] }));
    expect(catching.nextAction).toBe("retry");
    expect(pipelineAction(catching)).toBe("Retrying.");
    expect(pipelineAction(derivePipelineStatus(state(), undefined, { kind: "config", detail: "The selected memory model profile no longer exists" }))).toBe("Paused — open Repair.");
    for (const broken of [
      state({ settings: { ...state().settings, profileId: null } }),
      state({ settings: { ...state().settings, enabled: false } }),
    ]) {
      expect(pipelineAction(derivePipelineStatus(broken))).toBe("Paused — open Repair.");
    }
  });

  it("keeps the state sentence free of the action and the queue vocabulary", () => {
    // The words a player reads must not carry counts, retries or profile ids: those live in `detail`.
    const status = derivePipelineStatus(state({ reconciliationEvents: [pending] }));
    expect(status.text).not.toContain("Retrying");
    expect(status.detail).toBeNull();
    expect(PIPELINE_ACTION_COPY.retry.length).toBeLessThan(20);
  });
});

// v2.4 plan 03 D3. Three failure classes, three player readings, and none of them a pause.
describe("failure classes", () => {
  const transport = { kind: "transport" as const, detail: "API request failed: Response not OK", since: 1, nextProbeAt: 5001, probing: false };
  const config = { kind: "config" as const, detail: "The selected memory model profile no longer exists" };

  it("a memory model that is not answering is a stall the player can retry, not an error", () => {
    const status = derivePipelineStatus(state({ scheduler: { queueDepth: 1, inFlight: false, lastError: null } }), undefined, transport);
    expect(status).toEqual({ state: "stalled-rechecking", text: TRANSPORT_PLAYER_TEXT, detail: transport.detail, needsSetup: false, nextAction: "retry", retryable: true });
    expect(status.text).toBe("The memory model is not answering — the story will catch up when it does.");
  });

  it("a config problem is not-configured with its detail, and outranks a stall", () => {
    const status = derivePipelineStatus(state({ reconciliationEvents: [pending] }), { generating: true }, config);
    expect(status).toMatchObject({ state: "not-configured", detail: config.detail, needsSetup: true, nextAction: "repair" });
    expect(status.retryable).toBeUndefined();
  });

  it("a bug is this chat's error and waits for the next reply instead of asking for Repair", () => {
    const status = derivePipelineStatus(state({ scheduler: { queueDepth: 0, inFlight: false, lastError: "TypeError: x" } }), undefined, transport);
    expect(status).toMatchObject({ state: "error", detail: "TypeError: x", needsSetup: false, nextAction: "wait" });
  });

  it("control: only the transport stall offers Try again", () => {
    expect(derivePipelineStatus(state({ reconciliationEvents: [pending] })).retryable).toBeUndefined();
    expect(derivePipelineStatus(state()).retryable).toBeUndefined();
  });

  it("keeps the player sentence free of the transport detail", () => {
    const status = derivePipelineStatus(state(), undefined, transport);
    expect(status.text).not.toContain("API");
    expect(status.text).not.toContain("Response");
  });
});
