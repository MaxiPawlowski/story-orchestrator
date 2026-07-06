import type { NormalizedStoryV2 } from "@engine/index";
import { scheduleForcedCues } from "./cues";
import type { ExtractionScheduler } from "./scheduler";
import type { SharedReadWindow } from "./types";

const storyWith = (trigger: string): NormalizedStoryV2 =>
  ({ outgoingByCheckpoint: { cp1: [{ from: "cp1", to: "cp2", extractor_trigger: trigger }] } }) as unknown as NormalizedStoryV2;

const windowOf = (...texts: string[]): SharedReadWindow => ({
  from: 0,
  to: texts.length - 1,
  messages: texts.map((text, index) => ({ index, messageId: index, speaker: index % 2 ? "Assistant" : "User", text })),
});

const captureScheduler = () => {
  const reasons: string[] = [];
  const scheduler = { schedule: (job: { reason: string }) => reasons.push(job.reason) } as unknown as ExtractionScheduler;
  return { scheduler, reasons };
};

describe("scheduleForcedCues", () => {
  it("fires a cue when a trigger matches a mid-window message, not only the last", () => {
    const { scheduler, reasons } = captureScheduler();
    scheduleForcedCues(storyWith("open the vault"), "cp1", scheduler, windowOf("I open the vault door", "The lock clicks shut again"));
    expect(reasons).toEqual(["cue:cp1->cp2"]);
  });

  it("does not fire when no message in the window matches", () => {
    const { scheduler, reasons } = captureScheduler();
    scheduleForcedCues(storyWith("open the vault"), "cp1", scheduler, windowOf("nothing relevant", "still nothing"));
    expect(reasons).toEqual([]);
  });

  it("ignores an empty window", () => {
    const { scheduler, reasons } = captureScheduler();
    scheduleForcedCues(storyWith("x"), "cp1", scheduler, { from: 0, to: -1, messages: [] });
    expect(reasons).toEqual([]);
  });
});
