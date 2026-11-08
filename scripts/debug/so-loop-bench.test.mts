import assert from "node:assert/strict";
import { test } from "node:test";
import { seamStats } from "./so-loop-bench.mts";

test("seam stats compare the wrap step with the clip's own frame steps", () => {
  const width = 4;
  const height = 2;
  const size = width * height;
  const frames = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22].map((value) => new Uint8Array(size).fill(value));
  const smooth = seamStats(Uint8Array.from(frames.flatMap((frame) => [...frame])), width, height);
  assert.equal(smooth.frames, 12);
  assert.equal(smooth.meanStep, 2);
  assert.equal(smooth.wrapStep, 22);
  assert.equal(smooth.seamBelowMax, false);
  const looped = [...frames.slice(0, 6), ...frames.slice(0, 6).reverse()];
  const loop = seamStats(Uint8Array.from(looped.flatMap((frame) => [...frame])), width, height);
  assert.equal(loop.wrapStep, 0);
  assert.equal(loop.seamBelowMax, true);
});
