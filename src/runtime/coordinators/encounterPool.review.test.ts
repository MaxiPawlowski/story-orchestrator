import { parseStoryV2OrThrow, type EngineState, type NormalizedStoryV2 } from "@engine/index";
import { EXPANSION_CONTRACT, type ExpansionCacheEntry, type ExpansionRuntimeState } from "@generation/index";
import { mintToken, tokenMatches, type RunContext, type RunOwnership } from "../runToken";
import { sanitizeExpansion } from "../extras";
import type { RuntimeExtras } from "../types";
import { ExpansionCoordinator } from "./expansionCoordinator";
import type { ModelCall } from "@extraction/index";
import { testOwnership } from "../../../test/findings/testOwnership";

const ARRIVE = { q: "reached_walls", op: "==", v: true };

const raw = (offer: string[] | null = ["encounters"]) => ({
  format: 2,
  id: "pool-coordinator",
  title: "Pool coordinator",
  description: "A road between a camp and a city.",
  qualities: [
    { key: "left_camp", type: "bool", source: "extractor", rubric: "The party left camp." },
    { key: "reached_walls", type: "bool", source: "extractor", rubric: "The party reached the walls." },
  ],
  checkpoints: [
    { id: "camp", name: "Camp", objective: "Break camp.", type: "anchor", start: true },
    { id: "road", name: "On the road", objective: "Reach the walls.", type: "intermediate", stretch: { mode: "open", pace: "brief", ...(offer ? { offer } : {}), arrive_when: ARRIVE } },
    { id: "walls", name: "The walls", objective: "Arrive.", type: "anchor" },
  ],
  transitions: [
    { from: "camp", to: "road", priority: 1, gate: { q: "left_camp", op: "==", v: true } },
    { from: "road", to: "walls", priority: 1, gate: ARRIVE },
  ],
  roster: [],
});

const GOOD = JSON.stringify({
  encounters: [
    { title: "A broken cart", situation: "A merchant's cart lies tipped at the roadside and the driver is shouting for help." },
    { title: "Smoke on the ridge", situation: "A thin column of smoke rises from the ridge, too steady for a campfire." },
    { title: "The toll keeper", situation: "A bored toll keeper has set a rope across the road and wants a coin." },
    { title: "A lost goat", situation: "A goat with a bell round its neck wanders out of the hedge." },
  ],
});

const fresh = (): ExpansionRuntimeState => ({ entries: {}, scheduler: { queueDepth: 0, inFlight: false, lastError: null } });

function harness(options: { active?: string; values?: Record<string, unknown>; ownership?: RunOwnership; expansion?: () => ExpansionRuntimeState } = {}) {
  let planted: string | null = null;
  const model: ModelCall = Object.assign(
    async (_prompt: string, ask: { debugResponse?: string | null }) => ({ text: ask.debugResponse ?? planted ?? "", finish: "unknown" as const }),
    { planted: () => planted },
  );
  let story: NormalizedStoryV2 = parseStoryV2OrThrow(raw());
  let active = options.active ?? "camp";
  let values: Record<string, unknown> = options.values ?? {};
  const store = fresh();
  const jobs: Array<() => Promise<void>> = [];
  let replaced = 0;
  const coordinator = new ExpansionCoordinator({
    hosts: { player: { getPlayerName: () => "Max" } },
    ownership: options.ownership ?? testOwnership(),
    getStory: () => story,
    getStoryRaw: () => raw(),
    getState: () => ({ activeCheckpointId: active, boundary: 4, blackboard: { values, versions: {}, latched: {} } }) as unknown as EngineState,
    getExpansion: options.expansion ?? (() => store),
    model,
    getCanon: () => "",
    getFactTexts: () => [],
    replaceStory: () => { replaced += 1; },
    setStatus: () => undefined,
    persist: async () => undefined,
    notify: () => undefined,
  } as never);
  const schedule = (_reason: string, run: () => Promise<void>) => { jobs.push(run); };
  return {
    coordinator, store, schedule, jobs, replaced: () => replaced, plant: (text: string | null) => { planted = text; },
    setActive: (id: string) => { active = id; },
    setValues: (next: Record<string, unknown>) => { values = next; },
    setStory: (next: NormalizedStoryV2) => { story = next; },
    drain: async () => { while (jobs.length) await jobs.shift()?.(); },
  };
}

describe("v2.8 19: scheduling a pool", () => {
  it("queues one pool for the stretch from the checkpoint before it, under its own key and kind", () => {
    const env = harness();
    expect(env.coordinator.scheduleForActive(env.schedule)).toBe(false);
    expect(Object.keys(env.store.entries)).toEqual(["road->encounters"]);
    expect(env.store.entries["road->encounters"]).toMatchObject({ kind: "encounters", status: "queued", contract: EXPANSION_CONTRACT, stubId: "road", targetAnchorId: "walls", origin: "active" });
    expect(env.jobs).toHaveLength(1);
    env.coordinator.scheduleForActive(env.schedule);
    expect(env.jobs).toHaveLength(1);
  });

  it("arriving at the stretch finds the same entry rather than a second one", () => {
    const env = harness();
    env.coordinator.scheduleForActive(env.schedule);
    env.setActive("road");
    env.coordinator.scheduleForActive(env.schedule);
    expect(Object.keys(env.store.entries)).toEqual(["road->encounters"]);
    expect(env.jobs).toHaveLength(1);
  });

  it("a plain open stretch and a checkpoint with no stretch schedule nothing", () => {
    const env = harness();
    env.setStory(parseStoryV2OrThrow(raw(null)));
    env.coordinator.scheduleForActive(env.schedule);
    env.setActive("walls");
    env.coordinator.scheduleForActive(env.schedule);
    expect(env.store.entries).toEqual({});
  });

  it("a failed pool is asked again once, and not a third time", async () => {
    const env = harness();
    env.plant("not json");
    env.coordinator.scheduleForActive(env.schedule);
    await env.drain();
    expect(env.store.entries["road->encounters"]).toMatchObject({ status: "failed", attempts: 1 });
    env.coordinator.scheduleForActive(env.schedule);
    expect(env.jobs).toHaveLength(1);
    await env.drain();
    expect(env.store.entries["road->encounters"]).toMatchObject({ status: "failed", attempts: 2 });
    env.coordinator.scheduleForActive(env.schedule);
    expect(env.jobs).toHaveLength(0);
  });
});

describe("v2.8 19: generating, using and invalidating a pool", () => {
  it("generates the pool from the checkpoint before the stretch without merging anything into the graph", async () => {
    const env = harness();
    expect(await env.coordinator.runNow(GOOD)).toBe(true);
    const pool = env.store.entries["road->encounters"];
    expect(pool).toMatchObject({ kind: "encounters", status: "validated", beats: [], insertedCheckpointIds: [], needsReview: false });
    expect(pool.encounters?.map((encounter) => encounter.title)).toEqual(["A broken cart", "Smoke on the ridge", "The toll keeper", "A lost goat"]);
    expect(env.replaced()).toBe(0);
  });

  it("a pool with an outcome or a task in it fails with the reason and is kept for the author", async () => {
    const env = harness();
    await env.coordinator.runNow(JSON.stringify({ encounters: [{ title: "A broken cart", situation: "A merchant's cart lies tipped at the roadside.", objective: "Fix it." }] }));
    expect(env.store.entries["road->encounters"].status).toBe("failed");
    expect(env.store.entries["road->encounters"].lastError).toContain("an encounter carries no outcome");
  });

  it("is committed as in use at the next boundary like a chain, still without touching the graph", async () => {
    const env = harness();
    await env.coordinator.runNow(GOOD);
    expect(await env.coordinator.commitValidated()).toBe(true);
    expect(env.store.entries["road->encounters"].status).toBe("inserted");
    expect(env.replaced()).toBe(1);
  });

  it("a drifted blackboard never stales a pool: it has no target snapshot to drift from", async () => {
    const env = harness({ active: "road" });
    await env.coordinator.runNow(GOOD);
    env.setValues({ left_camp: true, reached_walls: false, anything: 9 });
    env.coordinator.revalidateInserted();
    expect(env.store.entries["road->encounters"].status).toBe("validated");
  });

  it("an author's regenerate re-runs a failed pool", async () => {
    const env = harness();
    await env.coordinator.runNow("bad");
    expect(env.store.entries["road->encounters"].status).toBe("failed");
    env.plant(GOOD);
    expect(await env.coordinator.regenerate("road->encounters")).toBe(true);
    expect(env.store.entries["road->encounters"].status).toBe("validated");
  });

  it("is dropped when the story stops offering encounters or loses the stretch, and kept while it still does", async () => {
    const env = harness();
    await env.coordinator.runNow(GOOD);
    expect(env.coordinator.pruneMissing(parseStoryV2OrThrow(raw()))).toBe(0);
    expect(env.coordinator.pruneMissing(parseStoryV2OrThrow(raw(null)))).toBe(1);
    expect(env.store.entries).toEqual({});
  });
});

describe("v2.8 19: the cache contract", () => {
  const stored = (contract: number, kind?: string): ExpansionCacheEntry => ({
    key: "road->encounters", ...(kind ? { kind } : {}), status: "inserted", contract, sourceCheckpointId: "road", stubId: "road", targetAnchorId: "walls", basis: {},
    blackboardVersionSum: 0, beats: [], needsReview: false, verdicts: [], codeCheck: null, insertedCheckpointIds: [], lastError: null, attempts: 1, origin: "active", updatedAt: "t",
  }) as unknown as ExpansionCacheEntry;
  const hydrate = (entry: ExpansionCacheEntry) => sanitizeExpansion({ expansion: { entries: { [entry.key]: entry }, scheduler: { queueDepth: 0, inFlight: false, lastError: null } } } as unknown as RuntimeExtras);

  it("drops an entry from the previous contract, pool or chain, and keeps the current one", () => {
    expect(EXPANSION_CONTRACT).toBe(3);
    expect(hydrate(stored(EXPANSION_CONTRACT - 1, "encounters")).entries).toEqual({});
    expect(hydrate(stored(EXPANSION_CONTRACT - 1)).entries).toEqual({});
    expect(Object.keys(hydrate(stored(EXPANSION_CONTRACT, "encounters")).entries)).toEqual(["road->encounters"]);
  });

  it("an unfinished pool from a closed chat comes back as stale, never as running", () => {
    const entries = hydrate({ ...stored(EXPANSION_CONTRACT, "encounters"), status: "generating", origin: "lookahead" } as ExpansionCacheEntry).entries;
    expect(entries["road->encounters"]).toMatchObject({ status: "stale", lastError: "Interrupted before it finished" });
  });
});

describe("v2.8 19: a pool is owned by the chat that asked for it", () => {
  const context: RunContext = { chatId: "chat-a", storyId: "pool-coordinator", storyHash: "h1", sessionEpoch: 1, windowRevision: 0 };
  const ownership: RunOwnership = { mint: (window) => mintToken(context, window), check: (token) => tokenMatches(context, token) };

  const chats = () => ({ "chat-a": fresh(), "chat-b": fresh() } as Record<string, ExpansionRuntimeState>);

  it("writes nothing into the chat that replaced it, and leaves its in-flight marker in its own chat", async () => {
    context.chatId = "chat-a";
    const stores = chats();
    const env = harness({ ownership, expansion: () => stores[String(context.chatId)] });
    env.plant(GOOD);
    const pending = env.coordinator.runNow();
    context.chatId = "chat-b";
    context.sessionEpoch += 1;
    await pending;
    expect(stores["chat-b"].entries).toEqual({});
    expect(stores["chat-a"].entries["road->encounters"].status).toBe("generating");
  });

  it("control: the same sequence without a switch lands the pool in the chat that asked", async () => {
    context.chatId = "chat-a";
    const stores = chats();
    const env = harness({ ownership, expansion: () => stores[String(context.chatId)] });
    await env.coordinator.runNow(GOOD);
    expect(stores["chat-a"].entries["road->encounters"].status).toBe("validated");
    expect(stores["chat-b"].entries).toEqual({});
  });

  it("control: an unowned run files the pool into the chat that replaced it", async () => {
    context.chatId = "chat-a";
    const stores = chats();
    const env = harness({ expansion: () => stores[String(context.chatId)] });
    const pending = env.coordinator.runNow(GOOD);
    context.chatId = "chat-b";
    await pending;
    expect(stores["chat-b"].entries["road->encounters"].status).toBe("validated");
  });
});
