import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseStory, type NormalizedStory } from "@engine/index";
import { anchorProgress, anchorsToEnding, pathProgress, relaxActive, relaxCap, RELAX_BOUNDARIES, type TensionPoint } from "./arc";
import { getSteeringHint } from "./steering";

const dir = join(__dirname, "../../test/fixtures");
const stories: NormalizedStory[] = readdirSync(dir).filter((name) => name.endsWith(".story.json")).sort().flatMap((name) => {
  const parsed = parseStory(JSON.parse(readFileSync(join(dir, name), "utf8").replace(/^﻿/, "")));
  return Array.isArray(parsed) ? [] : [parsed];
});

const PATH_LIMIT = 200;

function playedPaths(story: NormalizedStory): string[][] {
  const paths: string[][] = [];
  const walk = (path: string[]) => {
    if (paths.length >= PATH_LIMIT) return;
    const out = story.outgoingByCheckpoint[path[path.length - 1]] ?? [];
    if (!out.length) {
      paths.push(path);
      return;
    }
    for (const transition of out) if (!path.includes(transition.to)) walk([...path, transition.to]);
  };
  walk([story.startCheckpointId]);
  return paths;
}

const stateAt = (story: NormalizedStory, path: string[]) => ({
  visitedPath: path,
  activeCheckpointId: path[path.length - 1],
  visitedAnchors: path.filter((id) => story.checkpointById[id]?.type === "anchor"),
});

describe("v3.0 42a F5: path-aware expected tension and relax window", () => {
  it("counts anchors on the shortest remaining road to an ending", () => {
    const branching = stories.find((story) => story.title === "Branching Vault");
    expect(branching).toBeDefined();
    if (!branching) return;
    expect(anchorsToEnding(branching, "start")).toBe(1);
    expect(anchorsToEnding(branching, "alarm")).toBe(1);
    expect(anchorsToEnding(branching, "exit")).toBe(0);
  });

  it("F5 hard: path progress never decreases along any played path of the fixture stories", () => {
    let checked = 0;
    for (const story of stories) {
      for (const path of playedPaths(story)) {
        let last = 0;
        for (let cut = 1; cut <= path.length; cut += 1) {
          for (const turns of [0, 3, 12]) {
            const progress = pathProgress(story, stateAt(story, path.slice(0, cut)), turns);
            expect(progress).toBeGreaterThanOrEqual(last - 1e-9);
            if (turns === 12) last = progress;
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("F5 before -> after (informational): share of played paths whose final anchor reaches progress >= 0.95", () => {
    const tally = { paths: 0, before: 0, after: 0, branchyPaths: 0, branchyBefore: 0, branchyAfter: 0 };
    for (const story of stories) {
      const anchors = story.checkpoints.filter((checkpoint) => checkpoint.type === "anchor").length;
      for (const path of playedPaths(story)) {
        const final = path[path.length - 1];
        if (story.checkpointById[final]?.type !== "anchor") continue;
        const state = stateAt(story, path);
        const before = (anchorProgress(story, state) ?? 0) >= 0.95;
        const after = pathProgress(story, state, 99) >= 0.95;
        const branchy = state.visitedAnchors.length < anchors;
        tally.paths += 1;
        tally.before += before ? 1 : 0;
        tally.after += after ? 1 : 0;
        if (branchy) {
          tally.branchyPaths += 1;
          tally.branchyBefore += before ? 1 : 0;
          tally.branchyAfter += after ? 1 : 0;
        }
      }
    }
    process.stdout.write(`${JSON.stringify({ stories: stories.length, ...tally })}\n`);
    expect(tally.paths).toBeGreaterThan(20);
    expect(tally.after).toBe(tally.paths);
  });

  it("F5 hard: no escalate hint inside a relax window; the window ends after three boundaries; a peak beat keeps its target", () => {
    const history: TensionPoint[] = [{ messageId: 2, smoothed: 0.5 }, { messageId: 4, smoothed: 0.8 }, { messageId: 6, smoothed: 0.85 }, { messageId: 8, smoothed: 0.55 }];
    const log = (upTo: number) => Array.from({ length: upTo / 2 }, (_, index) => ({ context: { lastMessageId: (index + 1) * 2, chatLength: (index + 1) * 2 + 1 } }));
    let escalations = 0;
    let windows = 0;
    for (const lastMessage of [8, 10, 12, 14, 16]) {
      const relax = relaxActive(history, log(lastMessage));
      if (relax) windows += 1;
      const expected = relaxCap(1, relax, undefined);
      const hint = getSteeringHint(0.55, expected);
      if (relax && hint?.direction === "escalate") escalations += 1;
    }
    expect(escalations).toBe(0);
    expect(windows).toBe(RELAX_BOUNDARIES);
    expect(relaxCap(1, true, "peak")).toBe(1);
    expect(relaxActive([{ messageId: 2, smoothed: 0.8 }, { messageId: 4, smoothed: 0.5 }], log(4))).toBe(false);
    expect(relaxActive([...history, { messageId: 10, smoothed: 0.9 }], log(10))).toBe(false);
  });
});
