import type { ExtraGateSource } from "@extraction/index";
import type { RuntimeManager } from "../runtimeManager";
import { SWIPE_KEY_PARTS, SwipeCache, swipeKeyOf, type SwipeKey } from "./swipeCache";
import { chatStore, restorePoint, scopeHash, SwipeBack, type SwipeBackHost, type SwipeEntry } from "./swipeBack";
import { SPIKE_STORY, SpikeWorld, differentText, projectExact, randomScript, seededRandom, type ExactProjection, type SpikeTurn } from "../../../test/support/spikeHarness";
import { spikeContext } from "../../../test/support/spikeHost";
import { defaultGlobalSettings, sanitizeGlobalSettings } from "../settingsModel";

jest.mock("@services/STAPI", () => jest.requireActual("../../../test/support/spikeHost").spikeStapi);

type Arm = "spike" | "off" | "no-pending";

const SEEDS = [1, 2, 3, 4];
const LAMP_STORY = JSON.stringify((({ qualities, ...story }) => ({ ...story, qualities: [...qualities, { key: "lamp", type: "bool", source: "extractor", rubric: "Is the lamp lit?" }] }))(JSON.parse(SPIKE_STORY)));
const CUTS = 200;

const chatNow = () => ({ id: String(spikeContext.chatId ?? ""), rows: spikeContext.chat });

interface HostOptions {
  requeue?: boolean;
  sources?: () => ExtraGateSource[];
}

const hostOf = (manager: RuntimeManager, options: HostOptions = {}): SwipeBackHost => ({
  getEngineState: () => manager.getEngineState(),
  getStory: () => manager.getStory(),
  getOwnership: () => manager.getOwnership(),
  getExpansionGateSources: () => options.sources?.() ?? manager.getExpansionGateSources(),
  onBoundary: (listener) => manager.onBoundary(listener),
  subscribe: (listener) => manager.subscribe(listener),
  loadSelectedFromChat: () => manager.loadSelectedFromChat(),
  notify: () => manager.notify(),
  chatSave: manager.chatSave,
  writes: { pending: () => manager.writes.pending(), requeue: (entries) => { if (options.requeue !== false) manager.writes.requeue(entries); } },
});

const armed = async (arm: Arm, options: { sources?: () => ExtraGateSource[]; cache?: SwipeCache<SwipeEntry>; story?: string } = {}) => {
  const world = await SpikeWorld.open(options.story);
  const host: SwipeBackHost = arm === "spike" && !options.sources ? world.manager : hostOf(world.manager, { requeue: arm !== "no-pending", sources: options.sources });
  const spike = new SwipeBack({ host, store: chatStore, enabled: () => arm !== "off", chat: chatNow, ...(options.cache ? { cache: options.cache } : {}) });
  world.bridge.setMutationSeam((kind, messageId) => spike.seam(kind, messageId));
  return { world, spike };
};

interface SwipeOutcome {
  recorded: ExactProjection;
  onB: ExactProjection;
  after: ExactProjection;
  hits: number;
  readsDuringSwipeBack: number;
}

const swipeBackCut = async (turns: SpikeTurn[], other: string, arm: Arm): Promise<SwipeOutcome> => {
  const { world, spike } = await armed(arm);
  await world.play(turns);
  const id = spikeContext.chat.length - 1;
  const recorded = projectExact(world.manager);
  await world.newSwipe(id, other);
  const onB = projectExact(world.manager);
  const reads = world.reader.reads;
  await world.swipeTo(id, 0);
  const outcome = { recorded, onB, after: projectExact(world.manager), hits: spike.stats.hits, readsDuringSwipeBack: world.reader.reads - reads };
  spike.dispose();
  world.close();
  return outcome;
};

const cutsOf = (seed: number) => {
  const random = seededRandom(seed);
  return Array.from({ length: CUTS }, () => {
    const turns = randomScript(random);
    return { turns, other: differentText(random, turns[turns.length - 1].reply) };
  });
};

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

const firstUnequal = async (arm: Arm) => {
  for (const seed of SEEDS) {
    for (const [index, cut] of cutsOf(seed).entries()) {
      const outcome = await swipeBackCut(cut.turns, cut.other, arm);
      if (!same(outcome.after, outcome.recorded)) return { seed, cut: index };
    }
  }
  return null;
};

jest.setTimeout(900000);

describe("v2.5 plan 09 SP1 S1: swipe-back replay equality (4 seeds x 200 cuts, real manager)", () => {
  it("every cut is back at A's recorded state after A, B and back to A, from the cache", async () => {
    const unequal: Array<{ seed: number; cut: number; recorded: ExactProjection; after: ExactProjection }> = [];
    const tally = { cuts: 0, hits: 0, readsDuringSwipeBack: 0, pendingRestored: 0, memoryRows: 0, movedByB: 0 };
    for (const seed of SEEDS) {
      for (const [index, cut] of cutsOf(seed).entries()) {
        const outcome = await swipeBackCut(cut.turns, cut.other, "spike");
        tally.cuts += 1;
        tally.hits += outcome.hits;
        tally.readsDuringSwipeBack += outcome.readsDuringSwipeBack;
        tally.pendingRestored += outcome.recorded.pending.length ? 1 : 0;
        tally.memoryRows += outcome.recorded.memory.length;
        tally.movedByB += same({ ...outcome.onB, boundary: 0 }, { ...outcome.recorded, boundary: 0 }) ? 0 : 1;
        if (!same(outcome.after, outcome.recorded)) unequal.push({ seed, cut: index, recorded: outcome.recorded, after: outcome.after });
      }
    }
    console.log(`SP1 S1 ${JSON.stringify({ ...tally, equal: tally.cuts - unequal.length, unequal: unequal.length, first: unequal[0] ?? null })}`);
    expect(unequal.slice(0, 3)).toEqual([]);
    expect(tally.cuts).toBe(SEEDS.length * CUTS);
    expect(tally.hits).toBe(tally.cuts);
    expect(tally.readsDuringSwipeBack).toBe(0);
    expect(tally.pendingRestored).toBeGreaterThan(tally.cuts / 2);
    expect(tally.memoryRows).toBeGreaterThan(tally.cuts);
    expect(tally.movedByB).toBeGreaterThan(tally.cuts / 2);
  });

  it("control: with the flag off (today's rollback) some cut is not back at A's state", async () => {
    const found = await firstUnequal("off");
    console.log(`SP1 S1 control flag-off first unequal ${JSON.stringify(found)}`);
    expect(found).not.toBeNull();
  });

  it("control: a restore without the queued writes is not back at A's state on some cut", async () => {
    const found = await firstUnequal("no-pending");
    console.log(`SP1 S1 control no-pending first unequal ${JSON.stringify(found)}`);
    expect(found).not.toBeNull();
  });
});

describe("v2.5 plan 09 SP1 S2: no stale hit", () => {
  const base: SwipeKey = { chat: "chat-a", message: 3, text: "t1", scope: "s1", story: "spike-edits@1" };
  const variants: Record<keyof SwipeKey, SwipeKey> = {
    chat: { ...base, chat: "chat-b" },
    message: { ...base, message: 5 },
    text: { ...base, text: "t2" },
    scope: { ...base, scope: "s2" },
    story: { ...base, story: "spike-edits@2" },
  };
  const script: SpikeTurn[] = [{ user: "rain", reply: "song" }, { user: "fire go", reply: "bread" }];

  it("a key that differs in exactly one part misses, and the stored key hits", () => {
    const cache = new SwipeCache<string>();
    cache.put(base, "A");
    expect(cache.get({ ...base })).toBe("A");
    expect(SWIPE_KEY_PARTS.map((part) => [part, cache.get(variants[part])])).toEqual(SWIPE_KEY_PARTS.map((part) => [part, null]));
  });

  it("control: a key that drops a part hits the variant that differs only in that part", () => {
    for (const part of SWIPE_KEY_PARTS) {
      const mutant = new SwipeCache<string>(32, (key) => swipeKeyOf(key, SWIPE_KEY_PARTS.filter((kept) => kept !== part)));
      mutant.put(base, "A");
      expect([part, mutant.get(variants[part])]).toEqual([part, "A"]);
    }
  });

  const mutantCache = (part?: keyof SwipeKey) => (part ? new SwipeCache<SwipeEntry>(32, (key) => swipeKeyOf(key, SWIPE_KEY_PARTS.filter((kept) => kept !== part))) : undefined);

  const textCase = async (part?: keyof SwipeKey) => {
    const { world, spike } = await armed("spike", { cache: mutantCache(part) });
    await world.play(script);
    const id = spikeContext.chat.length - 1;
    await world.newSwipe(id, "stone path");
    const row = spikeContext.chat[id];
    row.swipes = ["bread key", ...(row.swipes ?? []).slice(1)];
    await world.swipeTo(id, 0);
    const hits = spike.stats.hits;
    world.close();
    return hits;
  };

  const versionCase = async (part?: keyof SwipeKey) => {
    const { world, spike } = await armed("spike", { cache: mutantCache(part) });
    await world.play(script);
    const id = spikeContext.chat.length - 1;
    await world.newSwipe(id, "stone path");
    const pinnedBefore = chatStore.read()?.contentHashAtLoad;
    const next = { ...JSON.parse(SPIKE_STORY), description: "Same graph, new words." };
    await world.manager.importStory(JSON.stringify(next));
    const update = await world.manager.applyStoryUpdate();
    await world.settle();
    const repinned = chatStore.read()?.contentHashAtLoad !== pinnedBefore;
    await world.swipeTo(id, 0);
    const hits = spike.stats.hits;
    world.close();
    return { hits, repinned, update: update.classification };
  };

  const scopeCase = async (part?: keyof SwipeKey) => {
    const extra: ExtraGateSource[] = [];
    const { world, spike } = await armed("spike", { sources: () => extra, cache: mutantCache(part), story: LAMP_STORY });
    await world.play(script);
    const id = spikeContext.chat.length - 1;
    await world.newSwipe(id, "stone path");
    const story = world.manager.getStory();
    const record = chatStore.read();
    const point = story && record ? restorePoint(record.engineHistory, id) : null;
    if (!story || !point) throw new Error("no restore point");
    const before = scopeHash(story, point, extra);
    const source: ExtraGateSource = { checkpointId: point.activeCheckpointId, gate: { q: "lamp", op: "==", v: true } };
    if (scopeHash(story, point, [source]) === before) throw new Error("the gate source does not change the restore point's scope");
    extra.push(source);
    await world.swipeTo(id, 0);
    const hits = spike.stats.hits;
    world.close();
    return hits;
  };

  it("(text) the A swipe rewritten after it was read: 0 hits; a key without the text hits", async () => {
    await expect(textCase()).resolves.toBe(0);
    await expect(textCase("text")).resolves.toBe(1);
  });

  it("(story copy) a compatible update between B and the swipe-back: 0 hits; a key without the story copy hits", async () => {
    const kept = await versionCase();
    expect(kept).toEqual({ hits: 0, repinned: true, update: "compatible" });
    await expect(versionCase("story")).resolves.toEqual({ hits: 1, repinned: true, update: "compatible" });
  });

  it("(scope) the restore point's scope changes, text and version do not: 0 hits; a key without the scope hits", async () => {
    await expect(scopeCase()).resolves.toBe(0);
    await expect(scopeCase("scope")).resolves.toBe(1);
  });

  it("control: the same script with nothing changed hits", async () => {
    const { world, spike } = await armed("spike");
    await world.play(script);
    const id = spikeContext.chat.length - 1;
    await world.newSwipe(id, "stone path");
    await world.swipeTo(id, 0);
    expect(spike.stats.hits).toBe(1);
    world.close();
  });
});

describe("v2.5 plan 09 SP1: the install-wide flag and the seam", () => {
  it("is off by default and on only for a literal true", () => {
    expect(defaultGlobalSettings().spikes.swipeBackCache).toBe(false);
    expect(sanitizeGlobalSettings({ spikes: { swipeBackCache: 1 } }).spikes.swipeBackCache).toBe(false);
    expect(sanitizeGlobalSettings({ spikes: { swipeBackCache: true } }).spikes.swipeBackCache).toBe(true);
  });

  it("only a swipe is looked up; with the flag off nothing is captured or hit", async () => {
    const { world, spike } = await armed("off");
    await world.play([{ user: "rain", reply: "song" }]);
    const id = spikeContext.chat.length - 1;
    expect(spike.seam("edit", id)).toBeNull();
    await world.newSwipe(id, "stone");
    await world.swipeTo(id, 0);
    expect(spike.stats).toEqual({ captures: 0, hits: 0, misses: 0 });
    world.close();
  });
});
