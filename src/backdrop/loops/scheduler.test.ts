import { LoopScheduler, LOOP_FAILURES_PER_TARGET, type LoopSchedulerDeps } from "./scheduler";
import type { LoopTarget } from "./plan";
import { couldNot, wrote } from "@utils/writeResult";

const target = (background: string, mode: "pre" | "auto" = "pre"): LoopTarget => ({ checkpoint: background, background, still: `/backgrounds/${background}.jpg`, mode });
const flush = async (rounds = 20) => { for (let index = 0; index < rounds; index += 1) await Promise.resolve(); };

function harness(over: Partial<LoopSchedulerDeps> = {}) {
  const published: Array<[string, string]> = [];
  const rendered: string[] = [];
  const waits: Array<() => void> = [];
  const deps: LoopSchedulerDeps = {
    enabled: () => true,
    idle: async () => true,
    resolve: async (loop) => ({ key: `k-${loop.background}`, target: loop }),
    cached: async () => null,
    render: async (loop) => { rendered.push(loop.target.background); return wrote({ url: `/user/images/story-orchestrator-loops/${loop.key}.webm` }); },
    publish: (loop, url) => { published.push([loop.background, url]); },
    wait: (_ms, signal) => new Promise<void>((resolve) => { waits.push(resolve); signal.addEventListener("abort", () => resolve(), { once: true }); }),
    ...over,
  };
  const releaseWaits = () => { while (waits.length) waits.shift()!(); };
  return { deps, published, rendered, waits, releaseWaits, scheduler: new LoopScheduler(deps) };
}

describe("LoopScheduler", () => {
  it("renders the current location first, then each pre-marked one once, and publishes every result", async () => {
    const { scheduler, rendered, published } = harness();
    scheduler.start([target("tavern"), target("beach")], target("forest", "auto"));
    await flush();
    expect(rendered).toEqual(["forest", "tavern", "beach"]);
    expect(published.map(([name]) => name)).toEqual(["forest", "tavern", "beach"]);
    scheduler.stop();
  });

  it("replays a cache hit without rendering", async () => {
    const { scheduler, rendered, published } = harness({ cached: async (key) => `/cached/${key}.webm` });
    scheduler.start([], target("forest", "auto"));
    await flush();
    expect(rendered).toEqual([]);
    expect(published).toEqual([["forest", "/cached/k-forest.webm"]]);
    scheduler.stop();
  });

  it("waits while the GPU is busy and starts once it is idle", async () => {
    let idle = false;
    const { scheduler, rendered, releaseWaits } = harness({ idle: async () => idle });
    scheduler.start([], target("forest", "auto"));
    await flush();
    expect(rendered).toEqual([]);
    idle = true;
    releaseWaits();
    await flush();
    expect(rendered).toEqual(["forest"]);
    scheduler.stop();
  });

  it("a preempted render leaves the still and is retried later, never marked done", async () => {
    let calls = 0;
    const { scheduler, published, releaseWaits } = harness({
      render: (_loop, signal) => {
        calls += 1;
        if (calls === 1) return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
        return Promise.resolve(wrote({ url: "/u.webm" }));
      },
    });
    scheduler.start([], target("forest", "auto"));
    await flush();
    expect(scheduler.busy).toBe(true);
    expect(scheduler.preempt()).toBe(true);
    await flush();
    expect(published).toEqual([]);
    releaseWaits();
    await flush();
    expect(published).toEqual([["forest", "/u.webm"]]);
    scheduler.stop();
  });

  it("gives up on a target after repeated failures and moves on", async () => {
    const { scheduler, published, releaseWaits } = harness({
      render: async (loop) => loop.target.background === "bad" ? couldNot("ComfyUI failed") : wrote({ url: "/ok.webm" }),
    });
    scheduler.start([target("bad"), target("good")], null);
    for (let round = 0; round < LOOP_FAILURES_PER_TARGET + 1; round += 1) { await flush(); releaseWaits(); }
    await flush();
    expect(published).toEqual([["good", "/ok.webm"]]);
    scheduler.stop();
  });

  it("does nothing while switched off, and stop aborts a running render", async () => {
    let enabled = false;
    let aborted = false;
    const { scheduler, rendered, releaseWaits } = harness({
      enabled: () => enabled,
      render: (_loop, signal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => { aborted = true; reject(new Error("x")); })),
    });
    scheduler.start([], target("forest", "auto"));
    await flush();
    expect(rendered).toEqual([]);
    enabled = true;
    scheduler.wake();
    releaseWaits();
    await flush();
    expect(scheduler.busy).toBe(true);
    scheduler.stop();
    await flush();
    expect(aborted).toBe(true);
  });
});
