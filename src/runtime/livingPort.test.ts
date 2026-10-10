import { parseStoryV2OrThrow, type NormalizedStoryV2 } from "@engine/index";
import type { LivingRuntimeState } from "@generation/living/types";
import { createLivingState } from "@generation/living/types";
import type { LivingCoordinatorDeps } from "./coordinators/livingCoordinator";
import { LIVING_NOT_LOADED, LivingPort } from "./livingPort";

const story = (living: boolean): NormalizedStoryV2 => parseStoryV2OrThrow({
  format: 2, id: "s", title: "S", description: "d", qualities: [], roster: [], transitions: [],
  checkpoints: living ? [] : [{ id: "a", name: "A", objective: "o", type: "anchor", start: true }],
  ...(living ? { living: { premise: "A coast where the lanterns go out one by one." } } : {}),
});

const harness = (options: { living?: boolean; branching?: boolean; state?: LivingRuntimeState } = {}) => {
  const calls: string[] = [];
  const fake = {
    adopt: (mode: string) => calls.push(`adopt:${mode}`),
    applyAccepted: async () => { calls.push("apply"); return 1; },
    compact: () => calls.push("compact"),
    restoreAfterRollback: (boundary: number) => { calls.push(`restore:${boundary}`); return 2; },
    refold: () => ({ broken: ["x"] }),
    commitAuthored: () => calls.push("commit"),
    schedule: () => { calls.push("schedule"); return false; },
    checkDivergence: async () => { calls.push("divergence"); return false; },
    prefetch: () => { calls.push("prefetch"); return false; },
  };
  let loads = 0;
  const deps = {
    getStory: () => story(options.living ?? true),
    getLiving: () => options.state,
    branching: () => options.branching ?? true,
    notify: () => undefined,
  } as unknown as LivingCoordinatorDeps;
  const importer = async () => { loads += 1; return { LivingCoordinator: function LivingCoordinator() { return fake; }, livingAuthorView: () => null } as never; };
  return { port: new LivingPort(deps, importer), calls, loads: () => loads };
};

describe("v2.8 22 living port: the main entry holds a door, the director loads on demand", () => {
  it("loads nothing for a story with no living block while branching is off", async () => {
    const { port, loads } = harness({ living: false, branching: false });
    expect(port.relevant()).toBe(false);
    port.adopt("activate");
    await port.afterBoundary({ boundary: 1, messageId: 2, fired: false }, () => undefined);
    expect(loads()).toBe(0);
  });

  it("adopt loads the coordinator once; the boundary pass schedules, checks divergence only when nothing fired, then prefetches", async () => {
    const { port, calls, loads } = harness();
    port.adopt("hydrate");
    await port.afterBoundary({ boundary: 3, messageId: 6, fired: false }, () => undefined);
    await port.afterBoundary({ boundary: 4, messageId: 8, fired: true }, () => undefined);
    expect(loads()).toBe(1);
    expect(calls).toEqual(["adopt:hydrate", "schedule", "divergence", "prefetch", "schedule", "prefetch"]);
  });

  it("applies only when a proposal is accepted, and refuses an author update until the history has loaded", async () => {
    const accepted = { ...createLivingState(), proposals: [{ status: "accepted" }] } as unknown as LivingRuntimeState;
    const idle = harness();
    expect(await idle.port.applyAccepted({ boundary: 1, messageId: 2 })).toBe(0);
    expect(idle.loads()).toBe(0);
    expect(idle.port.refold({ raw: {}, hash: "h" })).toEqual({ broken: [LIVING_NOT_LOADED] });
    const busy = harness({ state: accepted });
    expect(await busy.port.applyAccepted({ boundary: 1, messageId: 2 })).toBe(1);
    expect(busy.calls).toEqual(["apply"]);
  });

  it("a rollback before the chunk loaded is replayed once it has, when the chat tracks a history", async () => {
    const tracked = { ...createLivingState(), authored: { raw: {}, hash: "h" } } as LivingRuntimeState;
    const { port, calls } = harness({ state: tracked });
    expect(port.restoreAfterRollback(5)).toBe(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual(["restore:5"]);
    expect(port.restoreAfterRollback(4)).toBe(2);
  });
});
