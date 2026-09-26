import { readFileSync } from "fs";
import { join } from "path";
import { StoryEngine, parseStoryV2OrThrow, TENSION_CURRENT_KEY } from "@engine/index";
import { unitDraw } from "@engine/chance";
import {
  COMPLICATION_KEY, composeComplication, createComplicationSeam, deriveReleases, pendingRelease, readComplicationPools,
  type ComplicationRelease, type ReleaseInput,
} from "./sp6Complications";
import { complicationView, installSpikes, type SpikePort } from "./install";
import { defaultSpikeFlags } from "../spikeFlags";
import { spikeSeams } from "../spikeSeams";

const raw = JSON.parse(readFileSync(join(__dirname, "../../../test/fixtures/sp6-complications.story.json"), "utf8"));
const story = parseStoryV2OrThrow(raw);
const pools = readComplicationPools(raw);
const BOUNDARIES = 150;
const CUTS = 100;
const SEEDS = [5, 17, 29, 43];

const drive = (engine: StoryEngine, seed: number, from: number, to: number) => {
  for (let index = from; index < to; index += 1) {
    const tension = Number((unitDraw(["sp6-k1-tension", seed, index]) * 0.7).toFixed(3));
    const arrived = unitDraw(["sp6-k1-arrived", seed, index]) < 0.2;
    engine.enqueue({
      source: "extractor",
      blackboardVersionSum: 0,
      turnRange: { from: index, to: index },
      deltas: [{ q: TENSION_CURRENT_KEY, v: tension, source: "extractor" }, { q: "arrived", v: arrived, source: "extractor" }],
    });
    engine.commitBoundary({ lastMessageId: index, chatLength: index + 1 });
  }
};

const input = (engine: StoryEngine): ReleaseInput => ({ story, pools, log: [...engine.stateLog], shape: null });

const freshEngine = () => {
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(story);
  return engine;
};

const replayMismatches = (seed: number, releasesOf: (engine: StoryEngine) => ComplicationRelease[]) => {
  const engine = freshEngine();
  drive(engine, seed, 0, BOUNDARIES);
  const original = releasesOf(engine);
  let mismatches = 0;
  for (let cut = 0; cut < CUTS; cut += 1) {
    const at = Math.floor(unitDraw(["sp6-k1-cut", seed, cut]) * BOUNDARIES);
    if (!engine.rollbackTo(at).ok) throw new Error(`rollback to ${at} was refused`);
    const truncated = releasesOf(engine);
    drive(engine, seed, at, BOUNDARIES);
    const replayed = releasesOf(engine);
    const prefixOk = JSON.stringify(truncated) === JSON.stringify(original.filter((release) => release.boundary <= at));
    if (!prefixOk || JSON.stringify(replayed) !== JSON.stringify(original)) mismatches += 1;
  }
  return { original, mismatches };
};

describe("SP6 K1: release and spent-ness are derived from the log", () => {
  it("reads the authored pools: strings get positional ids, objects keep theirs, complication_after defaults to 3", () => {
    expect(pools.camp).toEqual({ after: 3, items: [{ id: "c1", text: "A tent pole snaps in the wind." }, { id: "horses", text: "The horses bolt from the picket line." }, { id: "c3", text: "Smoke rises from the ridge to the north." }] });
    expect(pools.road.after).toBe(2);
    expect(readComplicationPools({ checkpoints: [{ id: "x", complications: ["a"] }] }).x.after).toBe(3);
  });

  it(`rollback + replay gives the same releases: ${SEEDS.length} seeds x ${CUTS} cuts over ${BOUNDARIES} boundaries`, () => {
    const measured = SEEDS.map((seed) => {
      const { original, mismatches } = replayMismatches(seed, (engine) => deriveReleases(input(engine)));
      return { seed, releases: original.length, mismatches };
    });
    console.log(`SP6 K1 replay: ${JSON.stringify(measured)}`);
    expect(measured.every((row) => row.releases > 0)).toBe(true);
    expect(measured.every((row) => row.mismatches === 0)).toBe(true);
  });

  it("an item is spent once per chat, across revisits of its checkpoint", () => {
    const engine = freshEngine();
    drive(engine, 5, 0, BOUNDARIES);
    const releases = deriveReleases(input(engine));
    const keys = releases.map((release) => `${release.checkpointId}:${release.id}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(releases.filter((release) => release.checkpointId === "camp").map((release) => release.id)).toEqual(["c1", "horses", "c3"].slice(0, releases.filter((release) => release.checkpointId === "camp").length));
  });

  it("a release lands at the Nth consecutive escalate boundary and is pending only while it is the newest boundary", () => {
    const engine = freshEngine();
    for (let index = 0; index < 3; index += 1) {
      engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: TENSION_CURRENT_KEY, v: 0.1, source: "extractor" }] });
      engine.commitBoundary({ lastMessageId: index, chatLength: index + 1 });
      if (index < 2) expect(pendingRelease(input(engine))).toBeNull();
    }
    expect(pendingRelease(input(engine))).toMatchObject({ id: "c1", checkpointId: "camp", boundary: 3 });
    engine.commitBoundary({ lastMessageId: 3, chatLength: 4 });
    expect(pendingRelease(input(engine))).toBeNull();
    expect(engine.rollbackTo(3).ok).toBe(true);
    expect(pendingRelease(input(engine))).toMatchObject({ id: "c1" });
    expect(engine.rollbackTo(2).ok).toBe(true);
    expect(deriveReleases(input(engine))).toEqual([]);
  });

  it("control: a hold boundary breaks the streak", () => {
    const engine = freshEngine();
    [0.1, 0.1, 0.6, 0.1, 0.1].forEach((value, index) => {
      engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: TENSION_CURRENT_KEY, v: value, source: "extractor" }] });
      engine.commitBoundary({ lastMessageId: index, chatLength: index + 1 });
    });
    expect(deriveReleases(input(engine))).toEqual([]);
  });

  it("control: spent-ness kept outside the log fails the same replay comparison", () => {
    const outside = new Set<string>();
    const naive = (engine: StoryEngine) => deriveReleases(input(engine)).map((release) => {
      const pool = pools[release.checkpointId].items;
      const item = pool.find((candidate) => !outside.has(`${release.boundary}:${candidate.id}`) && ![...outside].some((key) => key.endsWith(`:${candidate.id}`) && Number(key.split(":")[0]) < release.boundary)) ?? pool[0];
      outside.add(`${release.boundary}:${item.id}`);
      return { ...release, id: item.id };
    });
    expect(replayMismatches(5, naive).mismatches).toBeGreaterThan(0);
  });
});

describe("SP6 K2 machinery: the block rides the next loud generation only", () => {
  const harness = (flag = true) => {
    const engine = freshEngine();
    for (let index = 0; index < 3; index += 1) {
      engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: TENSION_CURRENT_KEY, v: 0.1, source: "extractor" }] });
      engine.commitBoundary({ lastMessageId: index, chatLength: index + 1 });
    }
    const writes: string[] = [];
    const prompt = { set: (key: string, text: string, depth: number) => writes.push(`set ${key}@${depth}: ${text}`), clear: (key: string) => writes.push(`clear ${key}`) };
    const seam = createComplicationSeam(() => (flag ? input(engine) : null), prompt);
    return { engine, writes, seam };
  };

  it("a loud generation carries the block and its close clears it", () => {
    const h = harness();
    h.seam({ kind: "opened", type: "normal", params: undefined });
    h.seam({ kind: "closed", reason: "ended" });
    expect(h.writes).toEqual([`set ${COMPLICATION_KEY}@5: ${composeComplication(story, pendingRelease(input(h.engine)) as ComplicationRelease)}`, `clear ${COMPLICATION_KEY}`]);
    expect(h.writes[0]).toContain("A tent pole snaps in the wind.");
    expect(h.writes[0]).toContain("Do not narrate the player's own words or decisions.");
  });

  it("quiet and impersonate generations never carry it, and a nested quiet one lifts it until the loud one resumes", () => {
    const h = harness();
    h.seam({ kind: "opened", type: "quiet", params: undefined });
    h.seam({ kind: "closed", reason: "ended" });
    h.seam({ kind: "opened", type: "impersonate", params: undefined });
    h.seam({ kind: "closed", reason: "ended" });
    expect(h.writes).toEqual([]);
    h.seam({ kind: "opened", type: "normal", params: undefined });
    h.seam({ kind: "nested", type: "quiet", params: undefined, withholds: true });
    h.seam({ kind: "reapply", chid: null });
    expect(h.writes.map((write) => write.split(":")[0])).toEqual([`set ${COMPLICATION_KEY}@5`, `clear ${COMPLICATION_KEY}`, `set ${COMPLICATION_KEY}@5`]);
  });

  it("once the next boundary commits the block is gone; a rollback to the release brings it back", () => {
    const h = harness();
    h.engine.commitBoundary({ lastMessageId: 3, chatLength: 4 });
    h.seam({ kind: "opened", type: "normal", params: undefined });
    expect(h.writes).toEqual([]);
    h.engine.rollbackTo(3);
    h.seam({ kind: "opened", type: "swipe", params: undefined });
    expect(h.writes).toHaveLength(1);
  });

  it("control: the flag off never writes", () => {
    const h = harness(false);
    h.seam({ kind: "opened", type: "normal", params: undefined });
    expect(h.writes).toEqual([]);
  });

  it("install: the view derives releases whatever the flag says, and the seam injects only with the flag on", () => {
    const engine = freshEngine();
    for (let index = 0; index < 3; index += 1) {
      engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: TENSION_CURRENT_KEY, v: 0.1, source: "extractor" }] });
      engine.commitBoundary({ lastMessageId: index, chatLength: index + 1 });
    }
    const writes: string[] = [];
    const port = (sp6Complications: boolean): SpikePort => ({
      flags: () => ({ ...defaultSpikeFlags(), sp6Complications }),
      chatId: () => "chat-a",
      storyId: () => "sp6-complications",
      boundary: () => engine.serialize().boundary,
      raw: () => raw,
      story: () => story,
      log: () => engine.stateLog,
      shape: () => null,
      prompt: { set: (key) => writes.push(`set ${key}`), clear: (key) => writes.push(`clear ${key}`) },
    });
    expect(complicationView(port(false))).toMatchObject({ flag: false, pending: { id: "c1" }, releases: [{ id: "c1" }] });
    const off = installSpikes(port(false), () => undefined);
    spikeSeams.generation?.({ kind: "opened", type: "normal", params: undefined });
    off();
    expect(writes).toEqual([]);
    const on = installSpikes(port(true), () => undefined);
    spikeSeams.generation?.({ kind: "opened", type: "normal", params: undefined });
    on();
    expect(writes).toEqual([`set ${COMPLICATION_KEY}`, `clear ${COMPLICATION_KEY}`]);
    expect(spikeSeams.generation).toBeUndefined();
  });
});
