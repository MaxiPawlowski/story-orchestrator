import type { ProbeTrigger } from "@extraction/index";
import { breakerWatchEntries, type BreakerWatchTarget } from "./breakerWatch";

const target = () => {
  const calls = { probes: [] as ProbeTrigger[], reevaluated: 0 };
  const scheduler: BreakerWatchTarget = {
    probe: async (trigger) => { calls.probes.push(trigger); return true; },
    reevaluateConfig: () => { calls.reevaluated += 1; },
  };
  return { scheduler, calls };
};

const fire = (entries: ReturnType<typeof breakerWatchEntries>, name: string, ...args: unknown[]) => {
  entries.filter((entry) => entry.eventName === name).forEach((entry) => entry.handler(...args));
};

describe("v2.4 plan 03 D3: host events that re-check the memory model", () => {
  it("ONLINE_STATUS_CHANGED only triggers a probe, it is never proof", () => {
    const { scheduler, calls } = target();
    const entries = breakerWatchEntries(() => scheduler, () => "artemis");
    fire(entries, "ONLINE_STATUS_CHANGED", "Artemis-31B");
    expect(calls).toEqual({ probes: ["online-status"], reevaluated: 0 });
  });

  it("CONNECTION_PROFILE_UPDATED for our profile re-evaluates and probes", () => {
    const { scheduler, calls } = target();
    const entries = breakerWatchEntries(() => scheduler, () => "artemis");
    fire(entries, "CONNECTION_PROFILE_UPDATED", { id: "artemis", name: "old" }, { id: "artemis", name: "new" });
    expect(calls).toEqual({ probes: ["profile-updated"], reevaluated: 1 });
  });

  it("control: CONNECTION_PROFILE_UPDATED for another profile does nothing", () => {
    const { scheduler, calls } = target();
    const entries = breakerWatchEntries(() => scheduler, () => "artemis");
    fire(entries, "CONNECTION_PROFILE_UPDATED", { id: "other" }, { id: "other" });
    expect(calls).toEqual({ probes: [], reevaluated: 0 });
  });

  it("CONNECTION_PROFILE_DELETED and CREATED re-evaluate the config class", () => {
    const { scheduler, calls } = target();
    const entries = breakerWatchEntries(() => scheduler, () => "artemis");
    fire(entries, "CONNECTION_PROFILE_DELETED", { id: "artemis" });
    fire(entries, "CONNECTION_PROFILE_CREATED", { id: "artemis" });
    expect(calls).toEqual({ probes: [], reevaluated: 2 });
  });

  it("a stopped runtime (no scheduler) ignores every event", () => {
    const entries = breakerWatchEntries(() => null, () => "artemis");
    expect(() => ["ONLINE_STATUS_CHANGED", "CONNECTION_PROFILE_UPDATED", "CONNECTION_PROFILE_DELETED", "CONNECTION_PROFILE_CREATED"].forEach((name) => fire(entries, name, { id: "artemis" }, { id: "artemis" }))).not.toThrow();
  });
});
