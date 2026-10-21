import { parseStoryOrThrow } from "@engine/index";
import { posesToPrepare } from "./prepareList";

const story = (extra: Record<string, unknown> = {}) => parseStoryOrThrow({ title: "Poses", description: "Synthetic pose preparation.",
  roster: [{ id: "arin", name: "Arin", sprites: { pose: "stand_lean" } }, { id: "bo", name: "Bo" }, { id: "cy", name: "Cy" }],
  qualities: [{ key: "mood", type: "string", source: "extractor", rubric: "Mood." }],
  checkpoints: [
    { id: "start", name: "Start", type: "anchor", start: true, objective: "Begin.", effects: { stage: { cast: { arin: { pose: "sit_chair" }, bo: { pose: "stand_arms_crossed" } } } } },
    { id: "later", name: "Later", type: "anchor", objective: "Go on.", effects: { stage: { cast: { bo: { pose: "sit_chair", set: "custom" }, cy: { hidden: true, pose: "sit_chair" } } } } },
  ],
  transitions: [], ...extra });

test("the preparation list holds each member's default pose and every pose a checkpoint directs, once each", () => {
  const jobs = posesToPrepare(story(), []).map((job) => `${job.member}:${job.pose.id}`).sort();
  expect(jobs).toEqual(["arin:sit_chair", "arin:stand_lean", "bo:stand_arms_crossed"]);
});

test("a directed set, a hidden member and the plain standing pose without a changed look are not rendered ahead", () => {
  const jobs = posesToPrepare(story(), []);
  expect(jobs.some((job) => job.member === "cy")).toBe(false);
  expect(jobs.some((job) => job.member === "bo" && job.pose.id === "sit_chair")).toBe(false);
  expect(jobs.every((job) => job.pose.id !== "stand_relaxed")).toBe(true);
});
