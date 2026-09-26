import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { parseStoryV2OrThrow, type NormalizedStoryV2 } from "@engine/index";
import { replayGate, type ReplayEdge, type ReplayHistory } from "./gateReplay";

const RECORDS = join(__dirname, "..", "..", "test", "journeys", "records", "v2.5-plan07");

const walk = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
}) : []);

interface RecordedRun { file: string; story: NormalizedStoryV2; history: ReplayHistory & { log: Array<{ fired: { effects?: { progress?: unknown } } | null }> } }

const runsIn = (file: string): RecordedRun[] => {
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { stories?: Record<string, unknown> } & Record<string, unknown>;
  const records = parsed.stories ? Object.values(parsed.stories) : [parsed];
  return records.flatMap((record) => {
    const entry = record as { pinnedStory?: unknown; engineHistory?: RecordedRun["history"] };
    return entry.pinnedStory && entry.engineHistory ? [{ file, story: parseStoryV2OrThrow(entry.pinnedStory), history: entry.engineHistory }] : [];
  });
};

const runs = walk(RECORDS).filter((path) => /engine-history-.*\.json$/.test(path)).flatMap(runsIn);

(runs.length ? describe : describe.skip)("v2.5 plan 07 A3 correctness check over archived J3/J7 engine histories", () => {
  it("replaying every unchanged gate reproduces each recorded fired boundary, 100%, and the runs carry a progress fire", () => {
    let progressFires = 0;
    for (const run of runs) {
      const edges: ReplayEdge[] = run.story.transitions.map((transition, order) => ({ from: transition.from, to: transition.to, gate: transition.gate, priority: transition.priority, order }));
      const declared = new Set(Object.keys(run.story.qualityByKey));
      progressFires += run.history.log.filter((entry) => entry.fired?.effects?.progress).length;
      for (const edge of edges) {
        const result = replayGate({ edge, siblings: edges, history: run.history, declared });
        const misses = result.rows.filter((row) => row.atSource && !row.manual && row.wouldFire !== row.recordedFire).map((row) => `${run.file}: ${edge.from}->${edge.to} at boundary ${row.boundary}`);
        expect(misses).toEqual([]);
      }
    }
    expect(progressFires).toBeGreaterThan(0);
  });
});
